// Pure reconciliation and aging logic extracted from TaskCollectorFeature.
// The feature class remains the orchestrator; this class handles business logic
// for syncing source files, the collector document, and expired-task aging.

import * as vscode from "vscode";
import type { ManifestManager } from "../../blueprints/manifestManager";
import type { TelemetryEmitter } from "../../telemetry";
import { formatISODate } from "../../utils/dateUtils";
import { isTaskExpired } from "./aging";
import { alignTaskSequences, computeTaskFingerprint } from "./taskAlignment";
import { renderCollector } from "./collectorFormatter";
import { reverse } from "./pathRewriter";
import { updateSourceTask, deleteSourceTask } from "./sourceTaskMutator";
import {
    DEFAULT_TASK_COLLECTOR_CONFIG,
    generateTaskId,
    getCollectorOrder,
    getSourceDisplayPath,
    getTasksForSource,
    pruneOrderReferences,
    removeTask,
    upsertTask,
} from "./taskIndex";
import { parseCollectorDocument, parseTaskBlocks, markSubtasksCompleted } from "./taskParser";
import { renderDoneBlock, renderTaskBlock, replaceLineRange } from "./taskWriter";
import type { TaskWriter } from "./taskWriter";
import { openTextDocumentIfPresent, stringArrayEqual, taskEntriesEqual } from "./taskHelpers";
import {
    describeUri,
    resolveSourceUri,
    getCollectorUri,
} from "./taskCollectorPathResolver";
import {
    toSourceSnapshot,
    toCollectorSnapshot,
    toCollectorBody,
    toTaskSnapshot,
    locateSourceTask,
} from "./taskCollectorTransformer";
import type { StoredTaskIndex, TaskBlock, TaskCollectorConfig, TaskIndexEntry } from "./types";

/**
 * Maximum number of consecutive aging passes that can fail to locate a task
 * in its source file before the task is removed from the index. Prevents
 * indefinite accumulation of unreachable ghost entries.
 */
export const MAX_AGING_SKIP_COUNT = 5;

export interface TaskCollectorState {
    index: StoredTaskIndex | null;
    workspaceRoot: vscode.Uri | null;
    collectorPath: string | null;
    writer: TaskWriter | null;
    bootstrapPending: boolean;
}

export class TaskReconciler {
    constructor(
        private readonly state: TaskCollectorState,
        private readonly manifest: ManifestManager,
        private readonly telemetry: TelemetryEmitter,
        private readonly now: () => Date,
    ) {}

    async reconcileSource(
        uri: vscode.Uri,
        scheduleCollectorRender: boolean,
        enqueueCollectorRender: () => void,
    ): Promise<void> {
        if (!this.state.index) {
            return;
        }

        const context = describeUri(uri, this.state.workspaceRoot);
        if (!context) {
            return;
        }

        let document: vscode.TextDocument;
        try {
            document = await vscode.workspace.openTextDocument(uri);
        } catch {
            await this.dropSourceEntries(context.sourceKey, scheduleCollectorRender, enqueueCollectorRender);
            return;
        }

        const parsed = parseTaskBlocks(document.getText());
        const previousEntries = getTasksForSource(this.state.index, context.relativePath, context.sourceRoot);
        const previousSnapshots = previousEntries.map((entry) => toSourceSnapshot(entry));
        const nextSnapshots = parsed.map((block) => toTaskSnapshot(block.body, block.checked));
        // Alignment assigns each new task a stable ID from the previous snapshot, preventing
        // phantom duplicate tasks from appearing in the collector when source files are edited.
        const alignment = alignTaskSequences(previousSnapshots, nextSnapshots);
        const today = formatISODate(this.now());
        const nowIso = this.now().toISOString();
        const nextOrder: string[] = [];
        let changed = false;
        const subtaskUpdates: Array<{ block: TaskBlock; nextBody: string }> = [];

        for (const [blockIndex, block] of parsed.entries()) {
            const matchedId = alignment.newIndexToId.get(blockIndex);
            const previous = matchedId ? this.state.index.tasks[matchedId] : null;
            const id = matchedId ?? generateTaskId(this.state.index);
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

            upsertTask(this.state.index, nextEntry);
            nextOrder.push(id);
        }

        for (const deletedId of alignment.deletedIds) {
            removeTask(this.state.index, deletedId);
            changed = true;
        }

        if (!stringArrayEqual(this.state.index.sourceOrders[context.sourceKey] ?? [], nextOrder)) {
            this.state.index.sourceOrders[context.sourceKey] = nextOrder;
            changed = true;
        }

        pruneOrderReferences(this.state.index);
        if (!changed) {
            return;
        }

        await this.persistIndex();

        // Write back to source to mark subtasks as completed when their parent was just completed.
        if (subtaskUpdates.length > 0) {
            await this.state.writer!.mutateDocument(uri, (_document, currentText, eol) => {
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
            enqueueCollectorRender();
        }
    }

    async reconcileCollector(renderOnly: boolean, skipDirtyGuard = false): Promise<void> {
        // renderOnly=true skips the "read collector edits" pass and only re-renders the collector
        // from the current index. This separates the write phase from the read phase to avoid
        // re-entrancy when a source reconciliation needs to update the collector without first
        // applying (potentially stale) collector edits.
        if (!this.state.index || !this.state.writer || !this.state.collectorPath) {
            return;
        }

        const collectorUri = getCollectorUri(this.state.workspaceRoot, this.state.collectorPath);
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

        const rendered = renderCollector(this.state.index!);
        this.state.index!.collectorOrder.active = rendered.activeOrder;
        this.state.index!.collectorOrder.completed = rendered.completedOrder;
        await this.persistIndex();
        await this.state.writer!.mutateDocument(
            collectorUri,
            () => rendered.content,
            { allowCreate: true },
        );
    }

    private async applyCollectorEdits(document: vscode.TextDocument): Promise<void> {
        if (!this.state.index || !this.state.collectorPath) {
            return;
        }

        const parsed = parseCollectorDocument(document.getText());
        const previousOrder = [
            ...getCollectorOrder(this.state.index, false),
            ...getCollectorOrder(this.state.index, true),
        ];
        const previousSnapshots = previousOrder
            .map((id) => this.state.index?.tasks[id])
            .filter((entry): entry is TaskIndexEntry => Boolean(entry))
            .map((entry) => toCollectorSnapshot(entry, this.state.collectorPath));
        const nextSnapshots = parsed.tasks.map((task) => toTaskSnapshot(task.body, task.checked));
        const alignment = alignTaskSequences(previousSnapshots, nextSnapshots);
        const activeOrder: string[] = [];
        const completedOrder: string[] = [];
        const nowIso = this.now().toISOString();
        const today = formatISODate(this.now());

        for (const [taskIndex, task] of parsed.tasks.entries()) {
            const matchedId = alignment.newIndexToId.get(taskIndex);
            const previous = matchedId ? this.state.index.tasks[matchedId] : null;
            const nextCompleted = task.checked;
            const id = matchedId ?? generateTaskId(this.state.index);
            // reverse() converts collector-relative link paths back to source-relative paths
            // before storing the body in the index, so the index always holds source-relative content.
            const bodyForIndex = previous?.source && !previous.collectorOwned
                ? reverse(task.body, this.state.collectorPath!, previous.source, previous.body)
                : task.body;
            const normalizedBodyForIndex = nextCompleted ? markSubtasksCompleted(bodyForIndex, today) : bodyForIndex;

            if (previous?.source && !previous.collectorOwned) {
                const collectorBody = toCollectorBody(previous, this.state.collectorPath);
                if (collectorBody !== task.body || previous.completed !== nextCompleted) {
                    await updateSourceTask(this.state.writer!, this.state.index!, previous, normalizedBodyForIndex, nextCompleted);
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

            upsertTask(this.state.index, updated);
            if (nextCompleted) {
                completedOrder.push(id);
            } else {
                activeOrder.push(id);
            }
        }

        for (const deletedId of alignment.deletedIds) {
            const entry = this.state.index.tasks[deletedId];
            if (entry?.source && !entry.collectorOwned) {
                await deleteSourceTask(this.state.writer!, this.state.index!, entry);
            }
            removeTask(this.state.index, deletedId);
        }

        this.state.index.collectorOrder.active = activeOrder;
        this.state.index.collectorOrder.completed = completedOrder;
        pruneOrderReferences(this.state.index);
    }

    async runAgingPass(): Promise<void> {
        if (!this.state.index || !this.state.writer) {
            return;
        }

        const config = await this.readConfig();
        const now = this.now();
        const expired = Object.values(this.state.index.tasks).filter((entry) => isTaskExpired(entry, config.completedRetentionDays, now));

        for (const entry of expired) {
            if (entry.collectorOwned || !entry.source) {
                removeTask(this.state.index, entry.id);
                continue;
            }

            const sourceUri = resolveSourceUri(entry.source, entry.sourceRoot ?? null);
            if (!sourceUri) {
                this.bumpAgingSkip(entry);
                continue;
            }

            let rewriteStatus: "unchanged" | "rewritten" | "missing" | "mismatch" = "unchanged";
            const changed = await this.state.writer.mutateDocument(sourceUri, (_document, currentText, eol) => {
                const location = locateSourceTask(this.state.index!, entry, currentText);
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
                removeTask(this.state.index, entry.id);
                continue;
            }

            this.telemetry.logError("taskCollector.agingRewriteSkipped", {
                reason: rewriteStatus,
                source: getSourceDisplayPath(entry) ?? "unknown",
            });
            this.bumpAgingSkip(entry);
        }

        pruneOrderReferences(this.state.index);
    }

    // agingSkipCount tracks how many times the aging pass could not locate a task in its source
    // file. Tasks that cannot be located are retried rather than removed immediately. After 5
    // consecutive skips (task is permanently unreachable) the task is removed to prevent
    // indefinite accumulation of ghost entries in the index.
    private bumpAgingSkip(entry: TaskIndexEntry): void {
        entry.agingSkipCount = (entry.agingSkipCount ?? 0) + 1;
        if ((entry.agingSkipCount ?? 0) >= MAX_AGING_SKIP_COUNT && this.state.index) {
            removeTask(this.state.index, entry.id);
        }
    }

    async readConfig(): Promise<TaskCollectorConfig> {
        if (!this.state.workspaceRoot) {
            return { ...DEFAULT_TASK_COLLECTOR_CONFIG };
        }

        const stored = await this.manifest.readTaskCollectorConfig(this.state.workspaceRoot);
        if (!stored) {
            return { ...DEFAULT_TASK_COLLECTOR_CONFIG };
        }

        return { ...DEFAULT_TASK_COLLECTOR_CONFIG, ...stored };
    }

    async persistIndex(): Promise<void> {
        if (!this.state.workspaceRoot || !this.state.index) {
            return;
        }
        await this.manifest.writeTaskIndex(this.state.workspaceRoot, this.state.index);
    }

    private async dropSourceEntries(
        sourceKey: string,
        scheduleCollectorRender: boolean,
        enqueueCollectorRender: () => void,
    ): Promise<void> {
        if (!this.state.index) {
            return;
        }

        const ids = [...(this.state.index.sourceOrders[sourceKey] ?? [])];
        if (ids.length === 0) {
            return;
        }

        for (const id of ids) {
            removeTask(this.state.index, id);
        }
        delete this.state.index.sourceOrders[sourceKey];
        await this.persistIndex();
        if (scheduleCollectorRender) {
            enqueueCollectorRender();
        }
    }
}
