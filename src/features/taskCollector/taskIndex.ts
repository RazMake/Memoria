// Stable task identity layer for the task collector.
// The index (persisted as .memoria/tasks-index.json) maps short random IDs to task entries,
// allowing tasks to be tracked across document edits, renames, and collector round-trips
// without embedding any mutable identifier into the source markdown text.
import { randomBytes } from "node:crypto";
import type {
    CollectorOrder,
    StoredTaskIndex,
    TaskCollectorConfig,
    TaskIndexEntry,
} from "./types";

export const DEFAULT_TASK_COLLECTOR_CONFIG: TaskCollectorConfig = {
    completedRetentionDays: 7,
    syncOnStartup: true,
    include: ["**/*.md"],
    exclude: ["**/node_modules/**", "**/.git/**", "**/.memoria/**"],
    debounceMs: 300,
};

export function createEmptyTaskIndex(collectorPath: string): StoredTaskIndex {
    return {
        version: 1,
        collectorPath,
        tasks: {},
        collectorOrder: {
            active: [],
            completed: [],
        },
        sourceOrders: {},
    };
}

export function hydrateTaskIndex(
    stored: StoredTaskIndex | null,
    collectorPath: string,
): StoredTaskIndex {
    const index = stored && stored.version === 1
        ? {
            version: 1 as const,
            collectorPath,
            tasks: stored.tasks ?? {},
            collectorOrder: normalizeCollectorOrder(stored.collectorOrder),
            sourceOrders: stored.sourceOrders ?? {},
        }
        : createEmptyTaskIndex(collectorPath);

    index.collectorPath = collectorPath;
    pruneOrderReferences(index);
    return index;
}

export function generateTaskId(index: StoredTaskIndex): string {
    // Task lists are rarely >1000 items; the 3-byte (6-hex-char) random ID space makes
    // collision probability negligible. The loop is a safety valve, not expected to iterate.
    while (true) {
        const id = `mem-${randomBytes(3).toString("hex")}`;
        if (!index.tasks[id]) {
            return id;
        }
    }
}

export function makeSourceKey(sourcePath: string, sourceRoot: string | null = null): string {
    return sourceRoot ? `${sourceRoot}:${sourcePath}` : sourcePath;
}

export function getSourceDisplayPath(entry: Pick<TaskIndexEntry, "source" | "sourceRoot">): string | null {
    if (!entry.source) {
        return null;
    }
    return entry.sourceRoot ? `${entry.sourceRoot}/${entry.source}` : entry.source;
}

export function getTasksForSource(index: StoredTaskIndex, sourcePath: string, sourceRoot: string | null = null): TaskIndexEntry[] {
    const sourceKey = makeSourceKey(sourcePath, sourceRoot);
    const order = index.sourceOrders[sourceKey] ?? [];
    const ordered = order
        .map((id) => index.tasks[id])
        .filter((entry): entry is TaskIndexEntry => Boolean(entry));

    const knownIds = new Set(order);
    const extras = Object.values(index.tasks)
        .filter((entry) => entry.source === sourcePath && (entry.sourceRoot ?? null) === sourceRoot && !knownIds.has(entry.id))
        .sort(compareBySourceOrderThenSeenAt);

    return [...ordered, ...extras];
}

export function removeTask(index: StoredTaskIndex, id: string): void {
    delete index.tasks[id];
    index.collectorOrder.active = index.collectorOrder.active.filter((value) => value !== id);
    index.collectorOrder.completed = index.collectorOrder.completed.filter((value) => value !== id);

    for (const [sourcePath, ids] of Object.entries(index.sourceOrders)) {
        const filtered = ids.filter((value) => value !== id);
        if (filtered.length === 0) {
            delete index.sourceOrders[sourcePath];
        } else {
            index.sourceOrders[sourcePath] = filtered;
        }
    }
}

export function upsertTask(index: StoredTaskIndex, entry: TaskIndexEntry): void {
    index.tasks[entry.id] = entry;
}

export function getCollectorOrder(index: StoredTaskIndex, completed: boolean): string[] {
    const wantedIds = Object.values(index.tasks)
        .filter((entry) => entry.completed === completed)
        .map((entry) => entry.id);
    const configured = completed ? index.collectorOrder.completed : index.collectorOrder.active;
    const seen = new Set<string>();
    const ordered = configured.filter((id) => {
        if (!wantedIds.includes(id) || seen.has(id)) {
            return false;
        }
        seen.add(id);
        return true;
    });

    const extras = wantedIds.filter((id) => !seen.has(id));
    return [...extras, ...ordered];
}

// Must be called after any task removal: sourceOrders and collectorOrder may still reference
// IDs that were just deleted, which would produce phantom entries on the next read.
export function pruneOrderReferences(index: StoredTaskIndex): void {
    const taskIds = new Set(Object.keys(index.tasks));

    index.collectorOrder.active = unique(index.collectorOrder.active).filter((id) => taskIds.has(id) && !index.tasks[id].completed);
    index.collectorOrder.completed = unique(index.collectorOrder.completed).filter((id) => taskIds.has(id) && index.tasks[id].completed);

    for (const [sourcePath, ids] of Object.entries(index.sourceOrders)) {
        const filtered = unique(ids).filter((id) => {
            if (!taskIds.has(id)) {
                return false;
            }
            const entry = index.tasks[id];
            if (!entry.source) {
                return false;
            }
            return makeSourceKey(entry.source, entry.sourceRoot ?? null) === sourcePath;
        });
        if (filtered.length === 0) {
            delete index.sourceOrders[sourcePath];
        } else {
            index.sourceOrders[sourcePath] = filtered;
        }
    }
}

function normalizeCollectorOrder(order: CollectorOrder | undefined): CollectorOrder {
    return {
        active: order?.active ?? [],
        completed: order?.completed ?? [],
    };
}

function unique(values: string[]): string[] {
    return [...new Set(values)];
}

function compareBySourceOrderThenSeenAt(left: TaskIndexEntry, right: TaskIndexEntry): number {
    const sourceOrderDiff = (left.sourceOrder ?? Number.MAX_SAFE_INTEGER) - (right.sourceOrder ?? Number.MAX_SAFE_INTEGER);
    if (sourceOrderDiff !== 0) {
        return sourceOrderDiff;
    }

    if (left.firstSeenAt < right.firstSeenAt) {
        return -1;
    }
    if (left.firstSeenAt > right.firstSeenAt) {
        return 1;
    }
    return left.id.localeCompare(right.id);
}