export type CollectorSection = "active" | "completed";

export interface TaskBodyRange {
    startLine: number;
    endLine: number;
}

export interface TaskBlock {
    indent: number;
    indentText: string;
    checked: boolean;
    firstLineText: string;
    continuationLines: string[];
    bodyRange: TaskBodyRange;
    body: string;
    rawLines: string[];
}

export interface ParsedCollectorSuffix {
    rawLine: string;
    rawText: string;
    source: string | null;
    completedDate: string | null;
}

export interface ParsedCollectorTask extends TaskBlock {
    section: CollectorSection;
    bodyWithoutSuffix: string;
    suffix: ParsedCollectorSuffix | null;
}

export interface ParsedCollectorDocument {
    active: ParsedCollectorTask[];
    completed: ParsedCollectorTask[];
    tasks: ParsedCollectorTask[];
}

export interface TaskCollectorConfig {
    completedRetentionDays: number;
    syncOnStartup: boolean;
    include: string[];
    exclude: string[];
    debounceMs: number;
}

/** One tracked task entry in the index.
 *  - `collectorOwned` — true when the task was added directly in the collector document
 *    rather than harvested from a source file; such tasks have no source path.
 *  - `agingSkipCount` — incremented each time the aging pass cannot locate the task
 *    in its source file. After 5 skips the task is removed to prevent accumulation. */
export interface TaskIndexEntry {
    id: string;
    source: string | null;
    sourceRoot: string | null;
    sourceOrder: number | null;
    fingerprint: string;
    body: string;
    firstSeenAt: string;
    completed: boolean;
    doneDate: string | null;
    collectorOwned: boolean;
    agingSkipCount?: number;
}

export interface CollectorOrder {
    active: string[];
    completed: string[];
}

/** Persisted task index (`.memoria/tasks-index.json`).
 *  Maps short random task IDs to their entries and records the canonical ordering
 *  of tasks in both the collector document and each source file. Versioned to allow
 *  future schema migrations. */
export interface StoredTaskIndex {
    version: 1;
    collectorPath: string;
    tasks: Record<string, TaskIndexEntry>;
    collectorOrder: CollectorOrder;
    sourceOrders: Record<string, string[]>;
}

export interface TaskSnapshot {
    fingerprint: string;
    body: string;
    checked: boolean;
}

export interface ExistingTaskSnapshot extends TaskSnapshot {
    id: string;
}

export interface AlignmentResult {
    newIndexToId: Map<number, string>;
    deletedIds: string[];
    newIndices: number[];
}

/** Describes a single unit of work for the sync queue.
 *  - `"full"`      — re-scan all tracked sources and rewrite the collector; used on startup
 *                    and after deletes or workspace folder changes.
 *  - `"source"`    — re-parse a single source file and update the index + collector.
 *  - `"collector"` — read collector edits back into the index (renderOnly=false) or just
 *                    re-render the collector from the index (renderOnly=true). */
export interface SyncJob {
    kind: "source" | "collector" | "full";
    uri?: string;
    renderOnly?: boolean;
}

export interface CollectorRenderResult {
    content: string;
    activeOrder: string[];
    completedOrder: string[];
}