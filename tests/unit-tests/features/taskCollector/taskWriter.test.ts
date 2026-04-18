import { beforeEach, describe, expect, it, vi } from "vitest";
import { TaskWriter, renderDoneBlock, renderTaskBlock, replaceLineRange } from "../../../../src/features/taskCollector/taskWriter";
import type { TaskBlock } from "../../../../src/features/taskCollector/types";

const { mockOpenTextDocument, mockApplyEdit } = vi.hoisted(() => ({
    mockOpenTextDocument: vi.fn(),
    mockApplyEdit: vi.fn(),
}));

vi.mock("vscode", () => ({
    workspace: {
        openTextDocument: (...args: unknown[]) => mockOpenTextDocument(...args),
        applyEdit: (...args: unknown[]) => mockApplyEdit(...args),
    },
    WorkspaceEdit: class {
        public readonly operations: Array<Record<string, unknown>> = [];

        createFile(uri: unknown, options: unknown): void {
            this.operations.push({ type: "createFile", uri, options });
        }

        insert(uri: unknown, position: unknown, text: string): void {
            this.operations.push({ type: "insert", uri, position, text });
        }

        replace(uri: unknown, range: unknown, text: string): void {
            this.operations.push({ type: "replace", uri, range, text });
        }
    },
    Position: class {
        constructor(
            public readonly line: number,
            public readonly character: number,
        ) {}
    },
    Range: class {
        constructor(
            public readonly start: unknown,
            public readonly end: unknown,
        ) {}
    },
    EndOfLine: {
        LF: 1,
        CRLF: 2,
    },
}));

describe("TaskWriter", () => {
    const uri = {
        path: "/workspace/notes.md",
        toString: () => "file:///workspace/notes.md",
    } as any;

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("should replace the full document, register the pending write, and save when editing a clean document", async () => {
        const pendingWrites = { register: vi.fn() };
        const writer = new TaskWriter(pendingWrites as any);
        const currentDocument = makeDocument(uri, "alpha");
        const updatedDocument = makeDocument(uri, "beta");

        mockOpenTextDocument
            .mockResolvedValueOnce(currentDocument)
            .mockResolvedValueOnce(updatedDocument);
        mockApplyEdit.mockResolvedValue(true);

        const changed = await writer.mutateDocument(uri, () => "beta");

        expect(changed).toBe(true);
        expect(mockApplyEdit).toHaveBeenCalledOnce();
        expect(mockApplyEdit.mock.calls[0][1]).toEqual({ isRefactoring: false });
        expect(mockApplyEdit.mock.calls[0][0].operations).toEqual([
            expect.objectContaining({ type: "replace", uri, text: "beta" }),
        ]);
        expect(pendingWrites.register).toHaveBeenCalledWith("file:///workspace/notes.md", "beta");
        expect(updatedDocument.save).toHaveBeenCalledOnce();
    });

    it("should create a missing file when allowCreate is true", async () => {
        const pendingWrites = { register: vi.fn() };
        const writer = new TaskWriter(pendingWrites as any);
        const createdDocument = makeDocument(uri, "created");

        mockOpenTextDocument
            .mockRejectedValueOnce(new Error("missing"))
            .mockResolvedValueOnce(createdDocument);
        mockApplyEdit.mockResolvedValue(true);

        const changed = await writer.mutateDocument(uri, () => "created", { allowCreate: true });

        expect(changed).toBe(true);
        expect(mockApplyEdit.mock.calls[0][0].operations).toEqual([
            expect.objectContaining({ type: "createFile", uri }),
            expect.objectContaining({ type: "insert", uri, text: "created" }),
        ]);
        expect(createdDocument.save).toHaveBeenCalledOnce();
    });

    it("should return false when the builder returns null or an unchanged document", async () => {
        const pendingWrites = { register: vi.fn() };
        const writer = new TaskWriter(pendingWrites as any);
        const currentDocument = makeDocument(uri, "alpha");

        mockOpenTextDocument.mockResolvedValue(currentDocument);

        await expect(writer.mutateDocument(uri, () => null)).resolves.toBe(false);
        await expect(writer.mutateDocument(uri, () => "alpha")).resolves.toBe(false);

        expect(mockApplyEdit).not.toHaveBeenCalled();
        expect(pendingWrites.register).not.toHaveBeenCalled();
    });

    it("should save and register pending writes even when the existing document is already dirty", async () => {
        const pendingWrites = { register: vi.fn() };
        const writer = new TaskWriter(pendingWrites as any);
        const dirtyDocument = makeDocument(uri, "alpha", { isDirty: true });

        mockOpenTextDocument
            .mockResolvedValueOnce(dirtyDocument)
            .mockResolvedValueOnce(dirtyDocument);
        mockApplyEdit.mockResolvedValue(true);

        const changed = await writer.mutateDocument(uri, () => "beta");

        expect(changed).toBe(true);
        expect(pendingWrites.register).toHaveBeenCalledWith("file:///workspace/notes.md", "beta");
        expect(dirtyDocument.save).toHaveBeenCalledOnce();
    });

    it("should retry failed applyEdit attempts and throw after the retry limit is exhausted", async () => {
        const pendingWrites = { register: vi.fn() };
        const writer = new TaskWriter(pendingWrites as any, 2);
        const currentDocument = makeDocument(uri, "alpha");

        mockOpenTextDocument.mockResolvedValue(currentDocument);
        mockApplyEdit.mockResolvedValue(false);

        await expect(writer.mutateDocument(uri, () => "beta")).rejects.toThrow(
            "Memoria: Failed to apply task edit for file:///workspace/notes.md after 2 attempts."
        );
        expect(mockApplyEdit).toHaveBeenCalledTimes(2);
    });

    it("should replace inclusive line ranges and render task blocks while preserving indentation", () => {
        const block: TaskBlock = {
            indent: 4,
            indentText: "    ",
            checked: false,
            firstLineText: "Original",
            continuationLines: ["      detail"],
            bodyRange: { startLine: 1, endLine: 2 },
            body: "Original\n      detail",
            rawLines: ["    - [ ] Original", "      detail"],
        };

        expect(replaceLineRange("a\nb\nc", 1, 1, "x\ny", "\r\n")).toBe("a\r\nx\r\ny\r\nc");
        expect(renderTaskBlock(block, "Updated\n      detail", true)).toBe("    - [x] Updated\n      detail");
        expect(renderDoneBlock(block, "Updated\n      detail")).toBe("    - **Done**: Updated\n      detail");
    });
});

function makeDocument(
    uri: any,
    text: string,
    options: { isDirty?: boolean; eol?: number } = {},
): any {
    return {
        uri,
        eol: options.eol ?? 1,
        isDirty: options.isDirty ?? false,
        getText: () => text,
        positionAt: (offset: number) => ({ offset }),
        save: vi.fn().mockResolvedValue(true),
    };
}