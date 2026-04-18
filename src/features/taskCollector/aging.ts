import type { TaskIndexEntry } from "./types";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function formatDate(value: Date): string {
    return value.toISOString().slice(0, 10);
}

export function ageInDays(doneDate: string, now: Date): number {
    const doneAt = Date.parse(`${doneDate}T00:00:00.000Z`);
    if (Number.isNaN(doneAt)) {
        return 0;
    }
    return Math.floor((Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - doneAt) / MS_PER_DAY);
}

export function isTaskExpired(entry: TaskIndexEntry, retentionDays: number, now: Date): boolean {
    if (!entry.completed || !entry.doneDate) {
        return false;
    }
    return ageInDays(entry.doneDate, now) > retentionDays;
}
