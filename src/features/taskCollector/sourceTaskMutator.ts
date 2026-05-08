// Handles write-back operations from the task index to source markdown files.
// Separated from the orchestrator so source mutation logic is testable independently.

import type { TaskWriter } from "./taskWriter";
import { renderTaskBlock, renderDoneBlock, replaceLineRange } from "./taskWriter";
import { resolveSourceUri } from "./taskCollectorPathResolver";
import { locateSourceTask } from "./taskCollectorTransformer";
import type { StoredTaskIndex, TaskBlock, TaskIndexEntry } from "./types";

/** Modifies a task block in its source file using a replacement builder function. */
export async function modifySourceTask(
    writer: TaskWriter,
    index: StoredTaskIndex,
    entry: TaskIndexEntry,
    buildReplacement: (block: TaskBlock) => string,
): Promise<void> {
    const sourceUri = resolveSourceUri(entry.source, entry.sourceRoot ?? null);
    if (!sourceUri) {
        return;
    }

    await writer.mutateDocument(sourceUri, (_document, currentText, eol) => {
        const location = locateSourceTask(index, entry, currentText);
        if (!location) {
            return currentText;
        }

        return replaceLineRange(
            currentText,
            location.block.bodyRange.startLine,
            location.block.bodyRange.endLine,
            buildReplacement(location.block),
            eol,
        );
    });
}

/** Updates a task in its source file with new body content and completion status. */
export async function updateSourceTask(
    writer: TaskWriter,
    index: StoredTaskIndex,
    entry: TaskIndexEntry,
    body: string,
    checked: boolean,
): Promise<void> {
    await modifySourceTask(writer, index, entry, (block) => renderTaskBlock(block, body, checked));
}

/** Removes a task from its source file. */
export async function deleteSourceTask(
    writer: TaskWriter,
    index: StoredTaskIndex,
    entry: TaskIndexEntry,
): Promise<void> {
    await modifySourceTask(writer, index, entry, () => "");
}
