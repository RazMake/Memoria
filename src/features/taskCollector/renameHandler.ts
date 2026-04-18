// Rename event handler for tracked source files.
// Rename events fire before the file content changes, so the index must be updated with
// the new paths before the subsequent save reconciliation reads the file. Keeping this
// logic separate from the main feature class keeps the event handler lean and testable.
import { makeSourceKey } from "./taskIndex";
import type { StoredTaskIndex } from "./types";

export interface SourceRename {
    oldSource: string;
    oldSourceRoot: string | null;
    newSource: string;
    newSourceRoot: string | null;
}

export function applySourceRenames(index: StoredTaskIndex, renames: SourceRename[]): boolean {
    if (renames.length === 0) {
        return false;
    }

    let changed = false;

    for (const rename of renames) {
        const oldKey = makeSourceKey(rename.oldSource, rename.oldSourceRoot);
        const newKey = makeSourceKey(rename.newSource, rename.newSourceRoot);
        const existingOrder = index.sourceOrders[oldKey];
        if (existingOrder) {
            delete index.sourceOrders[oldKey];
            index.sourceOrders[newKey] = existingOrder;
            changed = true;
        }

        for (const entry of Object.values(index.tasks)) {
            if (entry.source === rename.oldSource && (entry.sourceRoot ?? null) === rename.oldSourceRoot) {
                entry.source = rename.newSource;
                entry.sourceRoot = rename.newSourceRoot;
                changed = true;
            }
        }
    }

    return changed;
}
