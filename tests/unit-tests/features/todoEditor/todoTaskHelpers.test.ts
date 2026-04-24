import { describe, it, expect } from "vitest";
import { toggleNthCheckbox } from "../../../../src/features/todoEditor/todoTaskHelpers";

describe("todoTaskHelpers", () => {
    describe("toggleNthCheckbox", () => {
        const date = "2026-04-24";

        it("should check unchecked subtask", () => {
            const body = "- [ ] subtask one";
            const result = toggleNthCheckbox(body, 0, date);
            expect(result).toContain("- [x] subtask one");
        });

        it("should uncheck checked subtask", () => {
            const body = [
                "- [x] subtask one",
                `  _Completed ${date}_`,
            ].join("\n");
            const result = toggleNthCheckbox(body, 0, date);
            expect(result).toContain("- [ ] subtask one");
        });

        it("should handle multiple subtasks and toggle the nth one", () => {
            const body = [
                "- [ ] first",
                "- [ ] second",
                "- [ ] third",
            ].join("\n");

            const result = toggleNthCheckbox(body, 1, date);

            expect(result).toContain("- [ ] first");
            expect(result).toContain("- [x] second");
            expect(result).toContain("- [ ] third");
        });

        it("should add completed date when checking", () => {
            const body = "- [ ] subtask";
            const result = toggleNthCheckbox(body, 0, date);
            expect(result).toContain(`_Completed ${date}_`);
        });

        it("should remove completed date when unchecking", () => {
            const body = [
                "- [x] subtask",
                `  _Completed ${date}_`,
            ].join("\n");

            const result = toggleNthCheckbox(body, 0, date);

            expect(result).not.toContain("_Completed");
            expect(result).toContain("- [ ] subtask");
        });

        it("should return body unchanged when index is out of range", () => {
            const body = "- [ ] only one";
            const result = toggleNthCheckbox(body, 5, date);
            expect(result).toBe(body);
        });
    });
});
