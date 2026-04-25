import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("vscode", () => ({
    CompletionItem: vi.fn().mockImplementation(function (this: any, label: string, kind: number) { this.label = label; this.kind = kind; this.detail = undefined; this.filterText = undefined; this.sortText = undefined; this.range = undefined; this.insertText = undefined; this.command = undefined; }),
    CompletionItemKind: { Value: 12 },
    Position: vi.fn().mockImplementation(function (this: any, line: number, char: number) { this.line = line; this.character = char; }),
    Range: vi.fn().mockImplementation(function (this: any, s: unknown, e: unknown) { this.start = s; this.end = e; }),
    workspace: { asRelativePath: vi.fn((uri: any) => typeof uri === "string" ? uri : uri.path) },
}));

vi.mock("minimatch", () => ({ minimatch: vi.fn(() => true) }));

import { SnippetCompletionProvider, type SnippetProvider } from "../../../../src/features/snippets/snippetCompletionProvider";
import type { SnippetDefinition } from "../../../../src/features/snippets/types";

function makeSnippet(overrides: Partial<SnippetDefinition> = {}): SnippetDefinition {
    return {
        trigger: "{date}",
        label: "Date",
        description: "Insert date",
        glob: "**/*.md",
        pathSafe: false,
        ...overrides,
    };
}

function makeDocument(lineText: string, uri = "file:///test.md") {
    return {
        uri: { path: uri, toString: () => uri },
        lineAt: vi.fn(() => ({ text: lineText })),
    } as any;
}

function makePosition(line: number, character: number) {
    return { line, character } as any;
}

function makeContext(triggerCharacter?: string) {
    return { triggerCharacter } as any;
}

describe("SnippetCompletionProvider", () => {
    let provider: SnippetCompletionProvider;
    let snippetProvider: SnippetProvider;

    beforeEach(() => {
        vi.clearAllMocks();
        snippetProvider = { getAllSnippets: vi.fn(() => [makeSnippet()]) };
        provider = new SnippetCompletionProvider(snippetProvider);
    });

    describe("provideCompletionItems", () => {
        it("should return completions when trigger char is {", () => {
            const doc = makeDocument("{");
            const pos = makePosition(0, 1);

            const result = provider.provideCompletionItems(doc, pos, {} as any, makeContext("{"));

            expect(result).toBeDefined();
            expect(result).toHaveLength(1);
            expect(result![0].label).toBe("Date");
        });

        it("should return completions when trigger char is @", () => {
            const contactSnippet = makeSnippet({ trigger: "@john", label: "John" });
            vi.mocked(snippetProvider.getAllSnippets).mockReturnValue([contactSnippet]);
            const doc = makeDocument("@");
            const pos = makePosition(0, 1);

            const result = provider.provideCompletionItems(doc, pos, {} as any, makeContext("@"));

            expect(result).toBeDefined();
            expect(result).toHaveLength(1);
            expect(result![0].label).toBe("John");
        });

        it("should return undefined when no trigger character detected", () => {
            const doc = makeDocument("hello world");
            const pos = makePosition(0, 11);

            const result = provider.provideCompletionItems(doc, pos, {} as any, makeContext());

            expect(result).toBeUndefined();
        });

        it("should filter snippets by trigger prefix ({ vs @)", () => {
            const braceSnippet = makeSnippet({ trigger: "{date}", label: "Date" });
            const contactSnippet = makeSnippet({ trigger: "@john", label: "John" });
            vi.mocked(snippetProvider.getAllSnippets).mockReturnValue([braceSnippet, contactSnippet]);
            const doc = makeDocument("{");
            const pos = makePosition(0, 1);

            const result = provider.provideCompletionItems(doc, pos, {} as any, makeContext("{"));

            expect(result).toHaveLength(1);
            expect(result![0].label).toBe("Date");
        });

        it("should return undefined when no matching snippets", () => {
            const contactSnippet = makeSnippet({ trigger: "@only-contacts", label: "Contact" });
            vi.mocked(snippetProvider.getAllSnippets).mockReturnValue([contactSnippet]);
            const doc = makeDocument("{");
            const pos = makePosition(0, 1);

            const result = provider.provideCompletionItems(doc, pos, {} as any, makeContext("{"));

            expect(result).toBeUndefined();
        });

        it("should use insertText for static snippets (body defined, no expand)", () => {
            const snippet = makeSnippet({ body: "2026-04-24" });
            vi.mocked(snippetProvider.getAllSnippets).mockReturnValue([snippet]);
            const doc = makeDocument("{");
            const pos = makePosition(0, 1);

            const result = provider.provideCompletionItems(doc, pos, {} as any, makeContext("{"));

            expect(result).toHaveLength(1);
            expect(result![0].insertText).toBe("2026-04-24");
            expect(result![0].command).toBeUndefined();
        });

        it("should use command for dynamic snippets (expand defined)", () => {
            const snippet = makeSnippet({ expand: () => "expanded" });
            vi.mocked(snippetProvider.getAllSnippets).mockReturnValue([snippet]);
            const doc = makeDocument("{");
            const pos = makePosition(0, 1);

            const result = provider.provideCompletionItems(doc, pos, {} as any, makeContext("{"));

            expect(result).toHaveLength(1);
            expect(result![0].insertText).toBe("");
            expect(result![0].command).toEqual({
                title: "Expand snippet",
                command: "memoria.expandSnippet",
                arguments: ["{date}", "file:///test.md", 0, 1],
            });
        });

        it("should use command for parameterized snippets", () => {
            const snippet = makeSnippet({
                body: "template",
                parameters: [{ name: "name" }],
            });
            vi.mocked(snippetProvider.getAllSnippets).mockReturnValue([snippet]);
            const doc = makeDocument("{");
            const pos = makePosition(0, 1);

            const result = provider.provideCompletionItems(doc, pos, {} as any, makeContext("{"));

            expect(result).toHaveLength(1);
            expect(result![0].insertText).toBe("");
            expect(result![0].command).toBeDefined();
            expect(result![0].command!.command).toBe("memoria.expandSnippet");
        });

        it("should set detail, filterText, sortText, and range on completion item", () => {
            const snippet = makeSnippet({ description: "My desc", filterText: "custom-filter" });
            vi.mocked(snippetProvider.getAllSnippets).mockReturnValue([snippet]);
            const doc = makeDocument("{");
            const pos = makePosition(0, 1);

            const result = provider.provideCompletionItems(doc, pos, {} as any, makeContext("{"));

            expect(result![0].detail).toBe("My desc");
            expect(result![0].filterText).toBe("custom-filter");
            expect(result![0].sortText).toBe("{date}");
            expect(result![0].range).toBeDefined();
        });

        it("should use trigger as filterText when filterText is not defined", () => {
            const snippet = makeSnippet({ filterText: undefined });
            vi.mocked(snippetProvider.getAllSnippets).mockReturnValue([snippet]);
            const doc = makeDocument("{");
            const pos = makePosition(0, 1);

            const result = provider.provideCompletionItems(doc, pos, {} as any, makeContext("{"));

            expect(result![0].filterText).toBe("{date}");
        });
    });

    describe("detectTrigger (via provideCompletionItems)", () => {
        it("should detect { in middle of line", () => {
            const doc = makeDocument("hello {dat");
            const pos = makePosition(0, 10);

            const result = provider.provideCompletionItems(doc, pos, {} as any, makeContext());

            expect(result).toBeDefined();
            expect(result).toHaveLength(1);
        });

        it("should stop at whitespace and return undefined", () => {
            const doc = makeDocument("hello dat");
            const pos = makePosition(0, 9);

            const result = provider.provideCompletionItems(doc, pos, {} as any, makeContext());

            expect(result).toBeUndefined();
        });

        it("should exclude snippets whose visible predicate returns false", () => {
            const visibleSnippet = makeSnippet({ trigger: "{vis}", label: "Visible" });
            const hiddenSnippet = makeSnippet({
                trigger: "{hid}",
                label: "Hidden",
                visible: () => false,
            });
            vi.mocked(snippetProvider.getAllSnippets).mockReturnValue([visibleSnippet, hiddenSnippet]);
            const doc = makeDocument("{");
            const pos = makePosition(0, 1);

            const result = provider.provideCompletionItems(doc, pos, {} as any, makeContext("{"));

            expect(result).toHaveLength(1);
            expect(result![0].label).toBe("Visible");
        });

        it("should include snippets whose visible predicate returns true", () => {
            const snippet = makeSnippet({
                trigger: "{show}",
                label: "Show",
                visible: () => true,
            });
            vi.mocked(snippetProvider.getAllSnippets).mockReturnValue([snippet]);
            const doc = makeDocument("{");
            const pos = makePosition(0, 1);

            const result = provider.provideCompletionItems(doc, pos, {} as any, makeContext("{"));

            expect(result).toHaveLength(1);
            expect(result![0].label).toBe("Show");
        });

        it("should include snippets without a visible predicate", () => {
            const snippet = makeSnippet({ trigger: "{no-vis}", label: "NoVis" });
            vi.mocked(snippetProvider.getAllSnippets).mockReturnValue([snippet]);
            const doc = makeDocument("{");
            const pos = makePosition(0, 1);

            const result = provider.provideCompletionItems(doc, pos, {} as any, makeContext("{"));

            expect(result).toHaveLength(1);
            expect(result![0].label).toBe("NoVis");
        });
    });
});
