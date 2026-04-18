import { forward } from "./pathRewriter";
import { getCollectorOrder, getSourceDisplayPath } from "./taskIndex";
import type { CollectorRenderResult, StoredTaskIndex, TaskIndexEntry } from "./types";

export function renderCollector(index: StoredTaskIndex): CollectorRenderResult {
    const activeOrder = getCollectorOrder(index, false);
    const completedOrder = getCollectorOrder(index, true);
    const lines: string[] = ["# To do", ""];

    for (const id of activeOrder) {
        const entry = index.tasks[id];
        if (!entry) {
            continue;
        }
        lines.push(...renderEntry(entry, index.collectorPath));
    }

    if (activeOrder.length > 0) {
        lines.push("");
    }
    lines.push("# Completed", "");

    for (const id of completedOrder) {
        const entry = index.tasks[id];
        if (!entry) {
            continue;
        }
        lines.push(...renderEntry(entry, index.collectorPath));
    }

    lines.push("");

    return {
        content: lines.join("\n").replace(/\n+$/g, "\n"),
        activeOrder,
        completedOrder,
    };
}

function renderEntry(entry: TaskIndexEntry, collectorPath: string): string[] {
    const body = entry.source
        ? forward(entry.body, entry.source, collectorPath)
        : entry.body;
    const bodyLines = body.split("\n");
    const lines = [`- [${entry.completed ? "x" : " "}] ${bodyLines[0] ?? ""}`];

    for (const continuationLine of bodyLines.slice(1)) {
        lines.push(continuationLine);
    }

    if (entry.completed) {
        const suffixParts: string[] = [];
        const sourceDisplayPath = getSourceDisplayPath(entry);
        if (sourceDisplayPath && !entry.collectorOwned) {
            suffixParts.push(`Source: ${sourceDisplayPath}`);
        }
        if (entry.doneDate) {
            suffixParts.push(`Completed ${entry.doneDate}`);
        }
        if (suffixParts.length > 0) {
            lines.push(`      _${suffixParts.join(" · ")}_`);
        }
    }

    return lines;
}