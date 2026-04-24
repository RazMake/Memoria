/**
 * Shared regex patterns for markdown task checkbox parsing.
 * Used by taskParser, documentSerializer, and todoTaskHelpers.
 */

/** Matches a full task line: indent + `- [x]` or `- [ ]` + optional text. */
export const TASK_LINE_RE = /^([ \t]*)- \[([ xX])\](?:\s?(.*))?$/;

/** Matches a subtask checkbox marker anywhere in a line (not anchored to start). */
export const SUBTASK_CHECKBOX_RE = /- \[[ xX]\]/;

/** Matches a "Completed YYYY-MM-DD" metadata line (italic-wrapped). */
export const SUBTASK_COMPLETED_RE = /^\s*_Completed \d{4}-\d{2}-\d{2}_$/;

/** Returns true when the checkbox marker indicates a completed task. */
export function isChecked(marker: string): boolean {
    return marker === "x" || marker === "X";
}
