import { describe, expect, it } from "vitest";
import { markSubtasksCompleted, parseCollectorDocument, parseCollectorSuffixLine, parseTaskBlocks } from "../../../../src/features/taskCollector/taskParser";

describe("taskParser", () => {
    describe("parseTaskBlocks", () => {
        it("should parse single-line and multi-line tasks using the two-column hanging indent", () => {
            const content = [
                "- [ ] one line",
                "- [ ] multi line",
                "      with continuation",
                "      and another",
                "paragraph",
            ].join("\n");

            const tasks = parseTaskBlocks(content);

            expect(tasks).toHaveLength(2);
            expect(tasks[0].body).toBe("one line");
            expect(tasks[1].body).toBe(["multi line", "      with continuation", "      and another"].join("\n"));
        });

        it("should preserve blank lines inside continuation blocks and drop trailing blank lines", () => {
            const content = [
                "- [ ] task",
                "      first",
                "",
                "      second",
                "",
                "",
                "- [ ] next",
            ].join("\n");

            const tasks = parseTaskBlocks(content);

            expect(tasks[0].body).toBe(["task", "      first", "", "      second"].join("\n"));
        });

        it("should preserve fenced code blocks as continuation lines even when inner lines are shallower", () => {
            const content = [
                "- [ ] review sample",
                "      ```ts",
                "const value = 1;",
                "      ```",
                "- [ ] next",
            ].join("\n");

            const tasks = parseTaskBlocks(content);

            expect(tasks[0].body).toBe(["review sample", "      ```ts", "const value = 1;", "      ```"].join("\n"));
        });

        it("should include nested task items as subtasks within the parent body", () => {
            const content = [
                "- [ ] parent",
                "      note",
                "      - [ ] child",
                "- [ ] sibling",
            ].join("\n");

            const tasks = parseTaskBlocks(content);

            expect(tasks).toHaveLength(2);
            expect(tasks[0].body).toBe(["parent", "      note", "      - [ ] child"].join("\n"));
            expect(tasks[1].firstLineText).toBe("sibling");
        });

        it("should accept two-space indented continuation lines with blank lines between them", () => {
            const content = [
                "- [ ] another remote task edit",
                "  adding other things",
                "",
                "  and a blank line",
            ].join("\n");

            const tasks = parseTaskBlocks(content);

            expect(tasks).toHaveLength(1);
            expect(tasks[0].body).toBe(["another remote task edit", "  adding other things", "", "  and a blank line"].join("\n"));
        });

        it("should preserve tables and inline html in continuation lines", () => {
            const content = [
                "- [ ] review table",
                "      <kbd>Ctrl</kbd>",
                "      | metric | value |",
                "      | ------ | ----- |",
                "      | p50    | 45ms  |",
            ].join("\n");

            const tasks = parseTaskBlocks(content);

            expect(tasks[0].continuationLines).toEqual([
                "      <kbd>Ctrl</kbd>",
                "      | metric | value |",
                "      | ------ | ----- |",
                "      | p50    | 45ms  |",
            ]);
        });
    });

    describe("parseCollectorSuffixLine", () => {
        it("should parse source and completed metadata in either order", () => {
            expect(parseCollectorSuffixLine("      _Source: docs/ship.md · Completed 2026-04-14_"))
                .toEqual(expect.objectContaining({ source: "docs/ship.md", completedDate: "2026-04-14" }));

            expect(parseCollectorSuffixLine("      *Completed 2026-04-14, Source: docs/ship.md*"))
                .toEqual(expect.objectContaining({ source: "docs/ship.md", completedDate: "2026-04-14" }));
        });

        it("should return null for italic lines that do not carry collector metadata", () => {
            expect(parseCollectorSuffixLine("      _just italic text_"))
                .toBeNull();
        });
    });

    describe("parseCollectorDocument", () => {
        it("should split tasks by Active and Completed headings and strip recognized suffix lines", () => {
            const content = [
                "# To do",
                "",
                "- [ ] active task",
                "",
                "# Completed",
                "",
                "- [x] shipped",
                "      details",
                "      _Source: docs/ship.md · Completed 2026-04-14_",
            ].join("\n");

            const parsed = parseCollectorDocument(content);

            expect(parsed.active).toHaveLength(1);
            expect(parsed.completed).toHaveLength(1);
            expect(parsed.completed[0].body).toBe(["shipped", "      details"].join("\n"));
            expect(parsed.completed[0].suffix).toEqual(expect.objectContaining({
                source: "docs/ship.md",
                completedDate: "2026-04-14",
            }));
        });

        it("should report checked=false when an unchecked task appears under # Completed", () => {
            const content = [
                "# To do",
                "",
                "# Completed",
                "",
                "- [ ] uncompleted task in completed section",
            ].join("\n");

            const parsed = parseCollectorDocument(content);

            expect(parsed.completed).toHaveLength(1);
            expect(parsed.completed[0].checked).toBe(false);
            expect(parsed.completed[0].section).toBe("completed");
        });
    });

    describe("markSubtasksCompleted", () => {
        it("should mark unchecked subtask lines as checked", () => {
            const body = ["parent", "  - [ ] child one", "  - [ ] child two"].join("\n");
            expect(markSubtasksCompleted(body)).toBe(
                ["parent", "  - [x] child one", "  - [x] child two"].join("\n"),
            );
        });

        it("should append completed date when provided", () => {
            const body = ["parent", "  - [ ] child one", "  - [ ] child two"].join("\n");
            expect(markSubtasksCompleted(body, "2026-04-18")).toBe(
                ["parent", "  - [x] child one _Completed 2026-04-18_", "  - [x] child two _Completed 2026-04-18_"].join("\n"),
            );
        });

        it("should not modify already-checked subtasks", () => {
            const body = ["parent", "  - [x] child"].join("\n");
            expect(markSubtasksCompleted(body)).toBe(["parent", "  - [x] child"].join("\n"));
        });

        it("should leave a single-line body unchanged", () => {
            expect(markSubtasksCompleted("parent only")).toBe("parent only");
        });

        it("should not modify the first line even if it contains task-like text", () => {
            const body = ["parent - [ ] not a subtask", "  - [ ] real subtask"].join("\n");
            const result = markSubtasksCompleted(body, "2026-04-18");
            expect(result.split("\n")[0]).toBe("parent - [ ] not a subtask");
            expect(result.split("\n")[1]).toBe("  - [x] real subtask _Completed 2026-04-18_");
        });

        it("should handle mixed checked and unchecked subtasks", () => {
            const body = ["parent", "  - [x] done", "  - [ ] pending", "  continuation"].join("\n");
            expect(markSubtasksCompleted(body, "2026-04-18")).toBe(
                ["parent", "  - [x] done", "  - [x] pending _Completed 2026-04-18_", "  continuation"].join("\n"),
            );
        });
    });

    describe("subtask parsing", () => {
        it("should include indented subtasks in the parent body", () => {
            const content = [
                "- [ ] parent",
                "  - [ ] child one",
                "  - [ ] child two",
                "- [ ] sibling",
            ].join("\n");

            const tasks = parseTaskBlocks(content);

            expect(tasks).toHaveLength(2);
            expect(tasks[0].body).toBe("parent\n  - [ ] child one\n  - [ ] child two");
            expect(tasks[1].firstLineText).toBe("sibling");
        });

        it("should include subtask with its own continuation in the parent body", () => {
            const content = [
                "- [ ] parent",
                "      - [ ] child",
                "        child detail",
                "- [ ] sibling",
            ].join("\n");

            const tasks = parseTaskBlocks(content);

            expect(tasks).toHaveLength(2);
            expect(tasks[0].body).toBe(
                ["parent", "      - [ ] child", "        child detail"].join("\n"),
            );
        });

        it("should track the checked state of the parent only", () => {
            const content = [
                "- [x] parent",
                "  - [ ] unchecked child",
            ].join("\n");

            const tasks = parseTaskBlocks(content);

            expect(tasks).toHaveLength(1);
            expect(tasks[0].checked).toBe(true);
            expect(tasks[0].body).toBe("parent\n  - [ ] unchecked child");
        });
    });
});
