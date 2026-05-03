// Pure data-shape conversions between index entries and task snapshots.
// Extracted from TaskCollectorFeature to keep the orchestrator focused on
// lifecycle and event handling.

import { alignTaskSequences, computeTaskFingerprint } from "./taskAlignment";
import { forward } from "./pathRewriter";
import type { IndexedTaskLocation } from "./taskHelpers";
import { parseTaskBlocks } from "./taskParser";
import { getTasksForSource } from "./taskIndex";
import type { ExistingTaskSnapshot, StoredTaskIndex, TaskIndexEntry, TaskSnapshot } from "./types";

export function toSourceSnapshot(entry: TaskIndexEntry): ExistingTaskSnapshot {
    return {
        id: entry.id,
        fingerprint: entry.fingerprint,
        body: entry.body,
        checked: entry.completed,
    };
}

export function toCollectorSnapshot(entry: TaskIndexEntry, collectorPath: string | null): ExistingTaskSnapshot {
    const body = toCollectorBody(entry, collectorPath);
    return {
        id: entry.id,
        fingerprint: computeTaskFingerprint(body),
        body,
        checked: entry.completed,
    };
}

export function toCollectorBody(entry: TaskIndexEntry, collectorPath: string | null): string {
    return entry.source ? forward(entry.body, entry.source, collectorPath ?? entry.source) : entry.body;
}

export function toTaskSnapshot(body: string, checked: boolean): TaskSnapshot {
    return {
        fingerprint: computeTaskFingerprint(body),
        body,
        checked,
    };
}

/**
 * Locates a task in the current content of its source file by re-aligning
 * the live task blocks against the index snapshot.
 */
export function locateSourceTask(
    index: StoredTaskIndex,
    entry: TaskIndexEntry,
    content: string,
): IndexedTaskLocation | null {
    if (!entry.source) {
        return null;
    }

    const blocks = parseTaskBlocks(content);
    const previous = getTasksForSource(index, entry.source, entry.sourceRoot ?? null);
    const alignment = alignTaskSequences(
        previous.map((item) => toSourceSnapshot(item)),
        blocks.map((block) => toTaskSnapshot(block.body, block.checked)),
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
