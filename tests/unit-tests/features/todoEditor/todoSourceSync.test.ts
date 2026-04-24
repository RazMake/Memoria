import { describe, it, expect, vi, beforeEach } from "vitest";
import type { TaskBlock } from "../../../../src/features/taskCollector/types";

const mockOpenTextDocument = vi.fn();
const mockApplyEdit = vi.fn();
const mockShowWarningMessage = vi.fn();

vi.mock("vscode", () => ({
    workspace: {
        openTextDocument: (...args: unknown[]) => mockOpenTextDocument(...args),
        applyEdit: (...args: unknown[]) => mockApplyEdit(...args),
    },
    window: {
        showWarningMessage: (...args: unknown[]) => mockShowWarningMessage(...args),
    },
    Uri: {
        joinPath: (base: any, ...segments: string[]) => ({
            path: `${base.path}/${segments.join("/")}`,
            toString: () => `file://${base.path}/${segments.join("/")}`,
        }),
    },
    WorkspaceEdit: class {
        replace(_uri: unknown, _range: unknown, _text: string): void {}
    },
    Range: class {
        constructor(
            public readonly startLine: number,
            public readonly startChar: number,
            public readonly endLine: number,
            public readonly endChar: number,
        ) {}
    },
    EndOfLine: { LF: 1, CRLF: 2 },
}));

const mockParseTaskBlocks = vi.fn<() => TaskBlock[]>();
vi.mock("../../../../src/features/taskCollector/taskParser", () => ({
    parseTaskBlocks: (...args: unknown[]) => mockParseTaskBlocks(...(args as [string])),
}));

const mockReplaceLineRange = vi.fn<() => string>();
vi.mock("../../../../src/features/taskCollector/taskWriter", () => ({
    replaceLineRange: (...args: unknown[]) => mockReplaceLineRange(...(args as [string, number, number, string, string])),
}));

import { writeBackToSource, markRemovedInSource } from "../../../../src/features/todoEditor/todoSourceSync";

describe("todoSourceSync", () => {
    const workspaceRoot = { path: "/workspace" } as any;

    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe("writeBackToSource", () => {
        it("should find task in source file and update it", async () => {
            const sourceText = "- [ ] old body";
            const sourceDoc = {
                getText: () => sourceText,
                eol: 1, // LF
                lineCount: 1,
                save: vi.fn(),
            };
            mockOpenTextDocument.mockResolvedValue(sourceDoc);

            const matchBlock: TaskBlock = {
                indent: 0,
                indentText: "",
                checked: false,
                firstLineText: "old body",
                continuationLines: [],
                bodyRange: { startLine: 0, endLine: 0 },
                body: "old body",
                rawLines: ["- [ ] old body"],
            };
            mockParseTaskBlocks.mockReturnValue([matchBlock]);
            mockReplaceLineRange.mockReturnValue("- [ ] new body");
            mockApplyEdit.mockResolvedValue(true);

            await writeBackToSource(workspaceRoot, "notes.md", "old body", "new body");

            expect(mockParseTaskBlocks).toHaveBeenCalledWith(sourceText);
            expect(mockReplaceLineRange).toHaveBeenCalled();
            expect(mockApplyEdit).toHaveBeenCalled();
        });

        it("should show warning when task not found in source", async () => {
            const sourceDoc = {
                getText: () => "no tasks here",
                eol: 1,
                lineCount: 1,
            };
            mockOpenTextDocument.mockResolvedValue(sourceDoc);
            mockParseTaskBlocks.mockReturnValue([]);

            await writeBackToSource(workspaceRoot, "notes.md", "missing body", "new body");

            expect(mockShowWarningMessage).toHaveBeenCalledWith(
                expect.stringContaining("Could not find task in source file"),
            );
        });

        it("should show warning on failure", async () => {
            mockOpenTextDocument.mockRejectedValue(new Error("file not found"));

            await writeBackToSource(workspaceRoot, "missing.md", "body", "new body");

            expect(mockShowWarningMessage).toHaveBeenCalledWith(
                expect.stringContaining("Could not find task in source file"),
            );
        });
    });

    describe("markRemovedInSource", () => {
        it("should mark task as '(Removed)' in source", async () => {
            const sourceText = "- [ ] buy milk";
            const sourceDoc = {
                getText: () => sourceText,
                eol: 1,
                lineCount: 1,
                save: vi.fn(),
            };
            mockOpenTextDocument.mockResolvedValue(sourceDoc);

            const matchBlock: TaskBlock = {
                indent: 0,
                indentText: "",
                checked: false,
                firstLineText: "buy milk",
                continuationLines: [],
                bodyRange: { startLine: 0, endLine: 0 },
                body: "buy milk",
                rawLines: ["- [ ] buy milk"],
            };
            mockParseTaskBlocks.mockReturnValue([matchBlock]);
            mockReplaceLineRange.mockReturnValue("- TODO: (Removed) buy milk");
            mockApplyEdit.mockResolvedValue(true);

            await markRemovedInSource(workspaceRoot, "notes.md", "buy milk");

            expect(mockReplaceLineRange).toHaveBeenCalledWith(
                sourceText, 0, 0, "- TODO: (Removed) buy milk", "\n",
            );
            expect(mockApplyEdit).toHaveBeenCalled();
        });

        it("should show warning when task not found", async () => {
            const sourceDoc = {
                getText: () => "no tasks",
                eol: 1,
                lineCount: 1,
            };
            mockOpenTextDocument.mockResolvedValue(sourceDoc);
            mockParseTaskBlocks.mockReturnValue([]);

            await markRemovedInSource(workspaceRoot, "notes.md", "missing");

            expect(mockShowWarningMessage).toHaveBeenCalledWith(
                expect.stringContaining("Could not find task in source file"),
            );
        });

        it("should show warning on failure", async () => {
            mockOpenTextDocument.mockRejectedValue(new Error("file not found"));

            await markRemovedInSource(workspaceRoot, "missing.md", "body");

            expect(mockShowWarningMessage).toHaveBeenCalledWith(
                expect.stringContaining("Could not find task in source file"),
            );
        });
    });
});
