// Orchestrates task synchronization between source markdown files and the collector document.
// This class is responsible for the full feature lifecycle: starting and stopping the watcher,
// reacting to file save and rename events, dispatching sync jobs through the queue, reconciling
// source and collector documents, and running the aging pass. It is the single entry point for
// all task collector logic within a given workspace activation.
import * as path from "node:path";
import * as vscode from "vscode";
import { minimatch } from "minimatch";
import type { ManifestManager } from "../../blueprints/manifestManager";
import type { TelemetryEmitter } from "../../telemetry";
import { normalizePath } from "../../utils/path";
import { formatDate, isTaskExpired } from "./aging";
import { alignTaskSequences, computeTaskFingerprint } from "./taskAlignment";
import { renderCollector } from "./collectorFormatter";
import { PendingWrites } from "./pendingWrites";
import { forward, reverse } from "./pathRewriter";
import { applySourceRenames, type SourceRename } from "./renameHandler";
import { SyncQueue } from "./syncQueue";
import { DEFAULT_TASK_COLLECTOR_CONFIG, generateTaskId, getCollectorOrder, getSourceDisplayPath, getTasksForSource, hydrateTaskIndex, makeSourceKey, pruneOrderReferences, removeTask, upsertTask } from "./taskIndex";
import { parseCollectorDocument, parseTaskBlocks, markSubtasksCompleted } from "./taskParser";
import { renderDoneBlock, renderTaskBlock, replaceLineRange, TaskWriter } from "./taskWriter";
import type { ExistingTaskSnapshot, ParsedCollectorTask, StoredTaskIndex, TaskBlock, TaskCollectorConfig, TaskIndexEntry, TaskSnapshot } from "./types";

interface SourceContext {
    uri: vscode.Uri;
    workspaceFolder: vscode.WorkspaceFolder;
    sourceRoot: string | null;
    relativePath: string;
    sourceKey: string;
}

interface IndexedTaskLocation {
    block: TaskBlock;
    blockIndex: number;
}

export class TaskCollectorFeature implements vscode.Disposable {
    private workspaceRoot: vscode.Uri | null = null;
    private collectorPath: string | null = null;
    private queue: SyncQueue | null = null;
    private pendingWrites: PendingWrites | null = null;
    private writer: TaskWriter | null = null;
    private subscriptions: vscode.Disposable[] = [];
    private index: StoredTaskIndex | null = null;
    private bootstrapPending = false;

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
        this.workspaceRoot = workspaceRoot;
        this.collectorPath = normalizePath(collectorPath);

        // Hydrate the index from disk so task IDs are stable across restarts.
        const storedIndex = await this.manifest.readTaskIndex(workspaceRoot);
        this.index = hydrateTaskIndex(storedIndex, this.collectorPath);
        // Signal that the first run (no persisted index) needs a full sync to populate the index.
        this.bootstrapPending = storedIndex === null;
        this.pendingWrites = new PendingWrites();
        this.writer = new TaskWriter(this.pendingWrites);

        const config = await this.readConfig();
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

        if (config.syncOnStartup) {
            queueMicrotask(() => {
                void this.queue?.enqueue({ kind: "full" }).catch((error) => {
                    this.reportError("taskCollector.startupSync", error, false);
                });
            });
        }
    }

    private async stop(): Promise<void> {
        const currentQueue = this.queue;
        this.queue = null;

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

        this.workspaceRoot = null;
        this.collectorPath = null;
        this.pendingWrites = null;
        this.writer = null;
        this.index = null;
        this.bootstrapPending = false;
    }

    private async handleSave(document: vscode.TextDocument): Promise<void> {
        if (!this.queue || !this.pendingWrites || !this.workspaceRoot || !this.collectorPath) {
            return;
        }

        if (!isMarkdownDocument(document)) {
            return;
        }

        if (this.pendingWrites.consumeIfPresent(document.uri.toString(), document.getText())) {
            return;
        }

        const config = await this.readConfig();
        if (!this.queue) {
            return;
        }

        if (this.isCollectorUri(document.uri)) {
            // Errors are caught and reported via telemetry rather than re-thrown — save-event
            // handlers must not reject; doing so would propagate into VS Code's document save pipeline.
            void this.queue.enqueue({ kind: "collector", uri: document.uri.toString() }).catch((error) => {
                this.reportError("taskCollector.reconcileFailed", error, true);
            });
            return;
        }

        if (!(await this.isTrackedSourceUri(document.uri, config))) {
            return;
        }

        // Same fire-and-forget pattern: errors are reported via telemetry and not re-thrown.
        this.queue?.enqueue({ kind: "source", uri: document.uri.toString() }).catch((error) => {
            this.reportError("taskCollector.reconcileFailed", error, true);
        });
    }

    private async handleRename(event: vscode.FileRenameEvent): Promise<void> {
        if (!this.index || !this.queue || !this.workspaceRoot) {
            return;
        }

        const renames: SourceRename[] = [];
        for (const file of event.files) {
            const oldContext = this.describeUri(file.oldUri);
            const newContext = this.describeUri(file.newUri);
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

        if (!applySourceRenames(this.index, renames)) {
            return;
        }

        pruneOrderReferences(this.index);
        await this.persistIndex();

        for (const rename of renames) {
            const sourceUri = this.resolveSourceUri(rename.newSource, rename.newSourceRoot);
            if (sourceUri) {
                this.queue?.enqueue({ kind: "source", uri: sourceUri.toString() }).catch((error) => {
                    this.reportError("taskCollector.reconcileFailed", error, true);
                });
            }
        }

        void this.enqueueCollectorRender();
    }

    private async handleDelete(event: vscode.FileDeleteEvent): Promise<void> {
        if (!this.queue) {
            return;
        }

        const config = await this.readConfig();
        const affectsTasks = await Promise.all(event.files.map((uri) => this.isTrackedSourceUri(uri, config)));
        if (!affectsTasks.some(Boolean) && !event.files.some((uri) => this.isCollectorUri(uri))) {
            return;
        }

        this.queue?.enqueue({ kind: "full" }).catch((error) => {
            this.reportError("taskCollector.reconcileFailed", error, true);
        });
    }

    private async handleWorkspaceFoldersChanged(): Promise<void> {
        if (!this.index) {
            return;
        }

        const rootNames = new Set((vscode.workspace.workspaceFolders ?? []).map((folder) => folder.name));
        let changed = false;

        for (const entry of Object.values(this.index.tasks)) {
            if (entry.sourceRoot && !rootNames.has(entry.sourceRoot)) {
                removeTask(this.index, entry.id);
                changed = true;
            }
        }

        if (changed) {
            pruneOrderReferences(this.index);
            await this.persistIndex();
        }

        if (this.queue) {
            void this.queue.enqueue({ kind: "full" }).catch((error) => {
                this.reportError("taskCollector.reconcileFailed", error, true);
            });
        }
    }

    private async handleJob(job: { kind: "source" | "collector" | "full"; uri?: string; renderOnly?: boolean }): Promise<void> {
        switch (job.kind) {
            case "full":
                await this.fullSync();
                return;
            case "source":
                if (job.uri) {
                    await this.reconcileSource(vscode.Uri.parse(job.uri), true);
                }
                return;
            case "collector":
                await this.reconcileCollector(job.renderOnly ?? false);
                return;
        }
    }

    private async fullSync(): Promise<void> {
        if (!this.index) {
            return;
        }

        const config = await this.readConfig();
        const sources = await this.findTrackedSources(config);
        for (const source of sources) {
            await this.reconcileSource(source, false);
        }

        // Full sync always writes the collector even if it is dirty — it is the authoritative
        // refresh that overwrites any pending user edits with the ground-truth from all sources.
        await this.reconcileCollector(true, true);
        this.bootstrapPending = false;
        this.telemetry.logUsage("taskCollector.syncCompleted", {
            kind: "full",
            sources: String(sources.length),
        });
    }

    private async reconcileSource(uri: vscode.Uri, scheduleCollectorRender: boolean): Promise<void> {
        if (!this.index) {
            return;
        }

        const context = this.describeUri(uri);
        if (!context) {
            return;
        }

        let document: vscode.TextDocument;
        try {
            document = await vscode.workspace.openTextDocument(uri);
        } catch {
            await this.dropSourceEntries(context.sourceKey, scheduleCollectorRender);
            return;
        }

        const parsed = parseTaskBlocks(document.getText());
        const previousEntries = getTasksForSource(this.index, context.relativePath, context.sourceRoot);
        const previousSnapshots = previousEntries.map((entry) => this.toSourceSnapshot(entry));
        const nextSnapshots = parsed.map((block) => this.toTaskSnapshot(block.body, block.checked));
        // Alignment assigns each new task a stable ID from the previous snapshot, preventing
        // phantom duplicate tasks from appearing in the collector when source files are edited.
        const alignment = alignTaskSequences(previousSnapshots, nextSnapshots);
        const today = formatDate(this.now());
        const nowIso = this.now().toISOString();
        const nextOrder: string[] = [];
        let changed = false;
        const subtaskUpdates: Array<{ block: TaskBlock; nextBody: string }> = [];

        for (const [blockIndex, block] of parsed.entries()) {
            const matchedId = alignment.newIndexToId.get(blockIndex);
            const previous = matchedId ? this.index.tasks[matchedId] : null;
            const id = matchedId ?? generateTaskId(this.index);
            const nextBody = block.checked ? markSubtasksCompleted(block.body, today) : block.body;
            const nextEntry: TaskIndexEntry = {
                id,
                source: context.relativePath,
                sourceRoot: context.sourceRoot,
                sourceOrder: blockIndex,
                fingerprint: computeTaskFingerprint(nextBody),
                body: nextBody,
                firstSeenAt: previous?.firstSeenAt ?? nowIso,
                completed: block.checked,
                doneDate: block.checked ? (previous?.doneDate ?? today) : null,
                collectorOwned: false,
                agingSkipCount: previous?.agingSkipCount ?? 0,
            };

            if (!previous || !taskEntriesEqual(previous, nextEntry)) {
                changed = true;
            }

            if (nextBody !== block.body) {
                subtaskUpdates.push({ block, nextBody });
            }

            upsertTask(this.index, nextEntry);
            nextOrder.push(id);
        }

        for (const deletedId of alignment.deletedIds) {
            removeTask(this.index, deletedId);
            changed = true;
        }

        if (!stringArrayEqual(this.index.sourceOrders[context.sourceKey] ?? [], nextOrder)) {
            this.index.sourceOrders[context.sourceKey] = nextOrder;
            changed = true;
        }

        pruneOrderReferences(this.index);
        if (!changed) {
            return;
        }

        await this.persistIndex();

        // Write back to source to mark subtasks as completed when their parent was just completed.
        if (subtaskUpdates.length > 0) {
            await this.writer!.mutateDocument(uri, (_document, currentText, eol) => {
                let text = currentText;
                // Apply in reverse order so earlier line numbers remain valid.
                for (const update of [...subtaskUpdates].reverse()) {
                    const replacement = renderTaskBlock(update.block, update.nextBody, true);
                    text = replaceLineRange(
                        text,
                        update.block.bodyRange.startLine,
                        update.block.bodyRange.endLine,
                        replacement,
                        eol,
                    );
                }
                return text;
            });
        }

        if (scheduleCollectorRender) {
            await this.enqueueCollectorRender();
        }
    }

    private async reconcileCollector(renderOnly: boolean, skipDirtyGuard = false): Promise<void> {
        // renderOnly=true skips the "read collector edits" pass and only re-renders the collector
        // from the current index. This separates the write phase from the read phase to avoid
        // re-entrancy when a source reconciliation needs to update the collector without first
        // applying (potentially stale) collector edits.
        if (!this.index || !this.writer || !this.collectorPath) {
            return;
        }

        const collectorUri = this.getCollectorUri();
        const collectorDocument = await openTextDocumentIfPresent(collectorUri);
        if (!renderOnly && collectorDocument) {
            await this.applyCollectorEdits(collectorDocument);
        }

        await this.runAgingPass();
        await this.persistIndex();

        if (renderOnly && !skipDirtyGuard) {
            const latestCollectorDocument = await openTextDocumentIfPresent(collectorUri);
            if (latestCollectorDocument?.isDirty) {
                return;
            }
        }

        const rendered = renderCollector(this.index);
        this.index.collectorOrder.active = rendered.activeOrder;
        this.index.collectorOrder.completed = rendered.completedOrder;
        await this.persistIndex();
        await this.writer.mutateDocument(
            collectorUri,
            () => rendered.content,
            { allowCreate: true },
        );
    }

    private async applyCollectorEdits(document: vscode.TextDocument): Promise<void> {
        if (!this.index || !this.collectorPath) {
            return;
        }

        const parsed = parseCollectorDocument(document.getText());
        const previousOrder = [
            ...getCollectorOrder(this.index, false),
            ...getCollectorOrder(this.index, true),
        ];
        const previousSnapshots = previousOrder
            .map((id) => this.index?.tasks[id])
            .filter((entry): entry is TaskIndexEntry => Boolean(entry))
            .map((entry) => this.toCollectorSnapshot(entry));
        const nextSnapshots = parsed.tasks.map((task) => this.toTaskSnapshot(task.body, task.checked));
        const alignment = alignTaskSequences(previousSnapshots, nextSnapshots);
        const activeOrder: string[] = [];
        const completedOrder: string[] = [];
        const nowIso = this.now().toISOString();
        const today = formatDate(this.now());

        for (const [taskIndex, task] of parsed.tasks.entries()) {
            const matchedId = alignment.newIndexToId.get(taskIndex);
            const previous = matchedId ? this.index.tasks[matchedId] : null;
            const nextCompleted = task.checked;
            const id = matchedId ?? generateTaskId(this.index);
            // reverse() converts collector-relative link paths back to source-relative paths
            // before storing the body in the index, so the index always holds source-relative content.
            const bodyForIndex = previous?.source && !previous.collectorOwned
                ? reverse(task.body, this.collectorPath, previous.source, previous.body)
                : task.body;
            const normalizedBodyForIndex = nextCompleted ? markSubtasksCompleted(bodyForIndex, today) : bodyForIndex;

            if (previous?.source && !previous.collectorOwned) {
                const collectorBody = this.toCollectorBody(previous);
                if (collectorBody !== task.body || previous.completed !== nextCompleted) {
                    await this.updateSourceTask(previous, normalizedBodyForIndex, nextCompleted);
                }
            }

            const updated: TaskIndexEntry = {
                id,
                source: previous?.source ?? null,
                sourceRoot: previous?.sourceRoot ?? null,
                sourceOrder: previous?.sourceOrder ?? null,
                fingerprint: computeTaskFingerprint(normalizedBodyForIndex),
                body: normalizedBodyForIndex,
                firstSeenAt: previous?.firstSeenAt ?? nowIso,
                completed: nextCompleted,
                doneDate: nextCompleted ? (task.suffix?.completedDate ?? previous?.doneDate ?? today) : null,
                collectorOwned: previous?.collectorOwned ?? true,
                agingSkipCount: previous?.agingSkipCount ?? 0,
            };

            upsertTask(this.index, updated);
            if (nextCompleted) {
                completedOrder.push(id);
            } else {
                activeOrder.push(id);
            }
        }

        for (const deletedId of alignment.deletedIds) {
            const entry = this.index.tasks[deletedId];
            if (entry?.source && !entry.collectorOwned) {
                await this.deleteSourceTask(entry);
            }
            removeTask(this.index, deletedId);
        }

        this.index.collectorOrder.active = activeOrder;
        this.index.collectorOrder.completed = completedOrder;
        pruneOrderReferences(this.index);
    }

    private async updateSourceTask(entry: TaskIndexEntry, body: string, checked: boolean): Promise<void> {
        if (!this.writer) {
            return;
        }

        const sourceUri = this.resolveSourceUri(entry.source, entry.sourceRoot ?? null);
        if (!sourceUri) {
            return;
        }

        await this.writer.mutateDocument(sourceUri, (_document, currentText, eol) => {
            const location = this.locateSourceTask(entry, currentText);
            if (!location) {
                return currentText;
            }

            const replacement = renderTaskBlock(location.block, body, checked);
            return replaceLineRange(
                currentText,
                location.block.bodyRange.startLine,
                location.block.bodyRange.endLine,
                replacement,
                eol,
            );
        });
    }

    private async deleteSourceTask(entry: TaskIndexEntry): Promise<void> {
        if (!this.writer) {
            return;
        }

        const sourceUri = this.resolveSourceUri(entry.source, entry.sourceRoot ?? null);
        if (!sourceUri) {
            return;
        }

        await this.writer.mutateDocument(sourceUri, (_document, currentText, eol) => {
            const location = this.locateSourceTask(entry, currentText);
            if (!location) {
                return currentText;
            }

            return replaceLineRange(
                currentText,
                location.block.bodyRange.startLine,
                location.block.bodyRange.endLine,
                "",
                eol,
            );
        });
    }

    private async runAgingPass(): Promise<void> {
        if (!this.index || !this.writer) {
            return;
        }

        const config = await this.readConfig();
        const now = this.now();
        const expired = Object.values(this.index.tasks).filter((entry) => isTaskExpired(entry, config.completedRetentionDays, now));

        for (const entry of expired) {
            if (entry.collectorOwned || !entry.source) {
                removeTask(this.index, entry.id);
                continue;
            }

            const sourceUri = this.resolveSourceUri(entry.source, entry.sourceRoot ?? null);
            if (!sourceUri) {
                this.bumpAgingSkip(entry);
                continue;
            }

            let rewriteStatus: "unchanged" | "rewritten" | "missing" | "mismatch" = "unchanged";
            const changed = await this.writer.mutateDocument(sourceUri, (_document, currentText, eol) => {
                const location = this.locateSourceTask(entry, currentText);
                if (!location) {
                    rewriteStatus = "missing";
                    return currentText;
                }

                if (computeTaskFingerprint(location.block.body) !== entry.fingerprint || !location.block.checked) {
                    rewriteStatus = "mismatch";
                    return currentText;
                }

                rewriteStatus = "rewritten";
                return replaceLineRange(
                    currentText,
                    location.block.bodyRange.startLine,
                    location.block.bodyRange.endLine,
                    renderDoneBlock(location.block, location.block.body),
                    eol,
                );
            });

            if (changed && rewriteStatus === "rewritten") {
                removeTask(this.index, entry.id);
                continue;
            }

            this.telemetry.logError("taskCollector.agingRewriteSkipped", {
                reason: rewriteStatus,
                source: getSourceDisplayPath(entry) ?? "unknown",
            });
            this.bumpAgingSkip(entry);
        }

        pruneOrderReferences(this.index);
    }

    // agingSkipCount tracks how many times the aging pass could not locate a task in its source
    // file. Tasks that cannot be located are retried rather than removed immediately. After 5
    // consecutive skips (task is permanently unreachable) the task is removed to prevent
    // indefinite accumulation of ghost entries in the index.
    private bumpAgingSkip(entry: TaskIndexEntry): void {
        entry.agingSkipCount = (entry.agingSkipCount ?? 0) + 1;
        if ((entry.agingSkipCount ?? 0) >= 5 && this.index) {
            removeTask(this.index, entry.id);
        }
    }

    private enqueueCollectorRender(): void {
        if (!this.queue) {
            return;
        }

        void this.queue.enqueue({ kind: "collector", renderOnly: true }).catch((error) => {
            this.reportError("taskCollector.reconcileFailed", error, false);
        });
    }

    private async dropSourceEntries(sourceKey: string, scheduleCollectorRender: boolean): Promise<void> {
        if (!this.index) {
            return;
        }

        const ids = [...(this.index.sourceOrders[sourceKey] ?? [])];
        if (ids.length === 0) {
            return;
        }

        for (const id of ids) {
            removeTask(this.index, id);
        }
        delete this.index.sourceOrders[sourceKey];
        await this.persistIndex();
        if (scheduleCollectorRender) {
            await this.enqueueCollectorRender();
        }
    }

    private locateSourceTask(entry: TaskIndexEntry, content: string): IndexedTaskLocation | null {
        if (!this.index || !entry.source) {
            return null;
        }

        const blocks = parseTaskBlocks(content);
        const previous = getTasksForSource(this.index, entry.source, entry.sourceRoot ?? null);
        // Re-align on every call because the document may have changed since the index snapshot
        // was taken — using the live block list ensures we find the task at its current position.
        const alignment = alignTaskSequences(
            previous.map((item) => this.toSourceSnapshot(item)),
            blocks.map((block) => this.toTaskSnapshot(block.body, block.checked)),
        );

        for (const [blockIndex, id] of alignment.newIndexToId.entries()) {
            if (id === entry.id) {
                return {
                    block: blocks[blockIndex],
                    blockIndex,
                };
            }
        }

        return null;
    }

    // Three snapshot helpers for the same concept — a task entry converted to a TaskSnapshot —
    // with different path transforms applied. toSourceSnapshot uses the raw body (source-relative
    // paths); toCollectorSnapshot and toCollectorBody apply forward() to rewrite paths so they
    // are relative to the collector document's location.
    private toSourceSnapshot(entry: TaskIndexEntry): ExistingTaskSnapshot {
        return {
            id: entry.id,
            fingerprint: entry.fingerprint,
            body: entry.body,
            checked: entry.completed,
        };
    }

    private toCollectorSnapshot(entry: TaskIndexEntry): ExistingTaskSnapshot {
        const body = this.toCollectorBody(entry);
        return {
            id: entry.id,
            fingerprint: computeTaskFingerprint(body),
            body,
            checked: entry.completed,
        };
    }

    private toCollectorBody(entry: TaskIndexEntry): string {
        return entry.source ? forward(entry.body, entry.source, this.collectorPath ?? entry.source) : entry.body;
    }

    private toTaskSnapshot(body: string, checked: boolean): TaskSnapshot {
        return {
            fingerprint: computeTaskFingerprint(body),
            body,
            checked,
        };
    }

    private describeUri(uri: vscode.Uri): SourceContext | null {
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
        if (!workspaceFolder || !this.workspaceRoot || !isMarkdownPath(uri.path)) {
            return null;
        }

        const relativePath = normalizePath(path.relative(workspaceFolder.uri.fsPath, uri.fsPath));
        return {
            uri,
            workspaceFolder,
            sourceRoot: workspaceFolder.name,
            relativePath,
            sourceKey: makeSourceKey(relativePath, workspaceFolder.name),
        };
    }

    private resolveSourceUri(source: string | null, sourceRoot: string | null): vscode.Uri | null {
        if (!source) {
            return null;
        }

        const folders = vscode.workspace.workspaceFolders ?? [];
        const candidates = sourceRoot
            ? folders.filter((folder) => folder.name === sourceRoot)
            : folders;

        for (const folder of candidates) {
            return vscode.Uri.joinPath(folder.uri, ...source.split("/"));
        }

        return null;
    }

    private async findTrackedSources(config: TaskCollectorConfig): Promise<vscode.Uri[]> {
        const found = new Map<string, vscode.Uri>();
        const folders = vscode.workspace.workspaceFolders ?? [];

        for (const folder of folders) {
            for (const includePattern of config.include) {
                const results = await vscode.workspace.findFiles(new vscode.RelativePattern(folder, includePattern));
                for (const uri of results) {
                    if (await this.isTrackedSourceUri(uri, config)) {
                        found.set(uri.toString(), uri);
                    }
                }
            }
        }

        return [...found.values()].sort((left, right) => left.toString().localeCompare(right.toString()));
    }

    private async isTrackedSourceUri(uri: vscode.Uri, config?: TaskCollectorConfig): Promise<boolean> {
        if (!isMarkdownPath(uri.path)) {
            return false;
        }
        if (this.isCollectorUri(uri)) {
            return false;
        }

        const context = this.describeUri(uri);
        if (!context) {
            return false;
        }

        const effectiveConfig = config ?? await this.readConfig();
        if (context.relativePath.startsWith(".memoria/") || context.relativePath.startsWith("WorkspaceInitializationBackups/")) {
            return false;
        }

        const includeMatch = effectiveConfig.include.some((pattern) => minimatch(context.relativePath, pattern, { dot: true }));
        if (!includeMatch) {
            return false;
        }

        const excludePatterns = [
            ...effectiveConfig.exclude,
            "**/.memoria/**",
            "**/WorkspaceInitializationBackups/**",
        ];
        return !excludePatterns.some((pattern) => minimatch(context.relativePath, pattern, { dot: true }));
    }

    private isCollectorUri(uri: vscode.Uri): boolean {
        return this.collectorPath !== null && this.workspaceRoot !== null && uri.toString() === this.getCollectorUri().toString();
    }

    private getCollectorUri(): vscode.Uri {
        if (!this.workspaceRoot || !this.collectorPath) {
            throw new Error("Memoria: Task collector is not initialized.");
        }
        return vscode.Uri.joinPath(this.workspaceRoot, ...this.collectorPath.split("/"));
    }

    private async readConfig(): Promise<TaskCollectorConfig> {
        if (!this.workspaceRoot) {
            return { ...DEFAULT_TASK_COLLECTOR_CONFIG };
        }

        const stored = await this.manifest.readTaskCollectorConfig(this.workspaceRoot);
        return {
            completedRetentionDays: stored?.completedRetentionDays ?? DEFAULT_TASK_COLLECTOR_CONFIG.completedRetentionDays,
            syncOnStartup: stored?.syncOnStartup ?? DEFAULT_TASK_COLLECTOR_CONFIG.syncOnStartup,
            include: stored?.include ?? [...DEFAULT_TASK_COLLECTOR_CONFIG.include],
            exclude: stored?.exclude ?? [...DEFAULT_TASK_COLLECTOR_CONFIG.exclude],
            debounceMs: stored?.debounceMs ?? DEFAULT_TASK_COLLECTOR_CONFIG.debounceMs,
        };
    }

    private async persistIndex(): Promise<void> {
        if (!this.workspaceRoot || !this.index) {
            return;
        }
        await this.manifest.writeTaskIndex(this.workspaceRoot, this.index);
    }

    private reportError(eventName: string, error: unknown, toast: boolean): void {
        const message = error instanceof Error ? error.message : String(error);
        this.telemetry.logError(eventName, { message });
        if (toast) {
            vscode.window.showErrorMessage(`Memoria: Task sync failed — ${message}`);
        }
    }
}

function isMarkdownDocument(document: vscode.TextDocument): boolean {
    return isMarkdownPath(document.uri.path);
}

function isMarkdownPath(value: string): boolean {
    return value.toLowerCase().endsWith(".md");
}

async function openTextDocumentIfPresent(uri: vscode.Uri): Promise<vscode.TextDocument | null> {
    try {
        return await vscode.workspace.openTextDocument(uri);
    } catch {
        return null;
    }
}

function stringArrayEqual(left: string[], right: string[]): boolean {
    return left.length === right.length && left.every((value, index) => value === right[index]);
}

function taskEntriesEqual(left: TaskIndexEntry, right: TaskIndexEntry): boolean {
    return left.id === right.id
        && left.source === right.source
        && left.sourceRoot === right.sourceRoot
        && left.sourceOrder === right.sourceOrder
        && left.fingerprint === right.fingerprint
        && left.body === right.body
        && left.firstSeenAt === right.firstSeenAt
        && left.completed === right.completed
        && left.doneDate === right.doneDate
        && left.collectorOwned === right.collectorOwned
        && (left.agingSkipCount ?? 0) === (right.agingSkipCount ?? 0);
}
