import { describe, it, expect, vi } from "vitest";
import { DecorationCompletionProvider } from "../../../../src/features/decorations/decorationCompletionProvider";
import { DECORATION_RULE_FIELDS } from "../../../../src/features/decorations/decorationSchema";

// ────────────────────────────────────────────────────────────────────────────
// VS Code mock
// ────────────────────────────────────────────────────────────────────────────

vi.mock("vscode", () => ({
    CompletionItem: class {
        insertText: any;
        detail?: string;
        documentation?: any;
        sortText?: string;
        filterText?: string;
        kind?: number;
        constructor(public label: string, public _kind?: number) {
            this.kind = _kind;
        }
    },
    CompletionItemKind: {
        Property: 10,
        Color: 16,
        Value: 12,
        Snippet: 15,
    },
    SnippetString: class {
        constructor(public value: string) {}
    },
    MarkdownString: class {
        constructor(public value: string) {}
    },
}));

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

/** Simulate a TextDocument with the given content; position at the specified offset. */
function makeDocAndPosition(text: string, offset: number) {
    // Build a line/character map for offset→Position.
    const lines = text.split("\n");

    const document = {
        getText: () => text,
        offsetAt: (pos: { line: number; character: number }) => {
            let o = 0;
            for (let i = 0; i < pos.line; i++) o += lines[i].length + 1;
            return o + pos.character;
        },
    };

    // Convert offset to line/character.
    let remaining = offset;
    let line = 0;
    while (line < lines.length && remaining > lines[line].length) {
        remaining -= lines[line].length + 1;
        line++;
    }
    const position = { line, character: remaining };

    return { document, position };
}

// ────────────────────────────────────────────────────────────────────────────
// Tests
// ────────────────────────────────────────────────────────────────────────────

describe("DecorationCompletionProvider", () => {
    const provider = new DecorationCompletionProvider();

    describe("rule field completions", () => {
        it("should offer a completion for every field in the schema", () => {
            const json = '{\n  "rules": [\n    { }\n  ]\n}';
            //                             ^ cursor inside the empty object
            const offset = json.indexOf("{ }") + 2; // between { and }
            const { document, position } = makeDocAndPosition(json, offset);

            const items = provider.provideCompletionItems(document as any, position as any);

            expect(items).toBeDefined();
            const labels = items!.map((i) => i.label);
            const schemaFields = Object.keys(DECORATION_RULE_FIELDS);
            expect(labels).toHaveLength(schemaFields.length);
            for (const field of schemaFields) {
                expect(labels).toContain(field);
            }
        });

        it("should sort required fields before optional fields", () => {
            const json = '{\n  "rules": [\n    { }\n  ]\n}';
            const offset = json.indexOf("{ }") + 2;
            const { document, position } = makeDocAndPosition(json, offset);

            const items = provider.provideCompletionItems(document as any, position as any);

            const requiredFields = Object.entries(DECORATION_RULE_FIELDS)
                .filter(([, m]) => m.required).map(([k]) => k);
            const optionalFields = Object.entries(DECORATION_RULE_FIELDS)
                .filter(([, m]) => !m.required).map(([k]) => k);

            for (const req of requiredFields) {
                const reqItem = items!.find((i) => i.label === req);
                for (const opt of optionalFields) {
                    const optItem = items!.find((i) => i.label === opt);
                    expect(reqItem!.sortText! < optItem!.sortText!).toBe(true);
                }
            }
        });
    });

    describe("color value completions", () => {
        it("should return color values when inside a color value string", () => {
            const json = '{\n  "rules": [\n    { "color": "" }\n  ]\n}';
            //                                          ^ cursor inside the empty color value
            const offset = json.indexOf('""', json.indexOf('"color"') + 7) + 1;
            const { document, position } = makeDocAndPosition(json, offset);

            const items = provider.provideCompletionItems(document as any, position as any);

            expect(items).toBeDefined();
            expect(items!.length).toBeGreaterThan(10);
            const chartsYellow = items!.find((i) => i.label === "charts.yellow");
            expect(chartsYellow).toBeDefined();
            expect(chartsYellow!.detail).toMatch(/^#[0-9A-Fa-f]{6}/);
        });

        it("should use CompletionItemKind.Color for color suggestions", () => {
            const json = '{\n  "rules": [\n    { "color": "" }\n  ]\n}';
            const offset = json.indexOf('""', json.indexOf('"color"') + 7) + 1;
            const { document, position } = makeDocAndPosition(json, offset);

            const items = provider.provideCompletionItems(document as any, position as any);

            for (const item of items!) {
                expect(item.kind).toBe(16); // CompletionItemKind.Color
            }
        });
    });

    describe("propagate value completions", () => {
        it("should return true/false when inside a propagate value", () => {
            const json = '{\n  "rules": [\n    { "propagate": }\n  ]\n}';
            const offset = json.indexOf('"propagate":') + '"propagate": '.length;
            const { document, position } = makeDocAndPosition(json, offset);

            const items = provider.provideCompletionItems(document as any, position as any);

            expect(items).toBeDefined();
            const labels = items!.map((i) => i.label);
            expect(labels).toContain("true");
            expect(labels).toContain("false");
        });
    });

    describe("filter value completions", () => {
        it("should return snippet templates when inside a filter value", () => {
            const json = '{\n  "rules": [\n    { "filter": "" }\n  ]\n}';
            const offset = json.indexOf('""', json.indexOf('"filter"') + 8) + 1;
            const { document, position } = makeDocAndPosition(json, offset);

            const items = provider.provideCompletionItems(document as any, position as any);

            expect(items).toBeDefined();
            const labels = items!.map((i) => i.label);
            expect(labels).toContain("FolderName/");
            expect(labels).toContain("*.extension");
            expect(labels).toContain("exact/path");
        });
    });

    describe("top-level completions", () => {
        it("should suggest 'rules' key for an empty object", () => {
            const json = "{ }";
            const offset = 2; // between { and }
            const { document, position } = makeDocAndPosition(json, offset);

            const items = provider.provideCompletionItems(document as any, position as any);

            expect(items).toBeDefined();
            const labels = items!.map((i) => i.label);
            expect(labels).toContain("rules");
        });
    });
});
