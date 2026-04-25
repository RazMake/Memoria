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
const MONTHS_FULL = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAYS_OF_WEEK = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/**
 * Formats a `Date` into a date string using the given format token.
 *
 * Supported formats: `"YYYY-MM-dd"`, `"MM/dd/YYYY"`, `"dddd, MMM dd, YYYY"`.
 */
export function formatDate(now: Date, fmt: string): string {
    const yyyy = now.getFullYear();
    const mm = pad(now.getMonth() + 1);
    const dd = pad(now.getDate());
    const mon = MONTHS[now.getMonth()];
    const dayName = DAYS_OF_WEEK[now.getDay()];
    const monthFull = MONTHS_FULL[now.getMonth()];

    switch (fmt) {
        case "YYYY-MM-dd":
            return `${yyyy}-${mm}-${dd}`;
        case "MM/dd/YYYY":
            return `${mm}/${dd}/${yyyy}`;
        case "dddd, MMM dd, YYYY":
            return `${dayName}, ${monthFull} ${dd}, ${yyyy}`;
        default:
            return `${yyyy}-${mm}-${dd}`;
    }
}

/**
 * Formats a `Date` into a time string using the given format token.
 *
 * Supported formats: `"HH:mm"`, `"HH:mm:ss"`, `"hh:mm AM/PM"`, `"hh:mm:ss AM/PM"`.
 */
export function formatTime(now: Date, fmt: string): string {
    const hh24 = pad(now.getHours());
    const min = pad(now.getMinutes());
    const sec = pad(now.getSeconds());
    const hh12 = pad(now.getHours() % 12 || 12);
    const ampm = now.getHours() < 12 ? "AM" : "PM";

    switch (fmt) {
        case "HH:mm":
            return `${hh24}:${min}`;
        case "HH:mm:ss":
            return `${hh24}:${min}:${sec}`;
        case "hh:mm AM/PM":
            return `${hh12}:${min} ${ampm}`;
        case "hh:mm:ss AM/PM":
            return `${hh12}:${min}:${sec} ${ampm}`;
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

// ── Due-in / due-by helpers ─────────────────────────────────────────

function addDays(base: Date, days: number): Date {
    const result = new Date(base);
    result.setDate(result.getDate() + days);
    return result;
}

function formatDueLabel(days: number): string {
    const weeks = Math.floor(days / 7);
    const remainder = days % 7;
    if (weeks === 0) {
        return `${days} ${days === 1 ? "day" : "days"}`;
    }
    if (remainder === 0) {
        return `${weeks} ${weeks === 1 ? "week" : "weeks"}`;
    }
    return `${weeks} ${weeks === 1 ? "week" : "weeks"} and ${remainder} ${remainder === 1 ? "day" : "days"}`;
}

/**
 * Formats a "due in" string for the given number of days from `now`.
 *
 * Example: `"in 1 week and 3 days (by Wednesday, April 29, 2026)"`
 */
export function formatDueIn(days: number, now: Date = new Date()): string {
    const target = addDays(now, days);
    const byDate = formatDate(target, "dddd, MMM dd, YYYY");
    return `in ${formatDueLabel(days)} (by ${byDate})`;
}

/**
 * Formats a "due by" string for the given number of days from `now`.
 *
 * Example: `"by Wednesday, April 29, 2026"`
 */
export function formatDueBy(days: number, now: Date = new Date()): string {
    const target = addDays(now, days);
    const byDate = formatDate(target, "dddd, MMM dd, YYYY");
    return `by ${byDate}`;
}
