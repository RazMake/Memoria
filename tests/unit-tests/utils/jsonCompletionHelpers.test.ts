import { describe, expect, it, vi } from "vitest";
import { extractPartialValue, getStringValueRange } from "../../../src/utils/jsonCompletionHelpers";

// ────────────────────────────────────────────────────────────────────────────
// VS Code mock
// ────────────────────────────────────────────────────────────────────────────

vi.mock("vscode", () => {
    class Position {
        constructor(public line: number, public character: number) {}
        translate(lineDelta: number, charDelta: number) {
            return new Position(this.line + lineDelta, this.character + charDelta);
        }
    }

    class Range {
        start: { line: number; character: number };
        end: { line: number; character: number };
        constructor(start: any, end: any) {
            this.start = start;
            this.end = end;
        }
    }

    return { Position, Range };
});

/** Creates a Position-like object matching the mock's translate behaviour. */
function pos(line: number, character: number): any {
    return {
        line,
        character,
        translate(ld: number, cd: number) { return pos(line + ld, character + cd); },
    };
}

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

describe("getStringValueRange", () => {
    it("creates range from start of partial value to cursor when next char is not a quote", () => {
        const position = pos(0, 5);
        const document = { lineAt: () => ({ text: '"hello' }) } as any;

        const range = getStringValueRange(document, position, "hel");
        expect(range.start.line).toBe(0);
        expect(range.start.character).toBe(2);
        expect(range.end.line).toBe(0);
        expect(range.end.character).toBe(5);
    });

    it("extends range past closing quote when next char is a quote", () => {
        const position = pos(0, 6);
        const document = { lineAt: () => ({ text: '"hello"' }) } as any;

        const range = getStringValueRange(document, position, "hello");
        expect(range.start.line).toBe(0);
        expect(range.start.character).toBe(1);
        expect(range.end.line).toBe(0);
        expect(range.end.character).toBe(7);
    });

    it("handles empty partial value", () => {
        const position = pos(0, 1);
        const document = { lineAt: () => ({ text: '""' }) } as any;

        const range = getStringValueRange(document, position, "");
        expect(range.start.line).toBe(0);
        expect(range.start.character).toBe(1);
        expect(range.end.line).toBe(0);
        expect(range.end.character).toBe(2);
    });
});
