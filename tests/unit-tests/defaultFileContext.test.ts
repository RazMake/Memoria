import { describe, it, expect, vi, beforeEach } from "vitest";

const mockExecuteCommand = vi.fn().mockResolvedValue(undefined);
const mockStat = vi.fn();
const mockReadDirectory = vi.fn();
const mockWatcherDispose = vi.fn();
const mockOnDidCreate = vi.fn();
const mockOnDidDelete = vi.fn();
const mockOnDidChange = vi.fn();
const mockCreateFileSystemWatcher = vi.fn(() => ({
    onDidCreate: mockOnDidCreate,
    onDidDelete: mockOnDidDelete,
    onDidChange: mockOnDidChange,
    dispose: mockWatcherDispose,
}));

vi.mock("vscode", () => ({
    commands: {
        executeCommand: (...args: any[]) => mockExecuteCommand(...args),
    },
    workspace: {
        createFileSystemWatcher: (...args: any[]) => mockCreateFileSystemWatcher(...args),
        fs: {
            stat: (...args: any[]) => mockStat(...args),
            readDirectory: (...args: any[]) => mockReadDirectory(...args),
        },
    },
    Uri: {
        joinPath: vi.fn((base: any, ...segments: string[]) => ({
            ...base,
            path: [base.path, ...segments.filter(Boolean)].join("/"),
            toString() { return this.path; },
        })),
    },
    RelativePattern: class {
        constructor(public base: any, public pattern: string) {}
    },
    FileType: { Directory: 2, File: 1 },
    Disposable: { from: (...args: any[]) => ({ dispose: vi.fn() }) },
}));

vi.mock("../../src/blueprints/workspaceUtils", async () => {
    const actual = await vi.importActual<typeof import("../../src/blueprints/workspaceUtils")>("../../src/blueprints/workspaceUtils");
    return actual;
});

import { updateDefaultFileContext, registerDefaultFileWatcher, type DefaultFileWatcherHolder } from "../../src/defaultFileContext";

function makeUri(path: string) {
    return { path, toString() { return this.path; } } as any;
}

function makeManifest(defaultFiles: Record<string, { filesToOpen: string[] }> | null = null) {
    return {
        readDefaultFiles: vi.fn().mockResolvedValue(defaultFiles),
        findInitializedRoot: vi.fn(),
    } as any;
}

describe("updateDefaultFileContext", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockReadDirectory.mockRejectedValue(new Error("not found"));
    });

    it("should set context key to false when initializedRoot is null", async () => {
        const manifest = makeManifest();

        await updateDefaultFileContext(null, [makeUri("/workspace")], manifest);

        expect(mockExecuteCommand).toHaveBeenCalledWith("setContext", "memoria.defaultFileAvailable", false);
        expect(mockExecuteCommand).toHaveBeenCalledWith("setContext", "memoria.defaultFileFolders", {});
    });

    it("should set context key to false when readDefaultFiles returns null", async () => {
        const root = makeUri("/workspace");
        const manifest = makeManifest(null);

        await updateDefaultFileContext(root, [root], manifest);

        expect(mockExecuteCommand).toHaveBeenCalledWith("setContext", "memoria.defaultFileAvailable", false);
        expect(mockExecuteCommand).toHaveBeenCalledWith("setContext", "memoria.defaultFileFolders", {});
    });

    it("should set context key to false when default files config is empty", async () => {
        const root = makeUri("/workspace");
        const manifest = makeManifest({});

        await updateDefaultFileContext(root, [root], manifest);

        expect(mockExecuteCommand).toHaveBeenCalledWith("setContext", "memoria.defaultFileAvailable", false);
    });

    it("should set context key to true when a folder has a matching default file", async () => {
        const root = makeUri("/workspace");
        const manifest = makeManifest({
            "00-ToDo/": { filesToOpen: ["Main.todo"] },
        });
        mockStat.mockResolvedValue({ type: 1 });
        mockReadDirectory.mockRejectedValue(new Error("not found"));

        await updateDefaultFileContext(root, [root], manifest);

        expect(mockExecuteCommand).toHaveBeenCalledWith("setContext", "memoria.defaultFileAvailable", true);
        expect(mockExecuteCommand).toHaveBeenCalledWith(
            "setContext",
            "memoria.defaultFileFolders",
            expect.objectContaining({ "/workspace/00-ToDo": true }),
        );
    });

    it("should set context key to false when file does not exist on disk", async () => {
        const root = makeUri("/workspace");
        const manifest = makeManifest({
            "00-ToDo/": { filesToOpen: ["Main.todo"] },
        });
        mockStat.mockRejectedValue(new Error("not found"));

        await updateDefaultFileContext(root, [root], manifest);

        expect(mockExecuteCommand).toHaveBeenCalledWith("setContext", "memoria.defaultFileAvailable", false);
        expect(mockExecuteCommand).toHaveBeenCalledWith("setContext", "memoria.defaultFileFolders", {});
    });

    it("should check multiple filesToOpen entries and succeed on second match", async () => {
        const root = makeUri("/workspace");
        const manifest = makeManifest({
            "notes/": { filesToOpen: ["Index.md", "README.md"] },
        });
        mockStat
            .mockRejectedValueOnce(new Error("not found")) // Index.md missing
            .mockResolvedValueOnce({ type: 1 });            // README.md exists
        mockReadDirectory.mockRejectedValue(new Error("not found"));

        await updateDefaultFileContext(root, [root], manifest);

        expect(mockExecuteCommand).toHaveBeenCalledWith("setContext", "memoria.defaultFileAvailable", true);
    });

    it("should handle multi-root workspace with files in different roots", async () => {
        const rootA = makeUri("/rootA");
        const rootB = makeUri("/rootB");
        const manifest = makeManifest({
            "docs/": { filesToOpen: ["Index.md"] },
        });
        // rootA/docs/Index.md does not exist, rootB/docs/Index.md exists
        mockStat
            .mockRejectedValueOnce(new Error("not found"))
            .mockResolvedValueOnce({ type: 1 });
        mockReadDirectory.mockRejectedValue(new Error("not found"));

        await updateDefaultFileContext(rootA, [rootA, rootB], manifest);

        expect(mockExecuteCommand).toHaveBeenCalledWith("setContext", "memoria.defaultFileAvailable", true);
        const folderLookupCall = mockExecuteCommand.mock.calls.find(
            (c: any[]) => c[1] === "memoria.defaultFileFolders"
        );
        expect(folderLookupCall).toBeDefined();
        expect(folderLookupCall![2]).toHaveProperty("/rootB/docs", true);
    });

    it("should handle root-specific key matching only the named root", async () => {
        const rootA = makeUri("/rootA");
        const rootB = makeUri("/rootB");
        const manifest = makeManifest({
            "rootA/docs/": { filesToOpen: ["Index.md"] },
        });
        mockStat.mockResolvedValue({ type: 1 });
        mockReadDirectory.mockRejectedValue(new Error("not found"));

        await updateDefaultFileContext(rootA, [rootA, rootB], manifest);

        expect(mockExecuteCommand).toHaveBeenCalledWith("setContext", "memoria.defaultFileAvailable", true);
        // rootB should NOT have the folder in the lookup
        const folderLookupCall = mockExecuteCommand.mock.calls.find(
            (c: any[]) => c[1] === "memoria.defaultFileFolders"
        );
        expect(folderLookupCall![2]).toHaveProperty("/rootA/docs", true);
        expect(folderLookupCall![2]).not.toHaveProperty("/rootB/docs");
    });

    it("should include compact chain descendants in folder lookup", async () => {
        const root = makeUri("/workspace");
        const manifest = makeManifest({
            "parent/": { filesToOpen: ["file.md"] },
        });
        mockStat.mockResolvedValue({ type: 1 });
        // parent has single subfolder "child" — compact chain
        mockReadDirectory.mockResolvedValueOnce([["child", 2]]);
        // child has no subfolders
        mockReadDirectory.mockResolvedValueOnce([["file.txt", 1]]);

        await updateDefaultFileContext(root, [root], manifest);

        const folderLookupCall = mockExecuteCommand.mock.calls.find(
            (c: any[]) => c[1] === "memoria.defaultFileFolders"
        );
        expect(folderLookupCall![2]).toHaveProperty("/workspace/parent", true);
        expect(folderLookupCall![2]).toHaveProperty("/workspace/parent/child", true);
    });

    it("should not include compact chain descendant when folder has multiple subfolders", async () => {
        const root = makeUri("/workspace");
        const manifest = makeManifest({
            "parent/": { filesToOpen: ["file.md"] },
        });
        mockStat.mockResolvedValue({ type: 1 });
        // parent has two subfolders — not a compact chain
        mockReadDirectory.mockResolvedValueOnce([["child1", 2], ["child2", 2]]);

        await updateDefaultFileContext(root, [root], manifest);

        const folderLookupCall = mockExecuteCommand.mock.calls.find(
            (c: any[]) => c[1] === "memoria.defaultFileFolders"
        );
        expect(folderLookupCall![2]).toHaveProperty("/workspace/parent", true);
        expect(folderLookupCall![2]).not.toHaveProperty("/workspace/parent/child1");
        expect(folderLookupCall![2]).not.toHaveProperty("/workspace/parent/child2");
    });

    it("should handle workspace-absolute file paths in filesToOpen", async () => {
        const rootA = makeUri("/rootA");
        const rootB = makeUri("/rootB");
        const manifest = makeManifest({
            "docs/": { filesToOpen: ["rootB/shared/file.md"] },
        });
        mockStat.mockResolvedValue({ type: 1 });
        mockReadDirectory.mockRejectedValue(new Error("not found"));

        await updateDefaultFileContext(rootA, [rootA, rootB], manifest);

        expect(mockExecuteCommand).toHaveBeenCalledWith("setContext", "memoria.defaultFileAvailable", true);
        // stat should have been called with a URI under rootB
        expect(mockStat).toHaveBeenCalledWith(
            expect.objectContaining({ path: expect.stringContaining("/rootB/shared/file.md") }),
        );
    });
});

describe("registerDefaultFileWatcher", () => {
    let mockContext: any;

    beforeEach(() => {
        vi.clearAllMocks();
        mockContext = {
            subscriptions: [],
        };
    });

    it("should do nothing when initializedRoot is null", () => {
        const holder: DefaultFileWatcherHolder = { current: undefined };

        registerDefaultFileWatcher(mockContext, null, [], makeManifest(), holder);

        expect(mockCreateFileSystemWatcher).not.toHaveBeenCalled();
        expect(holder.current).toBeUndefined();
    });

    it("should dispose previous watcher when re-registering", () => {
        const previousDispose = vi.fn();
        const holder: DefaultFileWatcherHolder = { current: { dispose: previousDispose } };

        registerDefaultFileWatcher(mockContext, null, [], makeManifest(), holder);

        expect(previousDispose).toHaveBeenCalledOnce();
        expect(holder.current).toBeUndefined();
    });

    it("should create a file system watcher for the config file", () => {
        const root = makeUri("/workspace");
        const holder: DefaultFileWatcherHolder = { current: undefined };

        registerDefaultFileWatcher(mockContext, root, [root], makeManifest(), holder);

        expect(mockCreateFileSystemWatcher).toHaveBeenCalledWith(
            expect.objectContaining({ pattern: ".memoria/default-files.json" }),
        );
    });

    it("should push the config watcher into context subscriptions", () => {
        const root = makeUri("/workspace");
        const holder: DefaultFileWatcherHolder = { current: undefined };

        registerDefaultFileWatcher(mockContext, root, [root], makeManifest(), holder);

        expect(mockContext.subscriptions.length).toBeGreaterThan(0);
    });

    it("should set holder.current to a disposable", () => {
        const root = makeUri("/workspace");
        const holder: DefaultFileWatcherHolder = { current: undefined };

        registerDefaultFileWatcher(mockContext, root, [root], makeManifest(), holder);

        expect(holder.current).toBeDefined();
        expect(holder.current!.dispose).toBeDefined();
    });
});
