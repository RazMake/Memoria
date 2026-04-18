// Handles UI-facing conflict resolution and file backup during workspace re-initialization.
// Separates user-interaction logic from the engine's orchestration so each can be tested
// and reasoned about independently.
//
// resolveConflicts() runs all three phases:
//   Phase A — parallel I/O: hash files, back up conflicts to WorkspaceInitializationBackups/
//   Phase B — folder QuickPick: user keeps (checked) or removes (unchecked) extra folders
//   Phase C — file QuickPick: user selects which conflicting files to open in diff after reinit

import * as vscode from "vscode";
import { computeFileHash } from "./hashUtils";
import type {
    BlueprintDefinition,
    BlueprintManifest,
    ReinitPlan,
    WorkspaceEntry,
} from "./types";

export class WorkspaceInitConflictResolver {
    constructor(
        private readonly fs: typeof vscode.workspace.fs
    ) {}

    /**
     * Analyses the current workspace state against the new blueprint definition, backs up
     * conflicting files to WorkspaceInitializationBackups/, then drives two QuickPick prompts
     * (folder cleanup + file merge selection).
     *
     * Returns a ReinitPlan on success, or undefined if the user cancels at either QuickPick.
     * Backups written during Phase A remain in WorkspaceInitializationBackups/ even if cancelled.
     */
    async resolveConflicts(
        workspaceRoot: vscode.Uri,
        currentManifest: BlueprintManifest,
        newDefinition: BlueprintDefinition,
        getSeedContent: (relativePath: string) => Promise<Uint8Array | null>
    ): Promise<ReinitPlan | undefined> {
        const isDifferentBlueprint = currentManifest.blueprintId !== newDefinition.id;

        // Phase A: Categorize all blueprint files — parallel I/O, no UI.
        const extraFolders = await this.findExtraFolders(workspaceRoot, newDefinition, isDifferentBlueprint);
        const flatFiles = this.flattenWorkspaceFiles(newDefinition.workspace);

        const mergeResults = await Promise.all(
            flatFiles.map((relativePath) =>
                this.categorizeFile(workspaceRoot, relativePath, currentManifest, getSeedContent)
            )
        );
        const toMergeList = mergeResults.filter((r): r is string => r !== null);

        // Phase B: Folder QuickPick — all checked by default (keep).
        const foldersToCleanup =
            extraFolders.length > 0 ? await this.promptFolderCleanup(extraFolders) : [];
        if (foldersToCleanup === undefined) {
            return undefined; // user cancelled
        }

        // Phase C: File merge QuickPick — none checked by default.
        const filesToDiff =
            toMergeList.length > 0 ? await this.promptFileMerge(toMergeList) : [];
        if (filesToDiff === undefined) {
            return undefined; // user cancelled
        }

        return { extraFolders, foldersToCleanup, toMergeList, filesToDiff };
    }

    /**
     * Shows a multi-select QuickPick listing extra folders.
     * All items are checked by default (keep in place).
     * Returns the subset the user unchecked (to move to WorkspaceInitializationBackups/),
     * or undefined if the user cancels.
     */
    async promptFolderCleanup(extraFolders: string[]): Promise<string[] | undefined> {
        const items = extraFolders.map((folder) => ({
            label: folder,
            description: "Keep in place",
            picked: true,
        }));

        const picked = await vscode.window.showQuickPick(items, {
            title: "Memoria: Extra folders found",
            placeHolder: "Uncheck folders to move them to WorkspaceInitializationBackups/ (checked = keep)",
            canPickMany: true,
        });

        if (picked === undefined) {
            return undefined; // user cancelled
        }

        // Return folders that were NOT checked — the user wants them moved.
        const keptLabels = new Set(picked.map((item) => item.label));
        return extraFolders.filter((f) => !keptLabels.has(f));
    }

    /**
     * Shows a multi-select QuickPick listing all conflicting files.
     * No items are checked by default. Checked items will have diff editors opened after reinit.
     * All files in the list are overwritten regardless of selection.
     * Returns the checked paths, or undefined if the user cancels.
     */
    async promptFileMerge(toMergeList: string[]): Promise<string[] | undefined> {
        const items = toMergeList.map((relativePath) => ({
            label: relativePath,
            description: "Open diff editor after reinit",
            picked: false,
        }));

        const picked = await vscode.window.showQuickPick(items, {
            title: "Memoria: Conflicting files found",
            placeHolder: "Check files to open a diff editor after reinit (all will be overwritten regardless)",
            canPickMany: true,
        });

        if (picked === undefined) {
            return undefined; // user cancelled
        }

        return picked.map((item) => item.label);
    }

    /**
     * Opens VS Code merge editors for the given file paths in batches of 10.
     * Attempts to use the 3-way merge editor (with accept/discard buttons per hunk).
     * Falls back to the standard diff editor if the merge editor command is unavailable
     * (vscode.openMergeEditor is an internal command that may not always be registered).
     *
     * Merge editor layout:
     *   Base + input1: backup in WorkspaceInitializationBackups/ (old user version).
     *   Input2 + output: new blueprint file in the workspace root.
     * Standard diff layout:
     *   Left: backup (old), Right: workspace file (new blueprint, editable).
     */
    async openDiffEditors(
        workspaceRoot: vscode.Uri,
        cleanupRoot: vscode.Uri,
        filePaths: string[]
    ): Promise<void> {
        const BATCH_SIZE = 10;
        for (let i = 0; i < filePaths.length; i += BATCH_SIZE) {
            const batch = filePaths.slice(i, i + BATCH_SIZE);
            await Promise.all(
                batch.map(async (relativePath) => {
                    const segments = relativePath.split("/");
                    const fileName = segments[segments.length - 1];
                    const backupUri = vscode.Uri.joinPath(cleanupRoot, ...segments);
                    const workspaceUri = vscode.Uri.joinPath(workspaceRoot, ...segments);
                    try {
                        await vscode.commands.executeCommand("vscode.openMergeEditor", {
                            base: backupUri,
                            input1: { uri: backupUri, title: "Your Version" },
                            input2: { uri: workspaceUri, title: "New Blueprint" },
                            output: workspaceUri,
                        });
                    } catch {
                        // Merge editor unavailable — fall back to the standard diff editor.
                        const title = `Merge: ${fileName} (old ↔ new)`;
                        await vscode.commands.executeCommand("vscode.diff", backupUri, workspaceUri, title);
                    }
                })
            );
        }
    }

    /**
     * Checks a single blueprint file path for conflicts.
     * If a conflict exists, backs up the on-disk file to WorkspaceInitializationBackups/.
     * Returns the relative path if a conflict was found, or null if not.
     *
     * Backup happens here (Phase A), before the user sees any UI, because the alternative —
     * backing up during Phase D after user confirmation — would interleave backup and scaffold
     * operations, making partial-failure recovery harder to reason about.
     */
    private async categorizeFile(
        workspaceRoot: vscode.Uri,
        relativePath: string,
        currentManifest: BlueprintManifest,
        getSeedContent: (relativePath: string) => Promise<Uint8Array | null>
    ): Promise<string | null> {
        const segments = relativePath.split("/");
        const diskUri = vscode.Uri.joinPath(workspaceRoot, ...segments);

        let diskContent: Uint8Array;
        try {
            diskContent = await this.fs.readFile(diskUri);
        } catch {
            // File does not exist on disk — no conflict.
            return null;
        }

        const diskHash = computeFileHash(diskContent);
        const storedHash = currentManifest.fileManifest[relativePath];

        if (storedHash !== undefined) {
            // Was in the previous blueprint — compare current hash to stored hash.
            if (diskHash === storedHash) {
                return null; // Unmodified — overwrite silently, no backup needed.
            }
            // Modified by user — back up and flag for merge.
            await this.backupFile(workspaceRoot, relativePath);
            return relativePath;
        } else {
            // User-created file — compare to the blueprint's seed content.
            const seedContent = await getSeedContent(relativePath);
            const seedHash = computeFileHash(seedContent ?? new Uint8Array(0));
            if (diskHash === seedHash) {
                return null; // Identical to blueprint seed — overwrite silently.
            }
            // Different from seed — back up and flag for merge.
            await this.backupFile(workspaceRoot, relativePath);
            return relativePath;
        }
    }

    private async findExtraFolders(
        workspaceRoot: vscode.Uri,
        newDefinition: BlueprintDefinition,
        allFoldersAreExtra: boolean
    ): Promise<string[]> {
        const entries = await this.fs.readDirectory(workspaceRoot);
        const blueprintTopLevelFolders = new Set(
            newDefinition.workspace
                .filter((e) => e.isFolder)
                .map((e) => e.name.replace(/\/$/, ""))
        );

        const excludedFolders = new Set(["WorkspaceInitializationBackups", ".memoria"]);

        return entries
            .filter(([name, type]) => {
                if (type !== vscode.FileType.Directory) return false;
                if (excludedFolders.has(name)) return false;
                return !blueprintTopLevelFolders.has(name);
            })
            .map(([name]) => name);
    }

    private flattenWorkspaceFiles(entries: WorkspaceEntry[], prefix = "", result: string[] = []): string[] {
        for (const entry of entries) {
            const name = entry.name.replace(/\/$/, "");
            const relativePath = prefix ? `${prefix}/${name}` : name;
            if (entry.isFolder) {
                if (entry.children) {
                    this.flattenWorkspaceFiles(entry.children, relativePath, result);
                }
            } else {
                result.push(relativePath);
            }
        }
        return result;
    }

    private async backupFile(workspaceRoot: vscode.Uri, relativePath: string): Promise<void> {
        try {
            const segments = relativePath.split("/");
            const src = vscode.Uri.joinPath(workspaceRoot, ...segments);
            const dest = vscode.Uri.joinPath(workspaceRoot, "WorkspaceInitializationBackups", ...segments);

            const destParent =
                segments.length > 1
                    ? vscode.Uri.joinPath(workspaceRoot, "WorkspaceInitializationBackups", ...segments.slice(0, -1))
                    : vscode.Uri.joinPath(workspaceRoot, "WorkspaceInitializationBackups");
            await this.fs.createDirectory(destParent);
            await this.fs.copy(src, dest, { overwrite: true });
        } catch {
            // Non-fatal — backup failures must not block re-initialization. The user has
            // already committed to reinitializing at this point, so silently skipping a
            // backup is preferable to aborting the entire operation. Losing a backup is
            // recoverable (the user can check git history); aborting mid-reinit is not.
        }
    }
}
