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

        // Validate ISO 8601 date
        if (!isValidISODate(dateArg)) {
            throw new Error(`IfWithin: invalid date "${dateArg}" — expected YYYY-MM-DD format`);
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

function isValidISODate(value: string): boolean {
    return /^\d{4}-\d{2}-\d{2}$/.test(value) && !isNaN(Date.parse(`${value}T00:00:00.000Z`));
}

function parseLocalDate(isoDate: string): Date {
    const [year, month, day] = isoDate.split("-").map(Number);
    return new Date(year, month - 1, day);
}

function errorMessage(_args: IArguments): string {
    return String(_args[0] ?? "unknown error");
}
