/**
 * Date formatting utilities shared between built-in snippets,
 * contact snippets, and user-authored snippet files
 * (exposed via the `memoria-snippets` sandbox module).
 */

export interface ElapsedTime {
    years: number;
    months: number;
    totalMonths: number;
}

/**
 * Calculates the elapsed time between a date string and a reference date.
 * Returns years, months, and total months.
 */
export function elapsedSince(dateStr: string, now: Date = new Date()): ElapsedTime {
    const start = new Date(dateStr);
    const totalMonths = (now.getFullYear() - start.getFullYear()) * 12
        + (now.getMonth() - start.getMonth());
    return {
        years: Math.floor(totalMonths / 12),
        months: totalMonths % 12,
        totalMonths,
    };
}

/**
 * Formats elapsed time as a human-readable string.
 *
 * Examples:
 * - `"1 year, 3 months"`
 * - `"5 months"`
 * - `"2 years"`
 * - `"0 months"` (same month)
 */
export function formatElapsed(elapsed: ElapsedTime): string {
    const parts: string[] = [];
    if (elapsed.years > 0) {
        parts.push(`${elapsed.years} ${elapsed.years === 1 ? "year" : "years"}`);
    }
    if (elapsed.months > 0) {
        parts.push(`${elapsed.months} ${elapsed.months === 1 ? "month" : "months"}`);
    }
    return parts.length > 0 ? parts.join(", ") : "0 months";
}

// ── Date / time formatting ──────────────────────────────────────────

function pad(n: number): string {
    return n < 10 ? `0${n}` : `${n}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * Formats a `Date` into a date string using the given format token.
 *
 * Supported formats: `"YYYY-MM-dd"`, `"MM/dd/YYYY"`, `"dd MMM YYYY"`, `"YYYY"`.
 */
export function formatDate(now: Date, fmt: string): string {
    const yyyy = now.getFullYear();
    const mm = pad(now.getMonth() + 1);
    const dd = pad(now.getDate());
    const mon = MONTHS[now.getMonth()];

    switch (fmt) {
        case "YYYY-MM-dd":
            return `${yyyy}-${mm}-${dd}`;
        case "MM/dd/YYYY":
            return `${mm}/${dd}/${yyyy}`;
        case "dd MMM YYYY":
            return `${dd} ${mon} ${yyyy}`;
        case "YYYY":
            return `${yyyy}`;
        default:
            return `${yyyy}-${mm}-${dd}`;
    }
}

/**
 * Formats a `Date` into a time string using the given format token.
 *
 * Supported formats: `"HH"` (24 h:mm), `"HHs"` (24 h:mm:ss), `"hh"` (12 h:mm AM/PM).
 */
export function formatTime(now: Date, fmt: string): string {
    const hh24 = pad(now.getHours());
    const min = pad(now.getMinutes());
    const sec = pad(now.getSeconds());
    const hh12 = pad(now.getHours() % 12 || 12);
    const ampm = now.getHours() < 12 ? "AM" : "PM";

    switch (fmt) {
        case "HH":
            return `${hh24}:${min}`;
        case "HHs":
            return `${hh24}:${min}:${sec}`;
        case "hh":
            return `${hh12}:${min} ${ampm}`;
        default:
            return `${hh24}:${min}`;
    }
}

// ── ISO date / age helpers ──────────────────────────────────────────

/**
 * Formats a `Date` as an ISO date string (`YYYY-MM-DD`).
 */
export function formatISODate(value: Date): string {
    return value.toISOString().slice(0, 10);
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Returns the number of whole days between `doneDate` (an ISO date string)
 * and `now`.  Returns `0` when the date string is invalid.
 */
export function ageInDays(doneDate: string, now: Date): number {
    const doneAt = Date.parse(`${doneDate}T00:00:00.000Z`);
    if (Number.isNaN(doneAt)) {
        return 0;
    }
    return Math.floor(
        (Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - doneAt) / MS_PER_DAY,
    );
}
