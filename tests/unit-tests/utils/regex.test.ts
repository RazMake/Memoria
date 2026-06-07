import { describe, it, expect } from "vitest";
import { escapeRegExp } from "../../../src/utils/regex";

describe("escapeRegExp", () => {
    it("escapes all regex metacharacters", () => {
        expect(escapeRegExp(".*+?^${}()|[]\\")).toBe(
            "\\.\\*\\+\\?\\^\\$\\{\\}\\(\\)\\|\\[\\]\\\\",
        );
    });

    it("leaves ordinary text unchanged", () => {
        expect(escapeRegExp("hello world 123")).toBe("hello world 123");
    });

    it("produces a pattern that matches the literal input", () => {
        const input = "a.b(c)*";
        const re = new RegExp(escapeRegExp(input));
        expect(re.test(input)).toBe(true);
        expect(re.test("axbyc")).toBe(false);
    });

    it("returns an empty string for empty input", () => {
        expect(escapeRegExp("")).toBe("");
    });
});
