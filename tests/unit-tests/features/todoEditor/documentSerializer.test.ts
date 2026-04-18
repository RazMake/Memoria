import { describe, expect, it } from "vitest";
import {
    addTaskRawLines,
    completeTask,
    parseTodoDocument,
    serializeDocument,
    stripHangingIndent,
    uncompleteTask,
    updateTaskBody,
} from "../../../../src/features/todoEditor/documentSerializer";
import type { ParsedCollectorTask } from "../../../../src/features/taskCollector/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Shorthand for building a standard two-section document. */
function standardDocument(): string {
    return [
        "# To do",
        "",
        "- [ ] active task one",
        "- [ ] active task two",
        "",
        "# Completed",
        "",
        "- [x] done task",
        "      _Completed 2026-04-10_",
    ].join("\n");
}

/** Build a minimal ParsedCollectorTask for testing mutation helpers. */
function makeTask(overrides: Partial<ParsedCollectorTask>): ParsedCollectorTask {
    const defaults: ParsedCollectorTask = {
        indent: 0,
        indentText: "",
        checked: false,
        firstLineText: "placeholder",
        continuationLines: [],
        bodyRange: { startLine: 0, endLine: 0 },
        body: "placeholder",
        rawLines: ["- [ ] placeholder"],
        section: "active",
        bodyWithoutSuffix: "placeholder",
        suffix: null,
    };
    return { ...defaults, ...overrides };
}

// ---------------------------------------------------------------------------
// Round-trip: parseTodoDocument → serializeDocument
// ---------------------------------------------------------------------------

describe("documentSerializer", () => {
    describe("round-trip (parseTodoDocument → serializeDocument)", () => {
        it("should produce identical text for a standard document with both sections", () => {
            const text = standardDocument();
            const doc = parseTodoDocument(text);
            expect(serializeDocument(doc)).toBe(text);
        });

        it("should produce identical text when the active section is empty", () => {
            const text = [
                "# To do",
                "",
                "# Completed",
                "",
                "- [x] done",
                "      _Completed 2026-04-10_",
            ].join("\n");
            const doc = parseTodoDocument(text);
            expect(serializeDocument(doc)).toBe(text);
        });

        it("should produce identical text when the completed section is empty", () => {
            const text = [
                "# To do",
                "",
                "- [ ] active one",
                "- [ ] active two",
                "",
                "# Completed",
            ].join("\n");
            const doc = parseTodoDocument(text);
            expect(serializeDocument(doc)).toBe(text);
        });

        it("should produce identical text for multi-line task bodies", () => {
            const text = [
                "# To do",
                "",
                "- [ ] multi-line task",
                "      continuation line 1",
                "      continuation line 2",
                "- [ ] single-line task",
                "",
                "# Completed",
                "",
                "- [x] completed multi",
                "      detail line",
                "      _Completed 2026-04-10_",
            ].join("\n");
            const doc = parseTodoDocument(text);
            expect(serializeDocument(doc)).toBe(text);
        });
    });

    // -----------------------------------------------------------------------
    // parseTodoDocument — structural assertions
    // -----------------------------------------------------------------------

    describe("parseTodoDocument", () => {
        it("should place heading line(s) and blank lines before tasks into preamble", () => {
            const text = standardDocument();
            const doc = parseTodoDocument(text);
            expect(doc.preamble).toEqual(["# To do", ""]);
        });

        it("should correctly parse active tasks", () => {
            const text = standardDocument();
            const doc = parseTodoDocument(text);
            expect(doc.active).toHaveLength(2);
            expect(doc.active[0].firstLineText).toBe("active task one");
            expect(doc.active[1].firstLineText).toBe("active task two");
            expect(doc.active[0].section).toBe("active");
        });

        it("should place the # Completed heading into midSection", () => {
            const text = standardDocument();
            const doc = parseTodoDocument(text);
            expect(doc.midSection).toContain("# Completed");
        });

        it("should correctly parse completed tasks", () => {
            const text = standardDocument();
            const doc = parseTodoDocument(text);
            expect(doc.completed).toHaveLength(1);
            expect(doc.completed[0].firstLineText).toBe("done task");
            expect(doc.completed[0].section).toBe("completed");
            expect(doc.completed[0].suffix).not.toBeNull();
            expect(doc.completed[0].suffix?.completedDate).toBe("2026-04-10");
        });

        it("should place trailing content into epilogue", () => {
            const text = [
                "# To do",
                "",
                "- [ ] task",
                "",
                "# Completed",
                "",
                "- [x] done",
                "      _Completed 2026-04-10_",
                "",
                "---",
                "Footer note",
            ].join("\n");
            const doc = parseTodoDocument(text);
            expect(doc.epilogue.length).toBeGreaterThan(0);
            expect(doc.epilogue).toContain("Footer note");
        });
    });

    // -----------------------------------------------------------------------
    // completeTask
    // -----------------------------------------------------------------------

    describe("completeTask", () => {
        it("should change [ ] to [x] and append a suffix with the date for a single-line task", () => {
            const task = makeTask({
                rawLines: ["- [ ] buy groceries"],
                firstLineText: "buy groceries",
                body: "buy groceries",
                bodyWithoutSuffix: "buy groceries",
                checked: false,
            });
            const result = completeTask(task, "2026-04-17");
            expect(result[0]).toMatch(/- \[x\] buy groceries/);
            expect(result[result.length - 1]).toMatch(/Completed 2026-04-17/);
        });

        it("should append suffix after the last continuation line for a multi-line task", () => {
            const task = makeTask({
                rawLines: [
                    "- [ ] multi-line task",
                    "      continuation",
                ],
                firstLineText: "multi-line task",
                continuationLines: ["      continuation"],
                body: "multi-line task\n      continuation",
                bodyWithoutSuffix: "multi-line task\n      continuation",
                checked: false,
            });
            const result = completeTask(task, "2026-04-17");
            expect(result[0]).toMatch(/\[x\]/);
            expect(result.length).toBeGreaterThan(2);
            expect(result[result.length - 1]).toMatch(/Completed 2026-04-17/);
        });

        it("should include source path in suffix when the task has a source", () => {
            const task = makeTask({
                rawLines: ["- [ ] collected task"],
                firstLineText: "collected task",
                body: "collected task",
                bodyWithoutSuffix: "collected task",
                checked: false,
                suffix: {
                    rawLine: "      _Source: src/app.ts_",
                    rawText: "Source: src/app.ts",
                    source: "src/app.ts",
                    completedDate: null,
                },
            });
            const result = completeTask(task, "2026-04-17");
            const suffixLine = result[result.length - 1];
            expect(suffixLine).toMatch(/Source: src\/app\.ts/);
            expect(suffixLine).toMatch(/Completed 2026-04-17/);
        });
    });

    // -----------------------------------------------------------------------
    // uncompleteTask
    // -----------------------------------------------------------------------

    describe("uncompleteTask", () => {
        it("should change [x] to [ ] in the first rawLine", () => {
            const task = makeTask({
                rawLines: [
                    "- [x] completed task",
                    "      _Completed 2026-04-10_",
                ],
                firstLineText: "completed task",
                body: "completed task",
                bodyWithoutSuffix: "completed task",
                checked: true,
                section: "completed",
                suffix: {
                    rawLine: "      _Completed 2026-04-10_",
                    rawText: "Completed 2026-04-10",
                    source: null,
                    completedDate: "2026-04-10",
                },
            });
            const result = uncompleteTask(task);
            expect(result[0]).toMatch(/- \[ \] completed task/);
        });

        it("should remove the suffix line", () => {
            const task = makeTask({
                rawLines: [
                    "- [x] completed task",
                    "      _Completed 2026-04-10_",
                ],
                firstLineText: "completed task",
                body: "completed task",
                bodyWithoutSuffix: "completed task",
                checked: true,
                section: "completed",
                suffix: {
                    rawLine: "      _Completed 2026-04-10_",
                    rawText: "Completed 2026-04-10",
                    source: null,
                    completedDate: "2026-04-10",
                },
            });
            const result = uncompleteTask(task);
            const hasSuffix = result.some((line) => /Completed/.test(line));
            expect(hasSuffix).toBe(false);
        });

        it("should preserve the body without suffix", () => {
            const task = makeTask({
                rawLines: [
                    "- [x] multi-line done",
                    "      detail line",
                    "      _Source: docs/readme.md · Completed 2026-04-10_",
                ],
                firstLineText: "multi-line done",
                continuationLines: ["      detail line"],
                body: "multi-line done\n      detail line",
                bodyWithoutSuffix: "multi-line done\n      detail line",
                checked: true,
                section: "completed",
                suffix: {
                    rawLine: "      _Source: docs/readme.md · Completed 2026-04-10_",
                    rawText: "Source: docs/readme.md · Completed 2026-04-10",
                    source: "docs/readme.md",
                    completedDate: "2026-04-10",
                },
            });
            const result = uncompleteTask(task);
            expect(result[0]).toMatch(/\[ \]/);
            expect(result).toHaveLength(2);
            expect(result[1]).toBe("      detail line");
        });
    });

    // -----------------------------------------------------------------------
    // addTaskRawLines
    // -----------------------------------------------------------------------

    describe("addTaskRawLines", () => {
        it("should produce a single rawLine for single-line text", () => {
            const result = addTaskRawLines("buy milk");
            expect(result).toEqual(["- [ ] buy milk"]);
        });

        it("should produce first line with checkbox and continuations with 6-space hanging indent for multi-line text", () => {
            const result = addTaskRawLines("first line\nsecond line\nthird line");
            expect(result[0]).toBe("- [ ] first line");
            expect(result[1]).toBe("      second line");
            expect(result[2]).toBe("      third line");
        });
    });

    // -----------------------------------------------------------------------
    // updateTaskBody
    // -----------------------------------------------------------------------

    describe("updateTaskBody", () => {
        it("should update body text for a single→single change", () => {
            const task = makeTask({
                rawLines: ["- [ ] old text"],
                firstLineText: "old text",
                body: "old text",
                bodyWithoutSuffix: "old text",
            });
            const result = updateTaskBody(task, "new text");
            expect(result).toEqual(["- [ ] new text"]);
        });

        it("should add continuation lines when changing single→multi", () => {
            const task = makeTask({
                rawLines: ["- [ ] old text"],
                firstLineText: "old text",
                body: "old text",
                bodyWithoutSuffix: "old text",
            });
            const result = updateTaskBody(task, "new first\nnew second");
            expect(result[0]).toBe("- [ ] new first");
            expect(result[1]).toBe("      new second");
        });

        it("should remove continuation lines when changing multi→single", () => {
            const task = makeTask({
                rawLines: [
                    "- [ ] old first",
                    "      old second",
                ],
                firstLineText: "old first",
                continuationLines: ["      old second"],
                body: "old first\n      old second",
                bodyWithoutSuffix: "old first\n      old second",
            });
            const result = updateTaskBody(task, "single line");
            expect(result).toEqual(["- [ ] single line"]);
        });

        it("should update continuation lines when changing multi→multi", () => {
            const task = makeTask({
                rawLines: [
                    "- [ ] old first",
                    "      old second",
                ],
                firstLineText: "old first",
                continuationLines: ["      old second"],
                body: "old first\n      old second",
                bodyWithoutSuffix: "old first\n      old second",
            });
            const result = updateTaskBody(task, "new first\nnew second\nnew third");
            expect(result[0]).toBe("- [ ] new first");
            expect(result[1]).toBe("      new second");
            expect(result[2]).toBe("      new third");
        });

        it("should preserve the suffix line when present", () => {
            const task = makeTask({
                rawLines: [
                    "- [x] old text",
                    "      _Source: src/app.ts · Completed 2026-04-10_",
                ],
                firstLineText: "old text",
                body: "old text",
                bodyWithoutSuffix: "old text",
                checked: true,
                section: "completed",
                suffix: {
                    rawLine: "      _Source: src/app.ts · Completed 2026-04-10_",
                    rawText: "Source: src/app.ts · Completed 2026-04-10",
                    source: "src/app.ts",
                    completedDate: "2026-04-10",
                },
            });
            const result = updateTaskBody(task, "updated text");
            expect(result[0]).toMatch(/updated text/);
            expect(result[result.length - 1]).toBe("      _Source: src/app.ts · Completed 2026-04-10_");
        });

        it("should preserve indentText in output rawLines", () => {
            const task = makeTask({
                indentText: "  ",
                rawLines: ["  - [ ] indented task"],
                firstLineText: "indented task",
                body: "indented task",
                bodyWithoutSuffix: "indented task",
            });
            const result = updateTaskBody(task, "updated indented");
            expect(result[0]).toMatch(/^ {2}- \[ \] updated indented$/);
        });
    });

    // -----------------------------------------------------------------------
    // Edge cases
    // -----------------------------------------------------------------------

    describe("edge cases", () => {
        it("should handle a document with an empty active section", () => {
            const text = [
                "# To do",
                "",
                "# Completed",
                "",
                "- [x] only completed",
                "      _Completed 2026-04-10_",
            ].join("\n");
            const doc = parseTodoDocument(text);
            expect(doc.active).toHaveLength(0);
            expect(doc.completed).toHaveLength(1);
            expect(serializeDocument(doc)).toBe(text);
        });

        it("should handle a document with an empty completed section", () => {
            const text = [
                "# To do",
                "",
                "- [ ] only active",
                "",
                "# Completed",
            ].join("\n");
            const doc = parseTodoDocument(text);
            expect(doc.active).toHaveLength(1);
            expect(doc.completed).toHaveLength(0);
            expect(serializeDocument(doc)).toBe(text);
        });

        it("should handle tasks with fenced code blocks in the body", () => {
            const text = [
                "# To do",
                "",
                "- [ ] review sample",
                "      ```ts",
                "const value = 1;",
                "      ```",
                "",
                "# Completed",
            ].join("\n");
            const doc = parseTodoDocument(text);
            expect(doc.active).toHaveLength(1);
            expect(doc.active[0].body).toContain("```ts");
            expect(serializeDocument(doc)).toBe(text);
        });

        it("should handle a document with only preamble and no tasks", () => {
            const text = [
                "# To do",
                "",
                "# Completed",
            ].join("\n");
            const doc = parseTodoDocument(text);
            expect(doc.active).toHaveLength(0);
            expect(doc.completed).toHaveLength(0);
            expect(serializeDocument(doc)).toBe(text);
        });
    });

    // -----------------------------------------------------------------------
    // stripHangingIndent
    // -----------------------------------------------------------------------

    describe("stripHangingIndent", () => {
        it("should return single-line body unchanged", () => {
            expect(stripHangingIndent("buy milk")).toBe("buy milk");
        });

        it("should strip 6-space hanging indent from continuation lines", () => {
            expect(stripHangingIndent("first line\n      second line")).toBe("first line\nsecond line");
        });

        it("should strip only the first 6 spaces from deeply-indented continuation lines", () => {
            expect(stripHangingIndent("first\n        deep")).toBe("first\n  deep");
        });

        it("should leave continuation lines untouched when they have fewer than 6 leading spaces", () => {
            expect(stripHangingIndent("first\n   short")).toBe("first\n   short");
        });

        it("should handle multiple continuation lines", () => {
            const input = "title\n      line 2\n      line 3";
            expect(stripHangingIndent(input)).toBe("title\nline 2\nline 3");
        });
    });
});
