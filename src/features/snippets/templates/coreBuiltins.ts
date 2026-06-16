/**
 * Core built-in template functions: FreeText and IfWithin.
 * No vscode imports. No Contacts dependencies.
 */

import type { TemplateFunction, TemplateContext, TemplateInput } from "./templateTypes";
import { parseDuration } from "./templateParser";

// ── FreeText ─────────────────────────────────────────────────────────────────

/** The FreeText built-in function: collects a free-text string from the user. */
export const freeTextFunction: TemplateFunction<string> = {
    name: "FreeText",

    describeInputs(ctx: TemplateContext): TemplateInput[] {
        const label = ctx.args[0]?.value ?? "Enter text";
        return [{
            name: "value",
            label,
            kind: "freeText",
        }];
    },

    resolve(inputs: Record<string, string>): string {
        return inputs["value"] ?? "";
    },
};

// ── IfWithin ─────────────────────────────────────────────────────────────────

/**
 * IfWithin(duration, date, text) — returns text when date is within duration of ctx.now.
 * Supports d (days), w (weeks), M (months ×30).
 * Declares branchArgs: [2] so the text argument is not extracted as a resolution dependency.
 */
export const ifWithinFunction: TemplateFunction<string> = {
    name: "IfWithin",
    branchArgs: [2],

    describeInputs(): TemplateInput[] {
        // No user inputs — purely computed
        return [];
    },

    resolve(_inputs: Record<string, string>, ctx: TemplateContext): string {
        const durationArg = ctx.args[0]?.value ?? "";
        const dateArg = ctx.args[1]?.value ?? "";
        const textArg = ctx.args[2]?.value ?? "";

        if (!durationArg || !dateArg) return "";

        // Parse duration
        let durationDays: number;
        try {
            const parsed = parseDuration(durationArg, new Set(["d", "w", "M"]));
            durationDays = parsed.days;
        } catch {
            throw new Error(`IfWithin: invalid duration "${durationArg}" — ${errorMessage(arguments)}`);
        }

        // Validate date (auto-detects supported formats)
        if (!isValidDate(dateArg)) {
            throw new Error(`IfWithin: invalid date "${dateArg}" — expected YYYY-MM-DD or MM-DD-YYYY format`);
        }

        const targetDate = parseLocalDate(dateArg);
        const now = ctx.now;

        // Calendar-day granularity: strip time from both dates
        const nowDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const targetDay = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());

        const diffMs = nowDay.getTime() - targetDay.getTime();
        const diffDays = Math.round(diffMs / (24 * 60 * 60 * 1000));

        // Within the window: date is at most durationDays in the past
        if (diffDays >= 0 && diffDays <= durationDays) {
            return textArg;
        }

        return "";
    },
};

// ── All core built-ins ───────────────────────────────────────────────────────

export const CORE_BUILTINS: TemplateFunction[] = [freeTextFunction, ifWithinFunction];

/** Reserved built-in names that user functions cannot override. */
export const RESERVED_BUILTIN_NAMES = new Set([
    "FreeText",
    "IfWithin",
    "PeopleSelector",
    "Me",
    "DeadlineSelector",
]);

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Attempts to parse a date string in one of the supported formats.
 * Supported formats (with `-` or `/` as separator):
 *   - `YYYY-MM-DD` (ISO 8601)
 *   - `MM-DD-YYYY`
 * Returns a local-time `Date`, or `null` when the string does not match any
 * supported format or represents an invalid calendar date (e.g. month 13).
 */
function tryParseLocalDate(value: string): Date | null {
    // YYYY-MM-DD or YYYY/MM/DD
    const isoMatch = /^(\d{4})[-/](\d{2})[-/](\d{2})$/.exec(value);
    if (isoMatch) {
        const year = Number(isoMatch[1]);
        const month = Number(isoMatch[2]);
        const day = Number(isoMatch[3]);
        const d = new Date(year, month - 1, day);
        if (d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day) {
            return d;
        }
        return null;
    }

    // MM-DD-YYYY or MM/DD/YYYY
    const mdyMatch = /^(\d{2})[-/](\d{2})[-/](\d{4})$/.exec(value);
    if (mdyMatch) {
        const month = Number(mdyMatch[1]);
        const day = Number(mdyMatch[2]);
        const year = Number(mdyMatch[3]);
        const d = new Date(year, month - 1, day);
        if (d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day) {
            return d;
        }
        return null;
    }

    return null;
}

function isValidDate(value: string): boolean {
    return tryParseLocalDate(value) !== null;
}

function parseLocalDate(dateStr: string): Date {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return tryParseLocalDate(dateStr)!;
}

function errorMessage(_args: IArguments): string {
    return String(_args[0] ?? "unknown error");
}
