/**
 * BackupFeature — main orchestrator.
 *
 * Lifecycle:
 *   refresh(root, true)  → start scheduler, show status bar
 *   refresh(root, false) → stop all timers, hide status bar
 */

import * as path from "path";
import * as fs from "fs";
import * as vscode from "vscode";
import type { BackupConfig, BackupProfile, BackupProfileState } from "./types";
import { BackupConfigManager } from "./backupConfigManager";
import { BackupStatusBar } from "./backupStatusBar";
import { nextOccurrence, mostRecentOccurrence } from "./backupScheduler";
import { executeBackup, type SuccessBackupStatus } from "./backupExecutor";
import type { TelemetryEmitter } from "../../telemetry";
import { formatSize } from "./backupUtils";
import { showError } from "../../utils/uiMessages";

/** Lockfile name written to targetFolder to prevent duplicate backups from multiple windows. */
const LOCKFILE_NAME = ".memoria-backup.lock";

interface ScheduledProfile {
    name: string;
    profile: BackupProfile;
    timer: ReturnType<typeof setTimeout> | undefined;
}

export class BackupFeature implements vscode.Disposable {
    private workspaceRoot: vscode.Uri | null = null;
    private config: BackupConfig | null = null;
    private scheduled: Map<string, ScheduledProfile> = new Map();
    private running = false;
    private queue: Array<string> = [];
    private configWatcher: vscode.FileSystemWatcher | undefined;

    private readonly statusBar = new BackupStatusBar();
    private readonly configManager: BackupConfigManager;
    private readonly outputChannel: vscode.OutputChannel;
    private readonly subscriptions: vscode.Disposable[] = [];

    constructor(
        private readonly telemetry: TelemetryEmitter,
        configManager?: BackupConfigManager,
        outputChannel?: vscode.OutputChannel,
    ) {
        this.configManager = configManager ?? new BackupConfigManager();
        this.outputChannel = outputChannel ?? vscode.window.createOutputChannel("Memoria: Backup");
    }

    async refresh(workspaceRoot: vscode.Uri | null, enabled: boolean): Promise<void> {
        this.stop();

        if (!workspaceRoot || !enabled) {
            await vscode.commands.executeCommand("setContext", "memoria.backupActive", false);
            return;
        }

        this.workspaceRoot = workspaceRoot;
        const config = await this.configManager.read(workspaceRoot);
        if (!config) {
            await vscode.commands.executeCommand("setContext", "memoria.backupActive", false);
            return;
        }

        this.config = config;
        const profileCount = Object.keys(config.profiles).length;

        await vscode.commands.executeCommand(
            "setContext",
            "memoria.backupActive",
            profileCount > 0,
        );

        if (profileCount === 0) return;

        this.statusBar.show();
        this.watchConfig(workspaceRoot);
        this.scheduleAll(config, workspaceRoot);

        // Catch-up on start if setting is enabled
        const catchUp = vscode.workspace
            .getConfiguration("memoria.backup")
            .get<boolean>("catchUpOnStart", false);

        if (catchUp) {
            this.runCatchUp(config, workspaceRoot);
        }
    }

    /** Runs a named profile immediately (used by the Run Backup command). */
    async runProfile(profileName: string): Promise<void> {
        const root = this.workspaceRoot;
        if (!root) {
            showError("No initialized workspace found.");
            return;
        }

        const config = await this.configManager.read(root);
        if (!config) {
            showError(
                "Backup config not found. Use 'Create Backup Profile' first.",
            );
            return;
        }

        const profile = config.profiles[profileName];
        if (!profile) {
            showError(`Profile '${profileName}' not found.`);
            return;
        }

        await this.executeProfile(profileName, profile, root, config);
    }

    /** Returns current profile names, or empty if not active. */
    getProfileNames(): string[] {
        return this.config ? Object.keys(this.config.profiles) : [];
    }

    /** Returns the workspace root (for the history command). */
    getWorkspaceRoot(): vscode.Uri | null {
        return this.workspaceRoot;
    }

    /** Returns the config manager (for the wizard command). */
    getConfigManager(): BackupConfigManager {
        return this.configManager;
    }

    private stop(): void {
        for (const entry of this.scheduled.values()) {
            if (entry.timer !== undefined) {
                clearTimeout(entry.timer);
            }
        }
        this.scheduled.clear();
        this.configWatcher?.dispose();
        this.configWatcher = undefined;
        this.statusBar.hide();
        this.workspaceRoot = null;
        this.config = null;
        this.queue = [];
    }

    private watchConfig(workspaceRoot: vscode.Uri): void {
        const pattern = new vscode.RelativePattern(workspaceRoot, ".memoria/backup-config.json");
        this.configWatcher = vscode.workspace.createFileSystemWatcher(pattern);

        const reload = async () => {
            const root = this.workspaceRoot;
            if (!root) return;
            const newConfig = await this.configManager.read(root);
            if (!newConfig) return;
            this.config = newConfig;
            // Cancel all pending timers and reschedule
            for (const entry of this.scheduled.values()) {
                if (entry.timer !== undefined) clearTimeout(entry.timer);
            }
            this.scheduled.clear();
            this.scheduleAll(newConfig, root);
        };

        this.configWatcher.onDidChange(reload);
        this.configWatcher.onDidCreate(reload);
    }

    private scheduleAll(config: BackupConfig, root: vscode.Uri): void {
        const now = new Date();

        for (const [name, profile] of Object.entries(config.profiles)) {
            const next = nextOccurrence(profile.schedule, now);
            if (!next) continue;

            const delay = Math.max(0, next.getTime() - Date.now());
            const entry: ScheduledProfile = { name, profile, timer: undefined };

            entry.timer = setTimeout(() => {
                void this.onTimerFired(name, root);
            }, delay);

            this.scheduled.set(name, entry);

            const timeStr = `${String(next.getHours()).padStart(2, "0")}:${String(next.getMinutes()).padStart(2, "0")}`;
            this.statusBar.setNextBackupTooltip(name, timeStr);
        }
    }

    private async onTimerFired(profileName: string, root: vscode.Uri): Promise<void> {
        const config = await this.configManager.read(root);
        if (!config) return;

        const profile = config.profiles[profileName];
        if (!profile) return;

        await this.executeProfile(profileName, profile, root, config);

        // Reschedule
        const next = nextOccurrence(profile.schedule, new Date());
        const entry = this.scheduled.get(profileName);
        if (entry && next) {
            const delay = Math.max(0, next.getTime() - Date.now());
            entry.timer = setTimeout(() => {
                void this.onTimerFired(profileName, root);
            }, delay);
        }
    }

    private runCatchUp(config: BackupConfig, root: vscode.Uri): void {
        const now = new Date();
        const catchUpProfiles: string[] = [];

        for (const [name, profile] of Object.entries(config.profiles)) {
            const lastTime = config._state[name]?.lastBackupTime;
            const lastDate = lastTime ? new Date(lastTime) : null;
            const mostRecent = mostRecentOccurrence(profile.schedule, now);

            if (!mostRecent) continue;
            if (!lastDate || mostRecent.getTime() > lastDate.getTime()) {
                catchUpProfiles.push(name);
            }
        }

        if (catchUpProfiles.length > 0) {
            this.telemetry.logUsage("backup/catchUpTriggered", {
                profileCount: String(catchUpProfiles.length),
            });
            void this.runSequential(catchUpProfiles, root);
        }
    }

    private async runSequential(profileNames: string[], root: vscode.Uri): Promise<void> {
        for (const name of profileNames) {
            const config = await this.configManager.read(root);
            if (!config) break;
            const profile = config.profiles[name];
            if (profile) {
                await this.executeProfile(name, profile, root, config);
            }
        }
    }

    private async executeProfile(
        profileName: string,
        profile: BackupProfile,
        root: vscode.Uri,
        config: BackupConfig,
    ): Promise<void> {
        if (this.running) {
            this.queue.push(profileName);
            return;
        }

        // Lockfile check
        const lockPath = path.join(profile.targetFolder, LOCKFILE_NAME);
        if (!(await this.acquireLock(lockPath))) {
            this.outputChannel.appendLine(`[Backup] Skipped ${profileName}: another instance holds the lock`);
            return;
        }

        this.running = true;
        const state: BackupProfileState = config._state[profileName] ?? {
            lastBackupTime: null,
            hashes: {},
        };

        this.statusBar.setState("running", `Backing up ${profileName}…`);

        const start = Date.now();
        const result = await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: `Memoria: Backing up '${profileName}'`,
                cancellable: true,
            },
            async (_progress, token) => {
                return executeBackup({
                    workspaceRoot: root,
                    profileName,
                    profile,
                    state,
                    outputChannel: this.outputChannel,
                    token,
                    onProgress: (done, total) => {
                        _progress.report({
                            message: `${done}/${total} files`,
                            increment: total > 0 ? (1 / total) * 100 : 0,
                        });
                    },
                });
            },
        );
        const durationMs = Date.now() - start;

        await this.releaseLock(lockPath);
        this.running = false;

        if (result.kind === "success") {
            const success = result as SuccessBackupStatus;
            await this.configManager.updateState(root, profileName, success.newState);
            this.config = await this.configManager.read(root);

            this.statusBar.setState(
                "completed",
                `${profileName} completed (${success.fileCount} files, ${formatSize(success.sizeBytes)})`,
            );
            vscode.window.showInformationMessage(
                `Backup '${profileName}' completed: ${success.fileCount} files (${formatSize(success.sizeBytes)})`,
            );
            this.telemetry.logUsage("backup/executed", {
                profileCount: "1",
                changedFiles: String(success.fileCount),
                zipSizeBytes: String(success.sizeBytes),
                durationMs: String(durationMs),
            });
        } else if (result.kind === "skipped") {
            this.statusBar.setState("skipped", `${profileName}: no files changed`);
            vscode.window.showInformationMessage(
                `Backup '${profileName}' skipped: no files changed since last backup`,
            );
            this.telemetry.logUsage("backup/skipped", {
                profileName,
                reason: "noChanges",
            });
        } else {
            this.statusBar.setState("failed", `${profileName} failed: ${result.reason}`);
            const action = await vscode.window.showErrorMessage(
                `Backup '${profileName}' failed: ${result.reason}`,
                "Show Output",
            );
            if (action === "Show Output") {
                this.outputChannel.show();
            }
            this.telemetry.logUsage("backup/failed", {
                profileName,
                errorType: result.reason,
            });
        }

        // Process queued items
        const next = this.queue.shift();
        if (next) {
            const cfg = await this.configManager.read(root);
            if (cfg) {
                const p = cfg.profiles[next];
                if (p) void this.executeProfile(next, p, root, cfg);
            }
        }
    }

    private async acquireLock(lockPath: string): Promise<boolean> {
        try {
            const dir = path.dirname(lockPath);
            await fs.promises.mkdir(dir, { recursive: true });
        } catch {
            // ignore
        }

        try {
            const content = await fs.promises.readFile(lockPath, "utf8");
            const pid = parseInt(content.trim(), 10);
            if (!isNaN(pid) && pid !== process.pid) {
                // Check if the PID is still running
                try {
                    process.kill(pid, 0);
                    // PID exists → lock is active
                    return false;
                } catch {
                    // PID doesn't exist → stale lock
                }
            }
        } catch {
            // File doesn't exist — that's fine
        }

        try {
            await fs.promises.writeFile(lockPath, String(process.pid), "utf8");
        } catch {
            return false;
        }
        return true;
    }

    private async releaseLock(lockPath: string): Promise<void> {
        try {
            await fs.promises.unlink(lockPath);
        } catch {
            // ignore
        }
    }

    dispose(): void {
        this.stop();
        this.statusBar.dispose();
        this.outputChannel.dispose();
        for (const d of this.subscriptions) d.dispose();
    }
}
