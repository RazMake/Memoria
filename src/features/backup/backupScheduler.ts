/** Computes next scheduled backup occurrence for a profile. */

import type { BackupSchedule, DayOfWeek } from "./types";

const DAY_ORDER: DayOfWeek[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

/**
 * Returns the next Date at which the schedule should fire, starting from `from`.
 * Returns null if `schedule.days` is empty.
 */
export function nextOccurrence(schedule: BackupSchedule, from: Date): Date | null {
    if (schedule.days.length === 0) return null;

    const [hours, minutes] = parseTime(schedule.time);

    // Try up to 7 days ahead
    for (let offset = 0; offset <= 7; offset++) {
        const candidate = new Date(from);
        candidate.setDate(candidate.getDate() + offset);
        candidate.setHours(hours, minutes, 0, 0);

        const dow = DAY_ORDER[candidate.getDay()] as DayOfWeek;
        if (!schedule.days.includes(dow)) continue;

        // If it's today, the time must be in the future
        if (offset === 0 && candidate.getTime() <= from.getTime()) continue;

        return candidate;
    }

    return null;
}

/**
 * Returns the most recent Date at which the schedule should have fired
 * at or before `now`. Returns null if `schedule.days` is empty.
 */
export function mostRecentOccurrence(schedule: BackupSchedule, now: Date): Date | null {
    if (schedule.days.length === 0) return null;

    const [hours, minutes] = parseTime(schedule.time);

    // Look back up to 7 days
    for (let offset = 0; offset <= 7; offset++) {
        const candidate = new Date(now);
        candidate.setDate(candidate.getDate() - offset);
        candidate.setHours(hours, minutes, 0, 0);

        const dow = DAY_ORDER[candidate.getDay()] as DayOfWeek;
        if (!schedule.days.includes(dow)) continue;

        if (candidate.getTime() <= now.getTime()) {
            return candidate;
        }
    }

    return null;
}

function parseTime(time: string): [number, number] {
    const parts = time.split(":");
    const h = parseInt(parts[0] ?? "0", 10);
    const m = parseInt(parts[1] ?? "0", 10);
    return [isNaN(h) ? 0 : h, isNaN(m) ? 0 : m];
}
