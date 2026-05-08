import { describe, expect, it } from "vitest";
import { extractPartialValue } from "../../../src/utils/jsonCompletionHelpers";

describe("extractPartialValue", () => {
    it("returns empty string when cursor is right after the opening quote", () => {
        const text = '{""}';
        expect(extractPartialValue(text, 2)).toBe("");
    });

    it("extracts partial value from inside a string", () => {
        const text = '{"A/B"}';
        expect(extractPartialValue(text, 5)).toBe("A/B");
    });

    it("extracts partial value up to cursor when string is incomplete", () => {
        const text = '{"A/';
        expect(extractPartialValue(text, 4)).toBe("A/");
    });

    it("returns empty string when there is no opening quote before the cursor", () => {
        expect(extractPartialValue("abc", 3)).toBe("");
    });

    it("returns empty string for offset 0", () => {
        expect(extractPartialValue('"hello"', 0)).toBe("");
    });

    it("handles nested quotes by finding the nearest opening quote", () => {
        const text = '"key": "val';
        expect(extractPartialValue(text, 11)).toBe("val");
    });
});
