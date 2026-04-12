import { describe, it, expect, vi, beforeEach } from "vitest";
import { createOpenDefaultFileCommand } from "../../../src/commands/openDefaultFile";

const mockWorkspaceFolders: any[] = [];
const mockOpenTextDocument = vi.fn();
const mockShowTextDocument = vi.fn();
const mockExecuteCommand = vi.fn();

vi.mock("vscode", () => ({
    workspace: {
        get workspaceFolders() {
            return mockWorkspaceFolders;
        },
        openTextDocument: (...args: any[]) => mockOpenTextDocument(...args),
    },
    window: {
        showTextDocument: (...args: any[]) => mockShowTextDocument(...args),
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
        expect(mockOpenTextDocument).not.toHaveBeenCalled();
    });

    it("should do nothing when no workspace is open", async () => {
        const handler = createOpenDefaultFileCommand(mockManifest);
        const folderUri = { path: "/workspace/00-ToDo" } as any;
        await handler(folderUri);
        expect(mockManifest.findInitializedRoot).not.toHaveBeenCalled();
        expect(mockOpenTextDocument).not.toHaveBeenCalled();
    });

    it("should do nothing when folder is not under any workspace root", async () => {
        mockWorkspaceFolders.push({ uri: workspaceRoot });

        const handler = createOpenDefaultFileCommand(mockManifest);
        const folderUri = { path: "/unknown/00-ToDo" } as any;
        await handler(folderUri);
        expect(mockManifest.findInitializedRoot).not.toHaveBeenCalled();
        expect(mockOpenTextDocument).not.toHaveBeenCalled();
    });

    it("should do nothing when no initialized root is found", async () => {
        mockWorkspaceFolders.push({ uri: workspaceRoot });
        mockManifest.findInitializedRoot.mockResolvedValue(null);

        const handler = createOpenDefaultFileCommand(mockManifest);
        const folderUri = { path: "/workspace/00-ToDo" } as any;
        await handler(folderUri);
        expect(mockOpenTextDocument).not.toHaveBeenCalled();
    });

    it("should do nothing when default-files.json has no defaultFiles", async () => {
        mockWorkspaceFolders.push({ uri: workspaceRoot });
        mockManifest.findInitializedRoot.mockResolvedValue(workspaceRoot);
        mockManifest.readDefaultFiles.mockResolvedValue(null);

        const handler = createOpenDefaultFileCommand(mockManifest);
        const folderUri = { path: "/workspace/00-ToDo" } as any;
        await handler(folderUri);
        expect(mockOpenTextDocument).not.toHaveBeenCalled();
    });

    it("should open the correct default file when invoked with a folder URI", async () => {
        mockWorkspaceFolders.push({ uri: workspaceRoot });
        mockManifest.findInitializedRoot.mockResolvedValue(workspaceRoot);
        mockManifest.readDefaultFiles.mockResolvedValue({
            "00-ToDo/": ["Main.todo"],
            "01-Notes/": ["Index.md"],
        });

        const fakeDoc = { uri: { path: "/workspace/00-ToDo/Main.todo" } };
        mockOpenTextDocument.mockResolvedValue(fakeDoc);
        mockShowTextDocument.mockResolvedValue(undefined);

        const folderUri = { path: "/workspace/00-ToDo" } as any;
        const handler = createOpenDefaultFileCommand(mockManifest);
        await handler(folderUri);

        expect(mockOpenTextDocument).toHaveBeenCalledWith(
            expect.objectContaining({ path: "/workspace/00-ToDo/Main.todo" })
        );
        expect(mockShowTextDocument).toHaveBeenCalledWith(fakeDoc, { viewColumn: 1, preview: false });
    });

    it("should close all existing editors before opening default files", async () => {
        mockWorkspaceFolders.push({ uri: workspaceRoot });
        mockManifest.findInitializedRoot.mockResolvedValue(workspaceRoot);
        mockManifest.readDefaultFiles.mockResolvedValue({
            "00-ToDo/": ["Main.todo"],
        });

        const fakeDoc = { uri: { path: "/workspace/00-ToDo/Main.todo" } };
        mockOpenTextDocument.mockResolvedValue(fakeDoc);
        mockShowTextDocument.mockResolvedValue(undefined);

        const folderUri = { path: "/workspace/00-ToDo" } as any;
        const handler = createOpenDefaultFileCommand(mockManifest);
        await handler(folderUri);

        expect(mockExecuteCommand).toHaveBeenCalledWith("workbench.action.closeAllEditors");
        // closeAllEditors must be called before openTextDocument.
        const closeOrder = mockExecuteCommand.mock.invocationCallOrder[0];
        const openOrder = mockOpenTextDocument.mock.invocationCallOrder[0];
        expect(closeOrder).toBeLessThan(openOrder);
    });

    it("should open a different folder's default file based on folder URI", async () => {
        mockWorkspaceFolders.push({ uri: workspaceRoot });
        mockManifest.findInitializedRoot.mockResolvedValue(workspaceRoot);
        mockManifest.readDefaultFiles.mockResolvedValue({
            "00-ToDo/": ["Main.todo"],
            "01-Notes/": ["Index.md"],
        });

        const fakeDoc = { uri: { path: "/workspace/01-Notes/Index.md" } };
        mockOpenTextDocument.mockResolvedValue(fakeDoc);
        mockShowTextDocument.mockResolvedValue(undefined);

        const folderUri = { path: "/workspace/01-Notes" } as any;
        const handler = createOpenDefaultFileCommand(mockManifest);
        await handler(folderUri);

        expect(mockOpenTextDocument).toHaveBeenCalledWith(
            expect.objectContaining({ path: "/workspace/01-Notes/Index.md" })
        );
    });

    it("should open multiple files side by side with incrementing ViewColumn", async () => {
        mockWorkspaceFolders.push({ uri: workspaceRoot });
        mockManifest.findInitializedRoot.mockResolvedValue(workspaceRoot);
        mockManifest.readDefaultFiles.mockResolvedValue({
            "00-ToDo/": ["Main.todo", "Work.todo"],
        });

        const fakeDoc1 = { uri: { path: "/workspace/00-ToDo/Main.todo" } };
        const fakeDoc2 = { uri: { path: "/workspace/00-ToDo/Work.todo" } };
        mockOpenTextDocument
            .mockResolvedValueOnce(fakeDoc1)
            .mockResolvedValueOnce(fakeDoc2);
        mockShowTextDocument.mockResolvedValue(undefined);

        const folderUri = { path: "/workspace/00-ToDo" } as any;
        const handler = createOpenDefaultFileCommand(mockManifest);
        await handler(folderUri);

        expect(mockOpenTextDocument).toHaveBeenCalledTimes(2);
        expect(mockShowTextDocument).toHaveBeenCalledTimes(2);
        expect(mockShowTextDocument).toHaveBeenNthCalledWith(1, fakeDoc1, { viewColumn: 1, preview: false });
        expect(mockShowTextDocument).toHaveBeenNthCalledWith(2, fakeDoc2, { viewColumn: 2, preview: false });
    });

    it("should skip missing files and open the rest", async () => {
        mockWorkspaceFolders.push({ uri: workspaceRoot });
        mockManifest.findInitializedRoot.mockResolvedValue(workspaceRoot);
        mockManifest.readDefaultFiles.mockResolvedValue({
            "00-ToDo/": ["Missing.todo", "Main.todo"],
        });

        const fakeDoc = { uri: { path: "/workspace/00-ToDo/Main.todo" } };
        mockOpenTextDocument
            .mockRejectedValueOnce(new Error("File not found"))
            .mockResolvedValueOnce(fakeDoc);
        mockShowTextDocument.mockResolvedValue(undefined);

        const folderUri = { path: "/workspace/00-ToDo" } as any;
        const handler = createOpenDefaultFileCommand(mockManifest);
        await handler(folderUri);

        expect(mockOpenTextDocument).toHaveBeenCalledTimes(2);
        expect(mockShowTextDocument).toHaveBeenCalledTimes(1);
        expect(mockShowTextDocument).toHaveBeenCalledWith(fakeDoc, { viewColumn: 1, preview: false });
    });

    it("should do nothing when all files are missing", async () => {
        mockWorkspaceFolders.push({ uri: workspaceRoot });
        mockManifest.findInitializedRoot.mockResolvedValue(workspaceRoot);
        mockManifest.readDefaultFiles.mockResolvedValue({
            "00-ToDo/": ["Missing1.todo", "Missing2.todo"],
        });

        mockOpenTextDocument.mockRejectedValue(new Error("File not found"));

        const folderUri = { path: "/workspace/00-ToDo" } as any;
        const handler = createOpenDefaultFileCommand(mockManifest);
        await handler(folderUri);

        expect(mockOpenTextDocument).toHaveBeenCalledTimes(2);
        expect(mockShowTextDocument).not.toHaveBeenCalled();
    });

    it("should open default file from a non-initialized root using the initialized root's config", async () => {
        const otherRoot = { path: "/other-workspace" } as any;
        mockWorkspaceFolders.push({ uri: workspaceRoot }, { uri: otherRoot });
        // workspaceRoot is initialized, otherRoot is not — but config applies to both.
        mockManifest.findInitializedRoot.mockResolvedValue(workspaceRoot);
        mockManifest.readDefaultFiles.mockResolvedValue({
            "00-ToDo/": ["Main.todo"],
        });

        const fakeDoc = { uri: { path: "/other-workspace/00-ToDo/Main.todo" } };
        mockOpenTextDocument.mockResolvedValue(fakeDoc);
        mockShowTextDocument.mockResolvedValue(undefined);

        const folderUri = { path: "/other-workspace/00-ToDo" } as any;
        const handler = createOpenDefaultFileCommand(mockManifest);
        await handler(folderUri);

        // Config is read from the initialized root.
        expect(mockManifest.readDefaultFiles).toHaveBeenCalledWith(workspaceRoot);
        // File is opened from the owning root, not the initialized root.
        expect(mockOpenTextDocument).toHaveBeenCalledWith(
            expect.objectContaining({ path: "/other-workspace/00-ToDo/Main.todo" })
        );
    });

    it("should prefer root-prefixed key over relative key", async () => {
        mockWorkspaceFolders.push({ uri: workspaceRoot });
        mockManifest.findInitializedRoot.mockResolvedValue(workspaceRoot);
        mockManifest.readDefaultFiles.mockResolvedValue({
            "00-ToDo/": ["Main.todo"],
            "workspace/00-ToDo/": ["Work.todo"],
        });

        const fakeDoc = { uri: { path: "/workspace/00-ToDo/Work.todo" } };
        mockOpenTextDocument.mockResolvedValue(fakeDoc);
        mockShowTextDocument.mockResolvedValue(undefined);

        const folderUri = { path: "/workspace/00-ToDo" } as any;
        const handler = createOpenDefaultFileCommand(mockManifest);
        await handler(folderUri);

        // Root-prefixed key "workspace/00-ToDo/" should be used, not "00-ToDo/".
        expect(mockOpenTextDocument).toHaveBeenCalledWith(
            expect.objectContaining({ path: "/workspace/00-ToDo/Work.todo" })
        );
        expect(mockOpenTextDocument).toHaveBeenCalledTimes(1);
    });

    it("should use relative key when no root-prefixed key matches", async () => {
        const otherRoot = { path: "/other-workspace" } as any;
        mockWorkspaceFolders.push({ uri: workspaceRoot }, { uri: otherRoot });
        mockManifest.findInitializedRoot.mockResolvedValue(workspaceRoot);
        mockManifest.readDefaultFiles.mockResolvedValue({
            "00-ToDo/": ["Main.todo"],
            "workspace/00-ToDo/": ["Work.todo"],
        });

        const fakeDoc = { uri: { path: "/other-workspace/00-ToDo/Main.todo" } };
        mockOpenTextDocument.mockResolvedValue(fakeDoc);
        mockShowTextDocument.mockResolvedValue(undefined);

        // Right-click in other-workspace — no root-prefixed key for "other-workspace".
        const folderUri = { path: "/other-workspace/00-ToDo" } as any;
        const handler = createOpenDefaultFileCommand(mockManifest);
        await handler(folderUri);

        // Falls back to relative key "00-ToDo/".
        expect(mockOpenTextDocument).toHaveBeenCalledWith(
            expect.objectContaining({ path: "/other-workspace/00-ToDo/Main.todo" })
        );
    });

    it("should not match root-prefixed key from a different root", async () => {
        const otherRoot = { path: "/other-workspace" } as any;
        mockWorkspaceFolders.push({ uri: workspaceRoot }, { uri: otherRoot });
        mockManifest.findInitializedRoot.mockResolvedValue(workspaceRoot);
        // Only a root-prefixed key for "workspace" — no relative fallback.
        mockManifest.readDefaultFiles.mockResolvedValue({
            "workspace/00-ToDo/": ["Work.todo"],
        });

        const folderUri = { path: "/other-workspace/00-ToDo" } as any;
        const handler = createOpenDefaultFileCommand(mockManifest);
        await handler(folderUri);

        // No match for "other-workspace" — should not open anything.
        expect(mockOpenTextDocument).not.toHaveBeenCalled();
    });
});
