import { describe, it, expect } from "vitest";
import { TASK_LINE_RE, SUBTASK_CHECKBOX_RE, SUBTASK_COMPLETED_RE, isChecked } from "../../../src/utils/markdownCheckbox";

describe("TASK_LINE_RE", () => {
    it("should match unchecked task", () => {
        const match = TASK_LINE_RE.exec("- [ ] Buy groceries");
        expect(match).not.toBeNull();
        expect(match![2]).toBe(" ");
        expect(match![3]).toBe("Buy groceries");
    });

    it("should match checked task", () => {
        const match = TASK_LINE_RE.exec("- [x] Done task");
        expect(match).not.toBeNull();
        expect(match![2]).toBe("x");
    });

    it("should capture indent", () => {
        const match = TASK_LINE_RE.exec("  - [ ] Indented");
        expect(match).not.toBeNull();
        expect(match![1]).toBe("  ");
    });

    it("should not match non-task lines", () => {
        expect(TASK_LINE_RE.exec("- Regular list item")).toBeNull();
    });
});

describe("isChecked", () => {
    it("should return true for lowercase x", () => {
        expect(isChecked("x")).toBe(true);
    });

    it("should return true for uppercase X", () => {
        expect(isChecked("X")).toBe(true);
    });

    it("should return false for space", () => {
        expect(isChecked(" ")).toBe(false);
    });
});

describe("SUBTASK_CHECKBOX_RE", () => {
    it("should match subtask checkbox in line", () => {
        expect(SUBTASK_CHECKBOX_RE.test("  - [ ] subtask")).toBe(true);
    });
});

describe("SUBTASK_COMPLETED_RE", () => {
    it("should match completed date line", () => {
        expect(SUBTASK_COMPLETED_RE.test("  _Completed 2026-04-24_")).toBe(true);
    });

    it("should not match non-date line", () => {
        expect(SUBTASK_COMPLETED_RE.test("regular text")).toBe(false);
    });
});
