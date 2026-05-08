import { ageInDays } from "../../utils/dateUtils";
import type { TaskIndexEntry } from "./types";

// Completed tasks are retained for completedRetentionDays so the user can review recent
// history in the collector and undo accidental completions. After the retention window
// expires, they are removed from the collector and the source file during the aging pass.
export function isTaskExpired(entry: TaskIndexEntry, retentionDays: number, now: Date): boolean {
    if (!entry.completed || !entry.doneDate) {
        return false;
    }
    return ageInDays(entry.doneDate, now) > retentionDays;
}
