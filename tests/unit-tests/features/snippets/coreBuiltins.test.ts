import { describe, it, expect } from "vitest";
import { freeTextFunction, ifWithinFunction, CORE_BUILTINS, RESERVED_BUILTIN_NAMES } from "../../../../src/features/snippets/templates/coreBuiltins";
import type { TemplateContext } from "../../../../src/features/snippets/templates/templateTypes";

function makeCtx(overrides: Partial<TemplateContext> = {}): TemplateContext {
    return {
        args: [],
        answers: {},
        scope: {},
        now: new Date("2026-01-15T12:00:00Z"),
        ...overrides,
    };
}

describe("coreBuiltins", () => {
    describe("FreeText", () => {
        it("has name 'FreeText'", () => {
            expect(freeTextFunction.name).toBe("FreeText");
        });

        it("describeInputs returns one freeText input", () => {
            const inputs = freeTextFunction.describeInputs(makeCtx());
            expect(inputs).toHaveLength(1);
            expect(inputs[0].kind).toBe("freeText");
        });

        it("uses args[0] as the label", () => {
            const ctx = makeCtx({ args: [{ value: "Enter your name" }] });
            const inputs = freeTextFunction.describeInputs(ctx);
            expect(inputs[0].label).toBe("Enter your name");
        });

        it("uses default label when no args", () => {
            const inputs = freeTextFunction.describeInputs(makeCtx());
            expect(inputs[0].label).toBeTruthy();
        });

        it("resolve returns the value input", () => {
            const result = freeTextFunction.resolve({ value: "Hello World" }, makeCtx());
            expect(result).toBe("Hello World");
        });

        it("resolve returns empty string when no value", () => {
            const result = freeTextFunction.resolve({}, makeCtx());
            expect(result).toBe("");
        });
    });

    describe("IfWithin", () => {
        it("has name 'IfWithin'", () => {
            expect(ifWithinFunction.name).toBe("IfWithin");
        });

        it("has branchArgs: [2]", () => {
            expect(ifWithinFunction.branchArgs).toEqual([2]);
        });

        it("describeInputs returns empty array", () => {
            const inputs = ifWithinFunction.describeInputs(makeCtx());
            expect(inputs).toHaveLength(0);
        });

        it("returns text when date is within window", () => {
            // now = 2026-01-15, date = 2026-01-01 (14 days ago), window = 30d
            const ctx = makeCtx({
                args: [
                    { value: "30d" },
                    { value: "2026-01-01" },
                    { value: "You are new!" },
                ],
            });
            const result = ifWithinFunction.resolve({}, ctx);
            expect(result).toBe("You are new!");
        });

        it("returns empty string when date is outside window", () => {
            // now = 2026-01-15, date = 2025-01-01 (more than 30d ago)
            const ctx = makeCtx({
                args: [
                    { value: "30d" },
                    { value: "2025-01-01" },
                    { value: "You are new!" },
                ],
            });
            const result = ifWithinFunction.resolve({}, ctx);
            expect(result).toBe("");
        });

        it("supports weeks unit (w)", () => {
            // now = 2026-01-15, date = 2026-01-01 (14 days ago), window = 2w = 14 days
            const ctx = makeCtx({
                args: [
                    { value: "2w" },
                    { value: "2026-01-01" },
                    { value: "Within 2 weeks" },
                ],
            });
            const result = ifWithinFunction.resolve({}, ctx);
            expect(result).toBe("Within 2 weeks");
        });

        it("supports months unit (M) approximated as 30 days", () => {
            // now = 2026-01-15, date = 2025-12-01 (45 days ago), window = 2M = 60 days
            const ctx = makeCtx({
                args: [
                    { value: "2M" },
                    { value: "2025-12-01" },
                    { value: "Within 2 months" },
                ],
            });
            const result = ifWithinFunction.resolve({}, ctx);
            expect(result).toBe("Within 2 months");
        });

        it("returns empty string when date is exactly on boundary (exclusive)", () => {
            // now = 2026-01-15, date = 2025-12-16 (30 days ago), window = 29d
            const ctx = makeCtx({
                args: [
                    { value: "29d" },
                    { value: "2025-12-16" },
                    { value: "Just outside" },
                ],
            });
            const result = ifWithinFunction.resolve({}, ctx);
            expect(result).toBe("");
        });

        it("returns text when date is today (0 days)", () => {
            const ctx = makeCtx({
                now: new Date("2026-01-15T12:00:00Z"),
                args: [
                    { value: "1d" },
                    { value: "2026-01-15" },
                    { value: "Today!" },
                ],
            });
            const result = ifWithinFunction.resolve({}, ctx);
            expect(result).toBe("Today!");
        });

        it("throws for invalid duration", () => {
            const ctx = makeCtx({
                args: [
                    { value: "abc" },
                    { value: "2026-01-01" },
                    { value: "text" },
                ],
            });
            expect(() => ifWithinFunction.resolve({}, ctx)).toThrow();
        });

        it("throws for invalid date format", () => {
            const ctx = makeCtx({
                args: [
                    { value: "30d" },
                    { value: "not-a-date" },
                    { value: "text" },
                ],
            });
            expect(() => ifWithinFunction.resolve({}, ctx)).toThrow("invalid date");
        });

        it("accepts MM-DD-YYYY format and returns text when within window", () => {
            // now = 2026-01-15, date = 01-01-2026 (14 days ago), window = 30d
            const ctx = makeCtx({
                args: [
                    { value: "30d" },
                    { value: "01-01-2026" },
                    { value: "You are new!" },
                ],
            });
            const result = ifWithinFunction.resolve({}, ctx);
            expect(result).toBe("You are new!");
        });

        it("accepts MM/DD/YYYY format and returns text when within window", () => {
            // now = 2026-01-15, date = 01/01/2026 (14 days ago), window = 30d
            const ctx = makeCtx({
                args: [
                    { value: "30d" },
                    { value: "01/01/2026" },
                    { value: "You are new!" },
                ],
            });
            const result = ifWithinFunction.resolve({}, ctx);
            expect(result).toBe("You are new!");
        });

        it("accepts YYYY/MM/DD format and returns text when within window", () => {
            // now = 2026-01-15, date = 2026/01/01 (14 days ago), window = 30d
            const ctx = makeCtx({
                args: [
                    { value: "30d" },
                    { value: "2026/01/01" },
                    { value: "You are new!" },
                ],
            });
            const result = ifWithinFunction.resolve({}, ctx);
            expect(result).toBe("You are new!");
        });

        it("throws for invalid calendar date in MM-DD-YYYY (month 13)", () => {
            const ctx = makeCtx({
                args: [
                    { value: "30d" },
                    { value: "13-01-2026" },
                    { value: "text" },
                ],
            });
            expect(() => ifWithinFunction.resolve({}, ctx)).toThrow("invalid date");
        });

        it("returns empty string when duration arg is missing", () => {
            const ctx = makeCtx({ args: [] });
            const result = ifWithinFunction.resolve({}, ctx);
            expect(result).toBe("");
        });

        it("returns empty string when date arg is missing", () => {
            const ctx = makeCtx({ args: [{ value: "30d" }] });
            const result = ifWithinFunction.resolve({}, ctx);
            expect(result).toBe("");
        });
    });

    describe("CORE_BUILTINS", () => {
        it("includes FreeText and IfWithin", () => {
            expect(CORE_BUILTINS.map((f) => f.name)).toContain("FreeText");
            expect(CORE_BUILTINS.map((f) => f.name)).toContain("IfWithin");
        });
    });

    describe("RESERVED_BUILTIN_NAMES", () => {
        it("contains all reserved names", () => {
            expect(RESERVED_BUILTIN_NAMES.has("FreeText")).toBe(true);
            expect(RESERVED_BUILTIN_NAMES.has("IfWithin")).toBe(true);
            expect(RESERVED_BUILTIN_NAMES.has("PeopleSelector")).toBe(true);
            expect(RESERVED_BUILTIN_NAMES.has("Me")).toBe(true);
            expect(RESERVED_BUILTIN_NAMES.has("DeadlineSelector")).toBe(true);
        });
    });
});
