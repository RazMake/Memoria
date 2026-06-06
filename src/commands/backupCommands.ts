/**
 * Commands for the Scheduled Backup feature:
 *   - memoria.createBackupProfile
 *   - memoria.runBackup
 *   - memoria.backupHistory
 */

import * as path from "path";
import * as fs from "fs";
import * as vscode from "vscode";
import type { BackupFeature } from "../features/backup/backupFeature";
import type { BackupProfile, DayOfWeek, BackupSchedule } from "../features/backup/types";
import { listProfileZips } from "../features/backup/zipCreator";
import type { TelemetryEmitter } from "../telemetry";

/** A workspace folder entry in the source tree selector. */
type FolderPick = vscode.QuickPickItem & {
    /** Workspace-relative POSIX path of the folder ("" = entire workspace). */
    relPath: string;
};

/** Folder names that are never useful to back up and are hidden from the tree selector. */
const FOLDER_TREE_SKIP = new Set([".git", "node_modules"]);

/** Maximum directory depth to enumerate for the source tree selector. */
const FOLDER_TREE_MAX_DEPTH = 4;

/**
 * Recursively enumerates folders under the workspace root, returning their
 * workspace-relative POSIX paths sorted depth-first for tree-style display.
 */
async function collectWorkspaceFolders(root: vscode.Uri): Promise<string[]> {
    const folders: string[] = [];

    async function walk(dir: vscode.Uri, rel: string, depth: number): Promise<void> {
        if (depth >= FOLDER_TREE_MAX_DEPTH) return;
        let entries: [string, vscode.FileType][];
        try {
            entries = await vscode.workspace.fs.readDirectory(dir);
        } catch {
            return;
        }
        const subdirs = entries
            .filter(([name, type]) => type === vscode.FileType.Directory && !FOLDER_TREE_SKIP.has(name))
            .map(([name]) => name)
            .sort((a, b) => a.localeCompare(b));
        for (const name of subdirs) {
            const childRel = rel ? `${rel}/${name}` : name;
            folders.push(childRel);
            await walk(vscode.Uri.joinPath(dir, name), childRel, depth + 1);
        }
    }

    await walk(root, "", 0);
    return folders;
}

// ---------------------------------------------------------------------------
// createBackupProfile command
// ---------------------------------------------------------------------------

export function createCreateBackupProfileCommand(
    backupFeature: BackupFeature,
    telemetry: TelemetryEmitter,
): () => Promise<void> {
    return async () => {
        const root = backupFeature.getWorkspaceRoot();
        if (!root) {
            vscode.window.showErrorMessage(
                "Memoria: No initialized workspace found. Initialize the workspace first.",
            );
            return;
        }

        // Step 1: Profile name
        const profileName = await vscode.window.showInputBox({
            title: "Create Backup Profile (1/7) — Profile name",
            prompt: "Enter a name for this backup profile (alphanumeric and hyphens only)",
            validateInput: (v) => {
                if (!v.trim()) return "Name cannot be empty";
                if (!/^[a-zA-Z0-9-]+$/.test(v)) return "Use only letters, numbers, and hyphens";
                const existing = backupFeature.getProfileNames();
                if (existing.includes(v)) return `Profile '${v}' already exists`;
                return undefined;
            },
        });
        if (!profileName) return;

        // Step 2: Source folders — tree selector, defaults to the entire workspace.
        const folderTree = await collectWorkspaceFolders(root);
        const wholeWorkspaceItem: FolderPick = {
            label: "$(root-folder) Entire workspace",
            description: "back up everything",
            relPath: "",
            picked: true,
        };
        const folderItems: FolderPick[] = folderTree.map((rel) => {
            const segments = rel.split("/");
            const depth = segments.length - 1;
            const name = segments[segments.length - 1]!;
            return {
                label: `${"\u2003".repeat(depth)}$(folder) ${name}`,
                description: rel,
                relPath: rel,
                picked: false,
            };
        });

        const sourceSelections = await vscode.window.showQuickPick<FolderPick>(
            [wholeWorkspaceItem, ...folderItems],
            {
                title: "Create Backup Profile (2/7) — Source folders",
                placeHolder: "Select folders to back up (defaults to the entire workspace)",
                canPickMany: true,
            },
        );
        if (!sourceSelections) return;

        const pickedWholeWorkspace = sourceSelections.some((s) => s.relPath === "");
        let sources: string[];
        if (pickedWholeWorkspace || sourceSelections.length === 0) {
            sources = ["**"];
        } else {
            sources = sourceSelections.map((s) => `${s.relPath}/**`);
        }

        // Step 3: Exclusion glob pattern(s) — optional, defaults to none.
        const excludeInput = await vscode.window.showInputBox({
            title: "Create Backup Profile (3/7) — Exclusion patterns (optional)",
            prompt: "Enter glob patterns to exclude, comma-separated. Leave empty for none.",
            placeHolder: "e.g. **/node_modules/**, **/.git/**",
        });
        if (excludeInput === undefined) return;
        const excludes = excludeInput
            .split(",")
            .map((e) => e.trim())
            .filter((e) => e.length > 0);

        // Step 4: Target folder
        const folderUris = await vscode.window.showOpenDialog({
            title: "Create Backup Profile (4/7) — Select target folder",
            canSelectFolders: true,
            canSelectFiles: false,
            canSelectMany: false,
        });
        if (!folderUris || folderUris.length === 0) return;
        const targetFolder = folderUris[0]!.fsPath;

        // Step 5: Schedule time
        const scheduleTime = await vscode.window.showInputBox({
            title: "Create Backup Profile (5/7) — Schedule time",
            prompt: "Enter the time of day for the backup (HH:MM, 24-hour format)",
            value: "18:00",
            validateInput: (v) => {
                if (!/^\d{2}:\d{2}$/.test(v)) return "Use HH:MM format (e.g. 18:00)";
                const [h, m] = v.split(":").map(Number);
                if (h! > 23 || m! > 59) return "Invalid time value";
                return undefined;
            },
        });
        if (!scheduleTime) return;

        // Step 6: Schedule days
        const dayItems: Array<{ label: string; value: DayOfWeek; picked: boolean }> = [
            { label: "Monday", value: "mon", picked: true },
            { label: "Tuesday", value: "tue", picked: true },
            { label: "Wednesday", value: "wed", picked: true },
            { label: "Thursday", value: "thu", picked: true },
            { label: "Friday", value: "fri", picked: true },
            { label: "Saturday", value: "sat", picked: false },
            { label: "Sunday", value: "sun", picked: false },
        ];
        const daySelections = await vscode.window.showQuickPick(dayItems, {
            title: "Create Backup Profile (6/7) — Schedule days",
            placeHolder: "Select days of the week",
            canPickMany: true,
        });
        if (!daySelections || daySelections.length === 0) return;
        const days = daySelections.map((d) => d.value);

        // Step 7: Retention
        const retentionStr = await vscode.window.showInputBox({
            title: "Create Backup Profile (7/7) — Retention count",
            prompt: "How many backups to keep? (oldest are deleted first)",
            value: "7",
            validateInput: (v) => {
                const n = parseInt(v, 10);
                if (isNaN(n) || n < 1) return "Enter a positive integer";
                return undefined;
            },
        });
        if (!retentionStr) return;
        const retention = parseInt(retentionStr, 10);

        const schedule: BackupSchedule = { time: scheduleTime, days };
        const profile: BackupProfile = {
            sources,
            exclude: excludes,
            targetFolder,
            schedule,
            retention,
        };

        await backupFeature.getConfigManager().upsertProfile(root, profileName, profile);
        telemetry.logUsage("backup/profileCreated", {
            sourceCount: String(sources.length),
            dayCount: String(days.length),
            retention: String(retention),
        });

        vscode.window.showInformationMessage(
            `Backup profile '${profileName}' created. Scheduler will start on next workspace activation.`,
        );

        // Refresh the feature to pick up the new profile
        await backupFeature.refresh(root, true);
    };
}

// ---------------------------------------------------------------------------
// runBackup command
// ---------------------------------------------------------------------------

export function createRunBackupCommand(
    backupFeature: BackupFeature,
): () => Promise<void> {
    return async () => {
        const profiles = backupFeature.getProfileNames();

        if (profiles.length === 0) {
            vscode.window.showInformationMessage(
                "Memoria: No backup profiles configured. Use 'Create Backup Profile' first.",
            );
            return;
        }

        let selected: string[];

        if (profiles.length === 1) {
            selected = [profiles[0]!];
        } else {
            const items = [
                { label: "$(check-all) All profiles", value: "__all__" },
                ...profiles.map((p) => ({ label: p, value: p })),
            ];
            const pick = await vscode.window.showQuickPick(items, {
                title: "Run Backup — Select profile",
                placeHolder: "Choose a profile to back up",
            });
            if (!pick) return;
            selected = pick.value === "__all__" ? profiles : [pick.value];
        }

        for (const name of selected) {
            await backupFeature.runProfile(name);
        }
    };
}

// ---------------------------------------------------------------------------
// backupHistory command
// ---------------------------------------------------------------------------

export function createBackupHistoryCommand(
    backupFeature: BackupFeature,
): () => Promise<void> {
    return async () => {
        const profiles = backupFeature.getProfileNames();
        const root = backupFeature.getWorkspaceRoot();
        if (!root || profiles.length === 0) {
            vscode.window.showInformationMessage("Memoria: No backup profiles configured.");
            return;
        }

        let profileName: string;

        if (profiles.length === 1) {
            profileName = profiles[0]!;
        } else {
            const pick = await vscode.window.showQuickPick(
                profiles.map((p) => ({ label: p })),
                { title: "Backup History — Select profile" },
            );
            if (!pick) return;
            profileName = pick.label;
        }

        const config = await backupFeature.getConfigManager().read(root);
        const profile = config?.profiles[profileName];
        if (!profile) return;

        const zips = await listProfileZips(profile.targetFolder, profileName);

        if (zips.length === 0) {
            vscode.window.showInformationMessage(
                `No backups found for profile '${profileName}'.`,
            );
            return;
        }

        const items = await Promise.all(
            zips.reverse().map(async (zipPath) => {
                let size = "";
                let mtime = "";
                try {
                    const stat = await fs.promises.stat(zipPath);
                    size = formatSize(stat.size);
                    mtime = stat.mtime.toLocaleString();
                } catch {
                    size = "unknown size";
                }
                return {
                    label: path.basename(zipPath),
                    description: size,
                    detail: mtime,
                    fsPath: zipPath,
                };
            }),
        );

        const selected = await vscode.window.showQuickPick(items, {
            title: `Backup History — ${profileName}`,
            placeHolder: "Select a backup to manage",
        });
        if (!selected) return;

        const action = await vscode.window.showQuickPick(
            [
                { label: "$(folder-opened) Reveal in Explorer", value: "reveal" },
                { label: "$(trash) Delete", value: "delete" },
            ],
            { title: `Action for: ${selected.label}` },
        );
        if (!action) return;

        if (action.value === "reveal") {
            await vscode.commands.executeCommand("revealFileInOS", vscode.Uri.file(selected.fsPath));
        } else if (action.value === "delete") {
            const confirm = await vscode.window.showWarningMessage(
                `Delete backup '${selected.label}'?`,
                { modal: true },
                "Delete",
            );
            if (confirm === "Delete") {
                try {
                    await fs.promises.unlink(selected.fsPath);
                    vscode.window.showInformationMessage(`Deleted: ${selected.label}`);
                } catch (err) {
                    vscode.window.showErrorMessage(
                        `Failed to delete: ${err instanceof Error ? err.message : String(err)}`,
                    );
                }
            }
        }
    };
}

function formatSize(bytes: number): string {
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${bytes} B`;
}
