import { ageInDays, formatISODate } from "../snippets/dateUtils";
import type { TaskIndexEntry } from "./types";

export { ageInDays };

export function formatDate(value: Date): string {
    return formatISODate(value);
}

// Completed tasks are retained for completedRetentionDays so the user can review recent
// history in the collector and undo accidental completions. After the retention window
// expires, they are removed from the collector and the source file during the aging pass.
export function isTaskExpired(entry: TaskIndexEntry, retentionDays: number, now: Date): boolean {
    if (!entry.completed || !entry.doneDate) {
        return false;
    }
    return ageInDays(entry.doneDate, now) > retentionDays;
}
