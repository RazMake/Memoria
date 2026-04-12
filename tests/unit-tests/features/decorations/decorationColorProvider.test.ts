import { describe, it, expect, vi } from "vitest";
import { DecorationColorProvider } from "../../../../src/features/decorations/decorationColorProvider";

// ────────────────────────────────────────────────────────────────────────────
// VS Code mock
// ────────────────────────────────────────────────────────────────────────────

vi.mock("vscode", () => ({
    Color: class {
        constructor(
            public red: number,
            public green: number,
            public blue: number,
            public alpha: number,
        ) {}
    },
    ColorInformation: class {
        constructor(public range: any, public color: any) {}
    },
    ColorPresentation: class {
        label: string;
        textEdit?: any;
        constructor(label: string) {
            this.label = label;
        }
    },
    Range: class {
        constructor(public start: any, public end: any) {}
    },
    TextEdit: class {
        constructor(public range: any, public newText: string) {}
    },
}));

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

function makeDocument(text: string) {
    const lines = text.split("\n");
    return {
        getText: () => text,
        positionAt: (offset: number) => {
            let remaining = offset;
            let line = 0;
            while (line < lines.length && remaining > lines[line].length) {
                remaining -= lines[line].length + 1;
                line++;
            }
            return { line, character: remaining };
        },
    };
}

// ────────────────────────────────────────────────────────────────────────────
// Tests
// ────────────────────────────────────────────────────────────────────────────

describe("DecorationColorProvider", () => {
    const provider = new DecorationColorProvider();

    describe("provideDocumentColors", () => {
        it("should return color info for known theme colors", () => {
            const json = '{\n  "rules": [\n    { "filter": "00-ToDo/", "color": "charts.yellow" }\n  ]\n}';
            const doc = makeDocument(json);

            const colors = provider.provideDocumentColors(doc as any);

            expect(colors).toHaveLength(1);
            // charts.yellow ≈ #CCA700 → r=204/255, g=167/255, b=0/255
            expect(colors[0].color.red).toBeCloseTo(204 / 255, 2);
            expect(colors[0].color.green).toBeCloseTo(167 / 255, 2);
            expect(colors[0].color.blue).toBeCloseTo(0 / 255, 2);
        });

        it("should return nothing for unknown color values", () => {
            const json = '{\n  "rules": [\n    { "filter": "foo/", "color": "nonexistent.color" }\n  ]\n}';
            const doc = makeDocument(json);

            const colors = provider.provideDocumentColors(doc as any);

            expect(colors).toHaveLength(0);
        });

        it("should return multiple colors for multiple rules", () => {
            const json = '{\n  "rules": [\n    { "filter": "a/", "color": "charts.red" },\n    { "filter": "b/", "color": "charts.blue" }\n  ]\n}';
            const doc = makeDocument(json);

            const colors = provider.provideDocumentColors(doc as any);

            expect(colors).toHaveLength(2);
        });

        it("should skip rules with no color property", () => {
            const json = '{\n  "rules": [\n    { "filter": "a/", "badge": "A" }\n  ]\n}';
            const doc = makeDocument(json);

            const colors = provider.provideDocumentColors(doc as any);

            expect(colors).toHaveLength(0);
        });

        it("should return nothing for an empty document", () => {
            const doc = makeDocument("");
            const colors = provider.provideDocumentColors(doc as any);
            expect(colors).toHaveLength(0);
        });
    });

    describe("provideColorPresentations", () => {
        it("should map a color back to the closest theme color name", () => {
            const json = '{\n  "rules": [\n    { "color": "charts.yellow" }\n  ]\n}';
            const doc = makeDocument(json);

            // Pass approximate charts.yellow (204/255, 167/255, 0/255)
            const color = { red: 204 / 255, green: 167 / 255, blue: 0 / 255, alpha: 1 };
            const range = { start: { line: 0, character: 0 }, end: { line: 0, character: 10 } };
            const context = { document: doc, range };

            const presentations = provider.provideColorPresentations(color as any, context as any);

            expect(presentations).toHaveLength(1);
            expect(presentations[0].label).toBe("charts.yellow");
        });

        it("should return a red-ish color name for red input", () => {
            const color = { red: 1, green: 0, blue: 0, alpha: 1 }; // pure red
            const range = { start: { line: 0, character: 0 }, end: { line: 0, character: 10 } };
            const context = { document: makeDocument(""), range };

            const presentations = provider.provideColorPresentations(color as any, context as any);

            expect(presentations[0].label).toMatch(/red/i);
        });
    });
});
