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
function pluralize(n: number, singular: string): string {
    return `${n} ${n === 1 ? singular : singular + "s"}`;
}

export function formatElapsed(elapsed: ElapsedTime): string {
    const parts: string[] = [];
    if (elapsed.years > 0) {
        parts.push(pluralize(elapsed.years, "year"));
    }
    if (elapsed.months > 0) {
        parts.push(pluralize(elapsed.months, "month"));
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
 * Formats a `Date` into a date string using the given format template.
 *
 * Supported tokens: `YYYY` (year), `MMM` (full month name), `MM` (zero-padded month),
 * `dddd` (day-of-week name), `dd` (zero-padded day).
 */
export function formatDate(now: Date, fmt: string): string {
    const tokens: Record<string, string> = {
        YYYY: String(now.getFullYear()),
        MMM: MONTHS_FULL[now.getMonth()],
        MM: pad(now.getMonth() + 1),
        dddd: DAYS_OF_WEEK[now.getDay()],
        dd: pad(now.getDate()),
    };

    return fmt.replace(/YYYY|MMM|MM|dddd|dd/g, (match) => tokens[match]);
}

/**
 * Formats a `Date` into a time string using the given format template.
 *
 * Supported tokens: `HH` (24-hour), `hh` (12-hour), `mm` (minutes),
 * `ss` (seconds), `AM/PM` (period).
 */
export function formatTime(now: Date, fmt: string): string {
    const hh24 = pad(now.getHours());
    const hh12 = pad(now.getHours() % 12 || 12);
    const tokens: Record<string, string> = {
        HH: hh24,
        hh: hh12,
        mm: pad(now.getMinutes()),
        ss: pad(now.getSeconds()),
        "AM/PM": now.getHours() < 12 ? "AM" : "PM",
    };

    return fmt.replace(/AM\/PM|HH|hh|mm|ss/g, (match) => tokens[match]);
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
        return pluralize(days, "day");
    }
    if (remainder === 0) {
        return pluralize(weeks, "week");
    }
    return `${pluralize(weeks, "week")} and ${pluralize(remainder, "day")}`;
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
