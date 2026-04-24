import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ResolvedContact } from "../../../../src/features/contacts/contactUtils";

vi.mock("vscode", () => ({
    commands: {
        executeCommand: vi.fn().mockResolvedValue(undefined),
    },
    Range: class {
        constructor(
            public startLine: number,
            public startCharacter: number,
            public endLine: number,
            public endCharacter: number,
        ) {}
    },
    Hover: class {
        constructor(public contents: any, public range?: any) {}
    },
    MarkdownString: class {
        value = "";
        appendMarkdown(val: string) {
            this.value += val;
            return this;
        }
    },
}));

import { SnippetHoverProvider, type ContactExpansionMap } from "../../../../src/features/snippets/snippetHoverProvider";

function makeContact(overrides: Partial<ResolvedContact> = {}): ResolvedContact {
    return {
        kind: "report",
        id: "johnsmith",
        nickname: "John",
        fullName: "John Smith",
        title: "Software Engineer",
        careerPathKey: "sde",
        pronounsKey: "he",
        extraFields: {},
        droppedFields: {},
        levelId: "l2",
        levelStartDate: "2025-07-20",
        groupFile: "Reports.md",
        groupName: "Reports",
        groupType: "report",
        isCustomGroup: false,
        shortTitle: "SDE 2",
        resolvedPronouns: { key: "he", subject: "he", object: "him", possessiveAdjective: "his", possessive: "his", reflexive: "himself", extraFields: {} },
        resolvedCareerPath: { key: "sde", name: "Software Development Engineer", short: "SDE", minimumCareerLevel: 1, extraFields: {} },
        resolvedCareerLevel: { key: "l2", id: 2, interviewType: "coding", titlePattern: "SDE {level}", extraFields: {} },
        resolvedInterviewType: { key: "coding", name: "Coding Interview", extraFields: {} },
        ...overrides,
    } as ResolvedContact;
}

function makeDocument(lineText: string) {
    return {
        lineAt: (_line: number) => ({ text: lineText }),
    } as any;
}

function makePosition(line: number, character: number) {
    return { line, character } as any;
}

const token = {} as any;

describe("SnippetHoverProvider", () => {
    const contact = makeContact();
    let expansionMap: ContactExpansionMap;
    let provider: SnippetHoverProvider;

    beforeEach(() => {
        expansionMap = {
            getExpansionEntries: () => [{ text: "John Smith", contact }],
        };
        provider = new SnippetHoverProvider(expansionMap);
    });

    it("returns undefined when cursor is not on contact text", () => {
        const doc = makeDocument("no contact here");
        const result = provider.provideHover(doc, makePosition(0, 3), token);
        expect(result).toBeUndefined();
    });

    it("returns brief hover by default", () => {
        const doc = makeDocument("Hello John Smith!");
        const result = provider.provideHover(doc, makePosition(0, 10), token);

        expect(result).toBeDefined();
        const md = result!.contents as any;
        expect(md.value).toContain("johnsmith");
        expect(md.value).toContain("Software Engineer");
        expect(md.value).not.toContain("Level");
    });

    it("returns detailed hover after showDetailedHover flag is set", async () => {
        // Simulate what showDetailedHover does: set the flag, then call provideHover
        // (in real code, editor.action.showHover triggers provideHover asynchronously)
        (provider as any).detailed = true;

        const doc = makeDocument("Hello John Smith!");
        const result = provider.provideHover(doc, makePosition(0, 10), token);

        expect(result).toBeDefined();
        const md = result!.contents as any;
        expect(md.value).toContain("johnsmith");
        expect(md.value).toContain("Software Engineer");
        expect(md.value).toContain("SDE");
    });

    it("consumes the detailed flag after provideHover is called", () => {
        (provider as any).detailed = true;

        const doc = makeDocument("Hello John Smith!");
        provider.provideHover(doc, makePosition(0, 10), token);

        // Flag should be consumed — next hover should be brief
        const result2 = provider.provideHover(doc, makePosition(0, 10), token);
        const md = result2!.contents as any;
        expect(md.value).not.toContain("Level");
    });

    it("consumes the detailed flag even when no match is found", () => {
        (provider as any).detailed = true;

        const doc = makeDocument("no contact here");
        provider.provideHover(doc, makePosition(0, 3), token);

        // Flag should be consumed
        expect((provider as any).detailed).toBe(false);
    });

    it("matches the second occurrence on the same line", () => {
        const doc = makeDocument("John Smith met John Smith");
        // Cursor on the second "John Smith" (col 18)
        const result = provider.provideHover(doc, makePosition(0, 18), token);

        expect(result).toBeDefined();
        expect(result!.range.startCharacter).toBe(15);
        expect(result!.range.endCharacter).toBe(25);
    });

    it("showDetailedHover sets the flag before triggering hover command", async () => {
        const vscode = await import("vscode");
        const execSpy = vi.mocked(vscode.commands.executeCommand);
        execSpy.mockImplementation(async () => {
            // At the moment the command fires, the flag must be true
            expect((provider as any).detailed).toBe(true);
        });

        await provider.showDetailedHover();

        // Flag stays true because provideHover hasn't been called yet
        expect((provider as any).detailed).toBe(true);
        expect(execSpy).toHaveBeenCalledWith("editor.action.showHover");
    });
});
