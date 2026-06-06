/** Status bar item for backup activity feedback. */

import * as vscode from "vscode";

export type BackupBarState =
    | "idle"
    | "running"
    | "completed"
    | "skipped"
    | "failed";

export class BackupStatusBar implements vscode.Disposable {
    private readonly item: vscode.StatusBarItem;
    private revertTimer: ReturnType<typeof setTimeout> | undefined;

    constructor() {
        this.item = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Left,
            10,
        );
        this.item.name = "Memoria Backup";
    }

    show(): void {
        this.setState("idle");
        this.item.show();
    }

    hide(): void {
        this.item.hide();
    }

    setState(state: BackupBarState, detail?: string): void {
        this.clearRevertTimer();

        switch (state) {
            case "idle":
                this.item.text = "$(file-zip) Backup: Idle";
                this.item.tooltip = detail ?? "Memoria: Scheduled Backup";
                this.item.backgroundColor = undefined;
                break;
            case "running":
                this.item.text = "$(sync~spin) Backup: Running…";
                this.item.tooltip = detail ?? "Backup in progress…";
                this.item.backgroundColor = undefined;
                break;
            case "completed":
                this.item.text = "$(check) Backup: Done";
                this.item.tooltip = detail ?? "Backup completed";
                this.item.backgroundColor = undefined;
                this.scheduleRevert();
                break;
            case "skipped":
                this.item.text = "$(dash) Backup: No changes";
                this.item.tooltip = detail ?? "No files changed";
                this.item.backgroundColor = undefined;
                this.scheduleRevert();
                break;
            case "failed":
                this.item.text = "$(error) Backup: Failed";
                this.item.tooltip = detail ?? "Backup failed";
                this.item.backgroundColor = new vscode.ThemeColor("statusBarItem.errorBackground");
                break;
        }
    }

    setNextBackupTooltip(profileName: string, time: string): void {
        if (this.item.text.includes("Idle")) {
            this.item.tooltip = `Next: ${profileName} at ${time}`;
        }
    }

    private scheduleRevert(): void {
        this.revertTimer = setTimeout(() => {
            this.setState("idle");
        }, 10_000);
    }

    private clearRevertTimer(): void {
        if (this.revertTimer !== undefined) {
            clearTimeout(this.revertTimer);
            this.revertTimer = undefined;
        }
    }

    dispose(): void {
        this.clearRevertTimer();
        this.item.dispose();
    }
}
