import { describe, it, expect, vi, beforeEach } from "vitest";
import { FileScaffold } from "../../../src/blueprints/fileScaffold";
import type { WorkspaceEntry } from "../../../src/blueprints/types";

const mockCreateDirectory = vi.fn();
const mockWriteFile = vi.fn();
const mockStat = vi.fn();
const mockRename = vi.fn();
const mockJoinPath = vi.fn((base: any, ...segments: string[]) => {
    const cleanSegments = segments.map((s) => s.replace(/\/$/, ""));
    return { path: [base.path, ...cleanSegments].join("/") };
});

vi.mock("vscode", () => ({
    workspace: {
        fs: {
            createDirectory: (...args: any[]) => mockCreateDirectory(...args),
            writeFile: (...args: any[]) => mockWriteFile(...args),
            stat: (...args: any[]) => mockStat(...args),
            rename: (...args: any[]) => mockRename(...args),
        },
    },
    Uri: {
        joinPath: (...args: any[]) => mockJoinPath(...args),
    },
    FileType: {
        File: 1,
        Directory: 2,
    },
}));

const mockFs = {
    createDirectory: (...args: any[]) => mockCreateDirectory(...args),
    writeFile: (...args: any[]) => mockWriteFile(...args),
    stat: (...args: any[]) => mockStat(...args),
    rename: (...args: any[]) => mockRename(...args),
} as any;

const rootUri = { path: "/workspace" } as any;
const noSeedContent = async (_path: string) => null;

describe("FileScaffold", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockCreateDirectory.mockResolvedValue(undefined);
        mockWriteFile.mockResolvedValue(undefined);
        mockStat.mockRejectedValue(new Error("FileNotFound"));
        mockRename.mockResolvedValue(undefined);
    });

    describe("scaffoldTree", () => {
        it("should create a directory for each folder entry", async () => {
            const entries: WorkspaceEntry[] = [{ name: "Folder/", isFolder: true }];
            const scaffold = new FileScaffold(mockFs);
            await scaffold.scaffoldTree(rootUri, entries, noSeedContent);
            expect(mockCreateDirectory).toHaveBeenCalledOnce();
        });

        it("should create a file for each file entry", async () => {
            const entries: WorkspaceEntry[] = [{ name: "file.md", isFolder: false }];
            const scaffold = new FileScaffold(mockFs);
            await scaffold.scaffoldTree(rootUri, entries, noSeedContent);
            expect(mockWriteFile).toHaveBeenCalledOnce();
        });

        it("should write seed content when provided by the callback", async () => {
            const seedContent = new TextEncoder().encode("# Seed");
            const entries: WorkspaceEntry[] = [{ name: "file.md", isFolder: false }];
            const scaffold = new FileScaffold(mockFs);
            await scaffold.scaffoldTree(rootUri, entries, async () => seedContent);
            expect(mockWriteFile.mock.calls[0][1]).toEqual(seedContent);
        });

        it("should write an empty file when seed content is null", async () => {
            const entries: WorkspaceEntry[] = [{ name: "empty.md", isFolder: false }];
            const scaffold = new FileScaffold(mockFs);
            await scaffold.scaffoldTree(rootUri, entries, noSeedContent);
            expect(mockWriteFile.mock.calls[0][1]).toEqual(new Uint8Array(0));
        });

        it("should recursively create children inside a folder", async () => {
            const entries: WorkspaceEntry[] = [
                {
                    name: "Parent/",
                    isFolder: true,
                    children: [{ name: "child.md", isFolder: false }],
                },
            ];
            const scaffold = new FileScaffold(mockFs);
            await scaffold.scaffoldTree(rootUri, entries, noSeedContent);
            expect(mockCreateDirectory).toHaveBeenCalledOnce();
            expect(mockWriteFile).toHaveBeenCalledOnce();
        });

        it("should return a manifest with forward-slash paths and sha256 hashes for created files", async () => {
            const entries: WorkspaceEntry[] = [{ name: "file.md", isFolder: false }];
            const scaffold = new FileScaffold(mockFs);
            const { fileManifest } = await scaffold.scaffoldTree(rootUri, entries, noSeedContent);
            const keys = Object.keys(fileManifest);
            expect(keys).toHaveLength(1);
            expect(keys[0]).not.toContain("\\");
            expect(fileManifest[keys[0]]).toMatch(/^sha256:[0-9a-f]{64}$/);
        });

        it("should not include folder entries in the returned manifest", async () => {
            const entries: WorkspaceEntry[] = [
                { name: "Folder/", isFolder: true },
                { name: "file.md", isFolder: false },
            ];
            const scaffold = new FileScaffold(mockFs);
            const { fileManifest } = await scaffold.scaffoldTree(rootUri, entries, noSeedContent);
            const keys = Object.keys(fileManifest);
            expect(keys).toHaveLength(1);
            expect(keys[0]).not.toContain("Folder/");
        });

        it("should return an empty fileManifest when no file entries exist", async () => {
            const scaffold = new FileScaffold(mockFs);
            const result = await scaffold.scaffoldTree(rootUri, [], noSeedContent);
            expect(result.fileManifest).toEqual({});
        });
    });

    describe("folder-file collision", () => {
        it("should back up a file obstructing a folder path and then create the folder", async () => {
            mockStat.mockResolvedValueOnce({ type: 1 }); // FileType.File

            const entries: WorkspaceEntry[] = [{ name: "Folder/", isFolder: true }];
            const scaffold = new FileScaffold(mockFs);
            await scaffold.scaffoldTree(rootUri, entries, noSeedContent);

            expect(mockCreateDirectory).toHaveBeenCalledTimes(2);
            expect(mockCreateDirectory).toHaveBeenNthCalledWith(1, { path: "/workspace/WorkspaceInitializationBackups" });
            expect(mockRename).toHaveBeenCalledWith(
                { path: "/workspace/Folder" },
                { path: "/workspace/WorkspaceInitializationBackups/Folder" },
                { overwrite: false }
            );
            expect(mockCreateDirectory).toHaveBeenNthCalledWith(2, { path: "/workspace/Folder" });
        });

        it("should not back up when no entry exists at the folder path", async () => {
            // mockStat already rejects by default — simulates path not found.
            const entries: WorkspaceEntry[] = [{ name: "Folder/", isFolder: true }];
            const scaffold = new FileScaffold(mockFs);
            await scaffold.scaffoldTree(rootUri, entries, noSeedContent);

            expect(mockRename).not.toHaveBeenCalled();
            expect(mockCreateDirectory).toHaveBeenCalledOnce();
        });

        it("should not back up when a directory already exists at the folder path", async () => {
            mockStat.mockResolvedValueOnce({ type: 2 }); // FileType.Directory

            const entries: WorkspaceEntry[] = [{ name: "Folder/", isFolder: true }];
            const scaffold = new FileScaffold(mockFs);
            await scaffold.scaffoldTree(rootUri, entries, noSeedContent);

            expect(mockRename).not.toHaveBeenCalled();
            expect(mockCreateDirectory).toHaveBeenCalledOnce();
        });
    });

    describe("path validation", () => {
        it("should throw when an entry name contains a path traversal segment (..)", async () => {
            const entries: WorkspaceEntry[] = [{ name: "../outside.md", isFolder: false }];
            const scaffold = new FileScaffold(mockFs);
            await expect(scaffold.scaffoldTree(rootUri, entries, noSeedContent)).rejects.toThrow("..");
        });

        it("should throw when a nested path would escape the workspace root", async () => {
            // Simulate joinPath producing a path outside the root (e.g. symlink or tricky blueprint).
            mockJoinPath.mockReturnValueOnce({ path: "/outside/file.md" });
            const entries: WorkspaceEntry[] = [{ name: "file.md", isFolder: false }];
            const scaffold = new FileScaffold(mockFs);
            await expect(scaffold.scaffoldTree(rootUri, entries, noSeedContent)).rejects.toThrow(
                "outside workspace root"
            );
        });
    });
});
