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