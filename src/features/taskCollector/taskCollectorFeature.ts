// Orchestrates task synchronization between source markdown files and the collector document.
import * as vscode from "vscode";
import type { ManifestManager } from "../../blueprints/manifestManager";
import type { TelemetryEmitter } from "../../telemetry";
import { normalizePath } from "../../utils/path";
import { isMarkdownPath } from "../../utils/markdown";
import { formatError } from "../../utils/error";
import { PendingWrites } from "./pendingWrites";
import { applySourceRenames, type SourceRename } from "./renameHandler";
import { SyncQueue } from "./syncQueue";
import { hydrateTaskIndex, pruneOrderReferences, removeTask } from "./taskIndex";
import { TaskWriter } from "./taskWriter";
import { isMarkdownDocument } from "./taskHelpers";
import {
    describeUri,
    resolveSourceUri,
    findTrackedSources,
    getCollectorUri,
    isTrackedSourceUri as isTrackedSourceUriStandalone,
} from "./taskCollectorPathResolver";
import { TaskReconciler, type TaskCollectorState } from "./taskReconciler";
import type { TaskCollectorConfig } from "./types";

export class TaskCollectorFeature implements vscode.Disposable {
    private state: TaskCollectorState = {
        index: null,
        workspaceRoot: null,
        collectorPath: null,
        writer: null,
        bootstrapPending: false,
    };
    private reconciler: TaskReconciler | null = null;
    private queue: SyncQueue | null = null;
    private pendingWrites: PendingWrites | null = null;
    private subscriptions: vscode.Disposable[] = [];

    constructor(
        private readonly manifest: ManifestManager,
        private readonly telemetry: TelemetryEmitter,
        private readonly now: () => Date = () => new Date(),
    ) {}

    async refresh(
        workspaceRoot: vscode.Uri | null,
        enabled: boolean,
        _allRoots: readonly vscode.Uri[],
    ): Promise<void> {
        if (!workspaceRoot || !enabled) {
            await this.stop();
            return;
        }

        const manifest = await this.manifest.readManifest(workspaceRoot);
        const collectorPath = manifest?.taskCollector?.collectorPath ?? null;
        if (!collectorPath) {
            await this.stop();
            return;
        }

        await this.stop();
        await this.start(workspaceRoot, collectorPath);
    }

    async syncNow(): Promise<boolean> {
        if (!this.queue) {
            vscode.window.showErrorMessage("Memoria: Task Collector is not enabled for this workspace.");
            return false;
        }

        await this.queue.enqueue({ kind: "full" });
        await this.queue.drain();
        return true;
    }

    dispose(): void {
        void this.stop();
    }

    private async start(workspaceRoot: vscode.Uri, collectorPath: string): Promise<void> {
        this.state.workspaceRoot = workspaceRoot;
        this.state.collectorPath = normalizePath(collectorPath);

        // Hydrate the index from disk so task IDs are stable across restarts.
        const storedIndex = await this.manifest.readTaskIndex(workspaceRoot);
        this.state.index = hydrateTaskIndex(storedIndex, this.state.collectorPath);
        // Signal that the first run (no persisted index) needs a full sync to populate the index.
        this.state.bootstrapPending = storedIndex === null;
        this.pendingWrites = new PendingWrites();
        this.state.writer = new TaskWriter(this.pendingWrites);

        this.reconciler = new TaskReconciler(this.state, this.manifest, this.telemetry, this.now);
        const config = await this.reconciler.readConfig();
        this.queue = new SyncQueue((job) => this.handleJob(job), config.debounceMs);
        this.subscriptions = [
            vscode.workspace.onDidSaveTextDocument((document) => {
                void this.handleSave(document);
            }),
            vscode.workspace.onDidRenameFiles((event) => {
                void this.handleRename(event);
            }),
            vscode.workspace.onDidDeleteFiles((event) => {
                void this.handleDelete(event);
            }),
            vscode.workspace.onDidChangeWorkspaceFolders(() => {
                void this.handleWorkspaceFoldersChanged();
            }),
        ];

        // FileSystemWatcher detects external file changes (edits from other editors, git
        // operations, scripts, etc.) that onDidSaveTextDocument does not cover. When a save
        // happens inside VS Code, both the save listener and the watcher fire — the SyncQueue
        // debounce collapses them into a single sync pass.
        for (const folder of vscode.workspace.workspaceFolders ?? []) {
            const mdWatcher = vscode.workspace.createFileSystemWatcher(
                new vscode.RelativePattern(folder, "**/*.md"),
            );
            mdWatcher.onDidChange((uri) => void this.handleExternalChange(uri));
            mdWatcher.onDidCreate((uri) => void this.handleExternalChange(uri));
            this.subscriptions.push(mdWatcher);
        }

        if (config.syncOnStartup) {
            queueMicrotask(() => {
                this.safeEnqueue({ kind: "full" }, false);
            });
        }
    }

    private async stop(): Promise<void> {
        const currentQueue = this.queue;
        this.queue = null;
        this.reconciler = null;

        for (const subscription of this.subscriptions) {
            subscription.dispose();
        }
        this.subscriptions = [];

        if (currentQueue) {
            try {
                await currentQueue.drain();
            } catch {
                // Teardown failures must not surface to users; the queue is being destroyed anyway.
            }
            currentQueue.dispose();
        }

        this.state.workspaceRoot = null;
        this.state.collectorPath = null;
        this.pendingWrites = null;
        this.state.writer = null;
        this.state.index = null;
        this.state.bootstrapPending = false;
    }

    private isReady(): boolean {
        return !!(this.queue && this.state.workspaceRoot && this.state.collectorPath);
    }

    private async handleSave(document: vscode.TextDocument): Promise<void> {
        if (!this.isReady() || !this.pendingWrites) {
            return;
        }

        if (!isMarkdownDocument(document)) {
            return;
        }

        if (this.pendingWrites.consumeIfPresent(document.uri.toString(), document.getText())) {
            return;
        }

        await this.classifyAndEnqueue(document.uri);
    }

    // Handles FileSystemWatcher events (onDidChange / onDidCreate) so that external edits
    // (other editors, git, scripts) trigger task collection without requiring a VS Code save.
    private async handleExternalChange(uri: vscode.Uri): Promise<void> {
        if (!this.isReady()) {
            return;
        }

        if (!isMarkdownPath(uri.path)) {
            return;
        }

        await this.classifyAndEnqueue(uri);
    }

    // Shared classification: determines whether a URI is the collector, a tracked source, or
    // neither, and enqueues the appropriate sync job.
    private async classifyAndEnqueue(uri: vscode.Uri): Promise<void> {
        if (this.isCollectorUri(uri)) {
            this.safeEnqueue({ kind: "collector", uri: uri.toString() });
            return;
        }

        const config = await this.reconciler!.readConfig();
        if (!this.queue) {
            return;
        }

        if (!(await this.isTrackedSourceUri(uri, config))) {
            return;
        }

        this.safeEnqueue({ kind: "source", uri: uri.toString() });
    }

    private async handleRename(event: vscode.FileRenameEvent): Promise<void> {
        if (!this.isReady() || !this.state.index) {
            return;
        }

        const renames: SourceRename[] = [];
        for (const file of event.files) {
            const oldContext = describeUri(file.oldUri, this.state.workspaceRoot);
            const newContext = describeUri(file.newUri, this.state.workspaceRoot);
            if (!oldContext || !newContext || !isMarkdownPath(newContext.relativePath)) {
                continue;
            }

            renames.push({
                oldSource: oldContext.relativePath,
                oldSourceRoot: oldContext.sourceRoot,
                newSource: newContext.relativePath,
                newSourceRoot: newContext.sourceRoot,
            });
        }

        if (!applySourceRenames(this.state.index, renames)) {
            return;
        }

        pruneOrderReferences(this.state.index);
        await this.reconciler!.persistIndex();

        for (const rename of renames) {
            const sourceUri = resolveSourceUri(rename.newSource, rename.newSourceRoot);
            if (sourceUri) {
                this.safeEnqueue({ kind: "source", uri: sourceUri.toString() });
            }
        }

        this.enqueueCollectorRender();
    }

    private async handleDelete(event: vscode.FileDeleteEvent): Promise<void> {
        if (!this.queue) {
            return;
        }

        const config = await this.reconciler!.readConfig();
        const affectsTasks = await Promise.all(event.files.map((uri) => this.isTrackedSourceUri(uri, config)));
        if (!affectsTasks.some(Boolean) && !event.files.some((uri) => this.isCollectorUri(uri))) {
            return;
        }

        this.safeEnqueue({ kind: "full" });
    }

    private async handleWorkspaceFoldersChanged(): Promise<void> {
        if (!this.state.index) {
            return;
        }

        const rootNames = new Set((vscode.workspace.workspaceFolders ?? []).map((folder) => folder.name));
        let changed = false;

        for (const entry of Object.values(this.state.index.tasks)) {
            if (entry.sourceRoot && !rootNames.has(entry.sourceRoot)) {
                removeTask(this.state.index, entry.id);
                changed = true;
            }
        }

        if (changed) {
            pruneOrderReferences(this.state.index);
            await this.reconciler!.persistIndex();
        }

        this.safeEnqueue({ kind: "full" });
    }

    private async handleJob(job: { kind: "source" | "collector" | "full"; uri?: string; renderOnly?: boolean }): Promise<void> {
        switch (job.kind) {
            case "full":
                await this.fullSync();
                return;
            case "source":
                if (job.uri) {
                    await this.reconciler!.reconcileSource(vscode.Uri.parse(job.uri), true, () => this.enqueueCollectorRender());
                }
                return;
            case "collector":
                await this.reconciler!.reconcileCollector(job.renderOnly ?? false);
                return;
        }
    }

    private async fullSync(): Promise<void> {
        if (!this.state.index) {
            return;
        }

        const config = await this.reconciler!.readConfig();
        const sources = await findTrackedSources(config, (uri, cfg) => this.isTrackedSourceUri(uri, cfg));
        for (const source of sources) {
            await this.reconciler!.reconcileSource(source, false, () => this.enqueueCollectorRender());
        }

        // Full sync always writes the collector even if it is dirty — it is the authoritative
        // refresh that overwrites any pending user edits with the ground-truth from all sources.
        // On bootstrap (first run with no persisted index), read the existing collector document
        // so seed content (e.g. sample tasks from the blueprint) is imported into the index
        // before re-rendering — otherwise the seed content would be silently discarded.
        await this.reconciler!.reconcileCollector(!this.state.bootstrapPending, true);
        this.state.bootstrapPending = false;
        this.telemetry.logUsage("taskCollector.syncCompleted", {
            kind: "full",
            sources: String(sources.length),
        });
    }

    private safeEnqueue(job: { kind: "source" | "collector" | "full"; uri?: string; renderOnly?: boolean }, toast = true): void {
        this.queue?.enqueue(job).catch((error) => {
            this.reportError("taskCollector.reconcileFailed", error, toast);
        });
    }

    private enqueueCollectorRender(): void {
        this.safeEnqueue({ kind: "collector", renderOnly: true }, false);
    }

    private async isTrackedSourceUri(uri: vscode.Uri, config?: TaskCollectorConfig): Promise<boolean> {
        return isTrackedSourceUriStandalone(uri, this.state.workspaceRoot, this.state.collectorPath, config ?? await this.reconciler!.readConfig());
    }

    private isCollectorUri(uri: vscode.Uri): boolean {
        return this.state.collectorPath !== null && this.state.workspaceRoot !== null && uri.toString() === getCollectorUri(this.state.workspaceRoot, this.state.collectorPath).toString();
    }

    private reportError(eventName: string, error: unknown, toast: boolean): void {
        const message = formatError(error);
        this.telemetry.logError(eventName, { message });
        if (toast) {
            vscode.window.showErrorMessage(`Memoria: Task sync failed — ${message}`);
        }
    }
}
