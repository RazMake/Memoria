import { describe, it, expect, vi, beforeEach } from "vitest";
import { createOpenDefaultFileCommand, promptToSaveDirtyFiles } from "../../../src/commands/openDefaultFile";

const mockWorkspaceFolders: any[] = [];
const mockTextDocuments: any[] = [];
const mockOpenTextDocument = vi.fn();
const mockShowTextDocument = vi.fn();
const mockShowQuickPick = vi.fn();
const mockExecuteCommand = vi.fn();
const mockTabGroupsClose = vi.fn().mockResolvedValue(true);
const mockTabGroups: any[] = [];

vi.mock("vscode", () => ({
    workspace: {
        get workspaceFolders() {
            return mockWorkspaceFolders;
        },
        get textDocuments() {
            return mockTextDocuments;
        },
        openTextDocument: (...args: any[]) => mockOpenTextDocument(...args),
        asRelativePath: (uri: any) => {
            const p = typeof uri === "string" ? uri : uri.path;
            return p.replace(/^\/workspace\//, "");
        },
    },
    window: {
        showTextDocument: (...args: any[]) => mockShowTextDocument(...args),
        showQuickPick: (...args: any[]) => mockShowQuickPick(...args),
        tabGroups: {
            get all() {
                return mockTabGroups;
            },
            close: (...args: any[]) => mockTabGroupsClose(...args),
        },
    },
    commands: {
        executeCommand: (...args: any[]) => mockExecuteCommand(...args),
    },
    Uri: {
        joinPath: vi.fn((base: any, ...segments: string[]) => ({
            ...base,
            path: [base.path, ...segments].join("/"),
        })),
    },
    ViewColumn: {
        Active: -1,
        One: 1,
        Two: 2,
        Three: 3,
    },
}));

const workspaceRoot = { path: "/workspace" } as any;

describe("createOpenDefaultFileCommand", () => {
    let mockManifest: any;

    beforeEach(() => {
        vi.clearAllMocks();
        mockWorkspaceFolders.length = 0;
        mockTextDocuments.length = 0;
        mockTabGroups.length = 0;
        mockTabGroups.push({ tabs: [] });
        mockManifest = {
            findInitializedRoot: vi.fn().mockResolvedValue(null),
            readDefaultFiles: vi.fn().mockResolvedValue(null),
        };
    });

    it("should do nothing when invoked without folder URI", async () => {
        mockWorkspaceFolders.push({ uri: workspaceRoot });
        const handler = createOpenDefaultFileCommand(mockManifest);
        await handler();
        expect(mockManifest.findInitializedRoot).not.toHaveBeenCalled();
        expect(mockExecuteCommand).not.toHaveBeenCalledWith("vscode.open", expect.anything(), expect.anything());
    });

    it("should do nothing when no workspace is open", async () => {
        const handler = createOpenDefaultFileCommand(mockManifest);
        const folderUri = { path: "/workspace/00-ToDo" } as any;
        await handler(folderUri);
        expect(mockManifest.findInitializedRoot).not.toHaveBeenCalled();
        expect(mockExecuteCommand).not.toHaveBeenCalledWith("vscode.open", expect.anything(), expect.anything());
    });

    it("should do nothing when folder is not under any workspace root", async () => {
        mockWorkspaceFolders.push({ uri: workspaceRoot });

        const handler = createOpenDefaultFileCommand(mockManifest);
        const folderUri = { path: "/unknown/00-ToDo" } as any;
        await handler(folderUri);
        expect(mockManifest.findInitializedRoot).not.toHaveBeenCalled();
        expect(mockExecuteCommand).not.toHaveBeenCalledWith("vscode.open", expect.anything(), expect.anything());
    });

    it("should do nothing when no initialized root is found", async () => {
        mockWorkspaceFolders.push({ uri: workspaceRoot });
        mockManifest.findInitializedRoot.mockResolvedValue(null);

        const handler = createOpenDefaultFileCommand(mockManifest);
        const folderUri = { path: "/workspace/00-ToDo" } as any;
        await handler(folderUri);
        expect(mockExecuteCommand).not.toHaveBeenCalledWith("vscode.open", expect.anything(), expect.anything());
    });

    it("should do nothing when default-files.json has no defaultFiles", async () => {
        mockWorkspaceFolders.push({ uri: workspaceRoot });
        mockManifest.findInitializedRoot.mockResolvedValue(workspaceRoot);
        mockManifest.readDefaultFiles.mockResolvedValue(null);

        const handler = createOpenDefaultFileCommand(mockManifest);
        const folderUri = { path: "/workspace/00-ToDo" } as any;
        await handler(folderUri);
        expect(mockExecuteCommand).not.toHaveBeenCalledWith("vscode.open", expect.anything(), expect.anything());
    });

    it("should open the correct default file when invoked with a folder URI", async () => {
        mockWorkspaceFolders.push({ uri: workspaceRoot });
        mockManifest.findInitializedRoot.mockResolvedValue(workspaceRoot);
        mockManifest.readDefaultFiles.mockResolvedValue({
            "00-ToDo/": { filesToOpen: ["Main.todo"] },
            "01-Notes/": { filesToOpen: ["Index.md"] },
        });

        mockExecuteCommand.mockResolvedValue(undefined);

        const folderUri = { path: "/workspace/00-ToDo" } as any;
        const handler = createOpenDefaultFileCommand(mockManifest);
        await handler(folderUri);

        expect(mockExecuteCommand).toHaveBeenCalledWith(
            "vscode.open",
            expect.objectContaining({ path: "/workspace/00-ToDo/Main.todo" }),
            { viewColumn: 1, preview: false },
        );
    });

    it("should close all existing editors before opening default files", async () => {
        mockWorkspaceFolders.push({ uri: workspaceRoot });
        mockManifest.findInitializedRoot.mockResolvedValue(workspaceRoot);
        mockManifest.readDefaultFiles.mockResolvedValue({
            "00-ToDo/": { filesToOpen: ["Main.todo"] },
        });

        mockExecuteCommand.mockResolvedValue(undefined);

        const folderUri = { path: "/workspace/00-ToDo" } as any;
        const handler = createOpenDefaultFileCommand(mockManifest);
        await handler(folderUri);

        expect(mockTabGroupsClose).toHaveBeenCalled();
        // tabGroups.close must be called before vscode.open.
        const closeOrder = mockTabGroupsClose.mock.invocationCallOrder[0];
        const openOrder = mockExecuteCommand.mock.invocationCallOrder[0];
        expect(closeOrder).toBeLessThan(openOrder);
    });

    it("should open a different folder's default file based on folder URI", async () => {
        mockWorkspaceFolders.push({ uri: workspaceRoot });
        mockManifest.findInitializedRoot.mockResolvedValue(workspaceRoot);
        mockManifest.readDefaultFiles.mockResolvedValue({
            "00-ToDo/": { filesToOpen: ["Main.todo"] },
            "01-Notes/": { filesToOpen: ["Index.md"] },
        });

        mockExecuteCommand.mockResolvedValue(undefined);

        const folderUri = { path: "/workspace/01-Notes" } as any;
        const handler = createOpenDefaultFileCommand(mockManifest);
        await handler(folderUri);

        expect(mockExecuteCommand).toHaveBeenCalledWith(
            "vscode.open",
            expect.objectContaining({ path: "/workspace/01-Notes/Index.md" }),
            expect.anything(),
        );
    });

    it("should open multiple files side by side with incrementing ViewColumn", async () => {
        mockWorkspaceFolders.push({ uri: workspaceRoot });
        mockManifest.findInitializedRoot.mockResolvedValue(workspaceRoot);
        mockManifest.readDefaultFiles.mockResolvedValue({
            "00-ToDo/": { filesToOpen: ["Main.todo", "Work.todo"] },
        });

        mockExecuteCommand.mockResolvedValue(undefined);

        const folderUri = { path: "/workspace/00-ToDo" } as any;
        const handler = createOpenDefaultFileCommand(mockManifest);
        await handler(folderUri);

        const vsCodeOpenCalls = mockExecuteCommand.mock.calls.filter(
            (c: any[]) => c[0] === "vscode.open",
        );
        expect(vsCodeOpenCalls).toHaveLength(2);
        expect(vsCodeOpenCalls[0][2]).toEqual({ viewColumn: 1, preview: false });
        expect(vsCodeOpenCalls[1][2]).toEqual({ viewColumn: 2, preview: false });
    });

    it("should skip missing files and open the rest", async () => {
        mockWorkspaceFolders.push({ uri: workspaceRoot });
        mockManifest.findInitializedRoot.mockResolvedValue(workspaceRoot);
        mockManifest.readDefaultFiles.mockResolvedValue({
            "00-ToDo/": { filesToOpen: ["Missing.todo", "Main.todo"] },
        });

        mockExecuteCommand
            .mockRejectedValueOnce(new Error("File not found"))
            .mockResolvedValueOnce(undefined);

        const folderUri = { path: "/workspace/00-ToDo" } as any;
        const handler = createOpenDefaultFileCommand(mockManifest);
        await handler(folderUri);

        const vsCodeOpenCalls = mockExecuteCommand.mock.calls.filter(
            (c: any[]) => c[0] === "vscode.open",
        );
        expect(vsCodeOpenCalls).toHaveLength(2);
    });

    it("should do nothing when all files are missing", async () => {
        mockWorkspaceFolders.push({ uri: workspaceRoot });
        mockManifest.findInitializedRoot.mockResolvedValue(workspaceRoot);
        mockManifest.readDefaultFiles.mockResolvedValue({
            "00-ToDo/": { filesToOpen: ["Missing1.todo", "Missing2.todo"] },
        });

        mockExecuteCommand.mockRejectedValue(new Error("File not found"));

        const folderUri = { path: "/workspace/00-ToDo" } as any;
        const handler = createOpenDefaultFileCommand(mockManifest);
        await handler(folderUri);

        const vsCodeOpenCalls = mockExecuteCommand.mock.calls.filter(
            (c: any[]) => c[0] === "vscode.open",
        );
        expect(vsCodeOpenCalls).toHaveLength(2);
    });

    it("should open default file from a non-initialized root using the initialized root's config", async () => {
        const otherRoot = { path: "/other-workspace" } as any;
        mockWorkspaceFolders.push({ uri: workspaceRoot }, { uri: otherRoot });
        // workspaceRoot is initialized, otherRoot is not — but config applies to both.
        mockManifest.findInitializedRoot.mockResolvedValue(workspaceRoot);
        mockManifest.readDefaultFiles.mockResolvedValue({
            "00-ToDo/": { filesToOpen: ["Main.todo"] },
        });

        mockExecuteCommand.mockResolvedValue(undefined);

        const folderUri = { path: "/other-workspace/00-ToDo" } as any;
        const handler = createOpenDefaultFileCommand(mockManifest);
        await handler(folderUri);

        // Config is read from the initialized root.
        expect(mockManifest.readDefaultFiles).toHaveBeenCalledWith(workspaceRoot);
        // File is opened from the owning root, not the initialized root.
        expect(mockExecuteCommand).toHaveBeenCalledWith(
            "vscode.open",
            expect.objectContaining({ path: "/other-workspace/00-ToDo/Main.todo" }),
            expect.anything(),
        );
    });

    it("should prefer root-prefixed key over relative key", async () => {
        mockWorkspaceFolders.push({ uri: workspaceRoot });
        mockManifest.findInitializedRoot.mockResolvedValue(workspaceRoot);
        mockManifest.readDefaultFiles.mockResolvedValue({
            "00-ToDo/": { filesToOpen: ["Main.todo"] },
            "workspace/00-ToDo/": { filesToOpen: ["Work.todo"] },
        });

        mockExecuteCommand.mockResolvedValue(undefined);

        const folderUri = { path: "/workspace/00-ToDo" } as any;
        const handler = createOpenDefaultFileCommand(mockManifest);
        await handler(folderUri);

        // Root-prefixed key "workspace/00-ToDo/" should be used, not "00-ToDo/".
        expect(mockExecuteCommand).toHaveBeenCalledWith(
            "vscode.open",
            expect.objectContaining({ path: "/workspace/00-ToDo/Work.todo" }),
            expect.anything(),
        );
        const vsCodeOpenCalls = mockExecuteCommand.mock.calls.filter(
            (c: any[]) => c[0] === "vscode.open",
        );
        expect(vsCodeOpenCalls).toHaveLength(1);
    });

    it("should use relative key when no root-prefixed key matches", async () => {
        const otherRoot = { path: "/other-workspace" } as any;
        mockWorkspaceFolders.push({ uri: workspaceRoot }, { uri: otherRoot });
        mockManifest.findInitializedRoot.mockResolvedValue(workspaceRoot);
        mockManifest.readDefaultFiles.mockResolvedValue({
            "00-ToDo/": { filesToOpen: ["Main.todo"] },
            "workspace/00-ToDo/": { filesToOpen: ["Work.todo"] },
        });

        mockExecuteCommand.mockResolvedValue(undefined);

        // Right-click in other-workspace — no root-prefixed key for "other-workspace".
        const folderUri = { path: "/other-workspace/00-ToDo" } as any;
        const handler = createOpenDefaultFileCommand(mockManifest);
        await handler(folderUri);

        // Falls back to relative key "00-ToDo/".
        expect(mockExecuteCommand).toHaveBeenCalledWith(
            "vscode.open",
            expect.objectContaining({ path: "/other-workspace/00-ToDo/Main.todo" }),
            expect.anything(),
        );
    });

    it("should not match root-prefixed key from a different root", async () => {
        const otherRoot = { path: "/other-workspace" } as any;
        mockWorkspaceFolders.push({ uri: workspaceRoot }, { uri: otherRoot });
        mockManifest.findInitializedRoot.mockResolvedValue(workspaceRoot);
        // Only a root-prefixed key for "workspace" — no relative fallback.
        mockManifest.readDefaultFiles.mockResolvedValue({
            "workspace/00-ToDo/": { filesToOpen: ["Work.todo"] },
        });

        const folderUri = { path: "/other-workspace/00-ToDo" } as any;
        const handler = createOpenDefaultFileCommand(mockManifest);
        await handler(folderUri);

        // No match for "other-workspace" — should not open anything.
        expect(mockExecuteCommand).not.toHaveBeenCalledWith("vscode.open", expect.anything(), expect.anything());
    });

    it("should open a workspace-absolute file from a different root", async () => {
        const otherRoot = { path: "/other-workspace" } as any;
        mockWorkspaceFolders.push({ uri: workspaceRoot }, { uri: otherRoot });
        mockManifest.findInitializedRoot.mockResolvedValue(workspaceRoot);
        // File path "other-workspace/00-Notes/Index.md" is workspace-absolute — first
        // segment matches the "other-workspace" root name.
        mockManifest.readDefaultFiles.mockResolvedValue({
            "00-ToDo/": { filesToOpen: ["Main.todo", "other-workspace/00-Notes/Index.md"] },
        });

        mockExecuteCommand.mockResolvedValue(undefined);

        const folderUri = { path: "/workspace/00-ToDo" } as any;
        const handler = createOpenDefaultFileCommand(mockManifest);
        await handler(folderUri);

        const vsCodeOpenCalls = mockExecuteCommand.mock.calls.filter(
            (c: any[]) => c[0] === "vscode.open",
        );
        expect(vsCodeOpenCalls).toHaveLength(2);

        // First file is folder-relative → resolved under workspaceRoot/00-ToDo/.
        expect(vsCodeOpenCalls[0][1]).toEqual(
            expect.objectContaining({ path: "/workspace/00-ToDo/Main.todo" }),
        );
        // Second file is workspace-absolute → resolved from "other-workspace" root.
        expect(vsCodeOpenCalls[1][1]).toEqual(
            expect.objectContaining({ path: "/other-workspace/00-Notes/Index.md" }),
        );
    });

    it("should fall back to owning root when workspace-absolute root name is not found", async () => {
        mockWorkspaceFolders.push({ uri: workspaceRoot });
        mockManifest.findInitializedRoot.mockResolvedValue(workspaceRoot);
        // "UnknownRoot" is not a workspace root name, so the path is folder-relative.
        mockManifest.readDefaultFiles.mockResolvedValue({
            "00-ToDo/": { filesToOpen: ["UnknownRoot/Notes.md"] },
        });

        mockExecuteCommand.mockResolvedValue(undefined);

        const folderUri = { path: "/workspace/00-ToDo" } as any;
        const handler = createOpenDefaultFileCommand(mockManifest);
        await handler(folderUri);

        // "UnknownRoot" is not a known root → treated as folder-relative.
        expect(mockExecuteCommand).toHaveBeenCalledWith(
            "vscode.open",
            expect.objectContaining({ path: "/workspace/00-ToDo/UnknownRoot/Notes.md" }),
            expect.anything(),
        );
    });

    it("should not close existing editors when closeCurrentlyOpenedFilesFirst is false", async () => {
        mockWorkspaceFolders.push({ uri: workspaceRoot });
        mockManifest.findInitializedRoot.mockResolvedValue(workspaceRoot);
        mockManifest.readDefaultFiles.mockResolvedValue({
            "00-ToDo/": { filesToOpen: ["Main.todo"], closeCurrentlyOpenedFilesFirst: false },
        });

        mockExecuteCommand.mockResolvedValue(undefined);

        const folderUri = { path: "/workspace/00-ToDo" } as any;
        const handler = createOpenDefaultFileCommand(mockManifest);
        await handler(folderUri);

        expect(mockTabGroupsClose).not.toHaveBeenCalled();
        expect(mockExecuteCommand).toHaveBeenCalledWith(
            "vscode.open",
            expect.objectContaining({ path: "/workspace/00-ToDo/Main.todo" }),
            expect.anything(),
        );
    });

    it("should open all files in active column when openSideBySide is false", async () => {
        mockWorkspaceFolders.push({ uri: workspaceRoot });
        mockManifest.findInitializedRoot.mockResolvedValue(workspaceRoot);
        mockManifest.readDefaultFiles.mockResolvedValue({
            "00-ToDo/": { filesToOpen: ["Main.todo", "Work.todo"], openSideBySide: false },
        });

        mockExecuteCommand.mockResolvedValue(undefined);

        const folderUri = { path: "/workspace/00-ToDo" } as any;
        const handler = createOpenDefaultFileCommand(mockManifest);
        await handler(folderUri);

        const vsCodeOpenCalls = mockExecuteCommand.mock.calls.filter(
            (c: any[]) => c[0] === "vscode.open",
        );
        expect(vsCodeOpenCalls).toHaveLength(2);
        // Both files opened in ViewColumn.Active (-1)
        expect(vsCodeOpenCalls[0][2]).toEqual({ viewColumn: -1, preview: false });
        expect(vsCodeOpenCalls[1][2]).toEqual({ viewColumn: -1, preview: false });
    });
});

describe("promptToSaveDirtyFiles", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockTextDocuments.length = 0;
    });

    it("should return true immediately when no documents are dirty", async () => {
        mockTextDocuments.push({ isDirty: false, uri: { path: "/workspace/clean.ts" } });
        const result = await promptToSaveDirtyFiles();
        expect(result).toBe(true);
        expect(mockShowQuickPick).not.toHaveBeenCalled();
    });

    it("should show a multi-select QuickPick with dirty files", async () => {
        const doc1 = { isDirty: true, uri: { path: "/workspace/a.ts" }, save: vi.fn().mockResolvedValue(true) };
        const doc2 = { isDirty: true, uri: { path: "/workspace/b.ts" }, save: vi.fn().mockResolvedValue(true) };
        mockTextDocuments.push(doc1, doc2);

        // User picks both — all saved.
        mockShowQuickPick.mockImplementation(async (items: any[]) => items);
        const result = await promptToSaveDirtyFiles();

        expect(result).toBe(true);
        expect(mockShowQuickPick).toHaveBeenCalledWith(
            expect.arrayContaining([
                expect.objectContaining({ label: "a.ts", picked: true }),
                expect.objectContaining({ label: "b.ts", picked: true }),
            ]),
            expect.objectContaining({ canPickMany: true }),
        );
    });

    it("should save checked files and revert unchecked files", async () => {
        const doc1 = { isDirty: true, uri: { path: "/workspace/save-me.ts" }, save: vi.fn().mockResolvedValue(true) };
        const doc2 = { isDirty: true, uri: { path: "/workspace/discard-me.ts" }, save: vi.fn().mockResolvedValue(true) };
        mockTextDocuments.push(doc1, doc2);

        // User only picks doc1.
        mockShowQuickPick.mockImplementation(async (items: any[]) =>
            items.filter((i: any) => i.doc === doc1),
        );
        mockShowTextDocument.mockResolvedValue(undefined);
        mockExecuteCommand.mockResolvedValue(undefined);

        const result = await promptToSaveDirtyFiles();
        expect(result).toBe(true);

        // doc1 was saved.
        expect(doc1.save).toHaveBeenCalled();
        // doc2 was NOT saved — it was reverted to clear dirty state.
        expect(doc2.save).not.toHaveBeenCalled();
        expect(mockShowTextDocument).toHaveBeenCalledWith(doc2, { preserveFocus: true, preview: true });
        expect(mockExecuteCommand).toHaveBeenCalledWith("workbench.action.files.revert");
    });

    it("should revert all when user unchecks everything", async () => {
        const doc = { isDirty: true, uri: { path: "/workspace/dirty.ts" }, save: vi.fn() };
        mockTextDocuments.push(doc);

        // User submits with nothing checked.
        mockShowQuickPick.mockResolvedValue([]);
        mockShowTextDocument.mockResolvedValue(undefined);
        mockExecuteCommand.mockResolvedValue(undefined);

        const result = await promptToSaveDirtyFiles();
        expect(result).toBe(true);
        expect(doc.save).not.toHaveBeenCalled();
        expect(mockShowTextDocument).toHaveBeenCalledWith(doc, { preserveFocus: true, preview: true });
        expect(mockExecuteCommand).toHaveBeenCalledWith("workbench.action.files.revert");
    });

    it("should return false when user cancels the QuickPick", async () => {
        const doc = { isDirty: true, uri: { path: "/workspace/dirty.ts" }, save: vi.fn() };
        mockTextDocuments.push(doc);

        // User presses Escape — returns undefined.
        mockShowQuickPick.mockResolvedValue(undefined);

        const result = await promptToSaveDirtyFiles();
        expect(result).toBe(false);
        expect(doc.save).not.toHaveBeenCalled();
        expect(mockExecuteCommand).not.toHaveBeenCalled();
    });

    it("should not show non-dirty documents in the QuickPick", async () => {
        const dirty = { isDirty: true, uri: { path: "/workspace/dirty.ts" }, save: vi.fn().mockResolvedValue(true) };
        const clean = { isDirty: false, uri: { path: "/workspace/clean.ts" }, save: vi.fn() };
        mockTextDocuments.push(dirty, clean);

        mockShowQuickPick.mockImplementation(async (items: any[]) => items);

        await promptToSaveDirtyFiles();

        const items = mockShowQuickPick.mock.calls[0][0];
        expect(items).toHaveLength(1);
        expect(items[0].label).toBe("dirty.ts");
    });
});
