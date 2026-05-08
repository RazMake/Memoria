import * as vscode from "vscode";

/**
 * Encapsulates a FileSystemWatcher with debounced reload on create/change/delete events.
 * Eliminates the duplicated watcher + debounce + dispose pattern across feature classes.
 */
export class DebouncedFileWatcher implements vscode.Disposable {
    private watcher: vscode.FileSystemWatcher | null = null;
    private watcherSubscriptions: vscode.Disposable[] = [];
    private reloadTimer: ReturnType<typeof setTimeout> | null = null;

    constructor(
        private readonly debounceMs: number,
        private readonly onReload: () => void,
    ) {}

    /** Creates a new FileSystemWatcher for the given pattern, disposing any previous one. */
    watch(pattern: vscode.RelativePattern): void {
        this.dispose();

        this.watcher = vscode.workspace.createFileSystemWatcher(pattern);
        this.watcherSubscriptions = [
            this.watcher.onDidChange(() => this.scheduleReload()),
            this.watcher.onDidCreate(() => this.scheduleReload()),
            this.watcher.onDidDelete(() => this.scheduleReload()),
        ];
    }

    dispose(): void {
        this.clearTimer();
        for (const sub of this.watcherSubscriptions) {
            sub.dispose();
        }
        this.watcherSubscriptions = [];
        this.watcher?.dispose();
        this.watcher = null;
    }

    private scheduleReload(): void {
        this.clearTimer();
        this.reloadTimer = setTimeout(() => {
            this.reloadTimer = null;
            this.onReload();
        }, this.debounceMs);
    }

    private clearTimer(): void {
        if (this.reloadTimer !== null) {
            clearTimeout(this.reloadTimer);
            this.reloadTimer = null;
        }
    }
}
