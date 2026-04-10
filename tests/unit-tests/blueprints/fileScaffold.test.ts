import { describe, it, expect, vi, beforeEach } from "vitest";
import { FileScaffold } from "../../../src/blueprints/fileScaffold";
import type { WorkspaceEntry } from "../../../src/blueprints/types";

const mockCreateDirectory = vi.fn();
const mockWriteFile = vi.fn();
const mockJoinPath = vi.fn((base: any, ...segments: string[]) => {
    const cleanSegments = segments.map((s) => s.replace(/\/$/, ""));
    return { path: [base.path, ...cleanSegments].join("/") };
});

vi.mock("vscode", () => ({
    workspace: {
        fs: {
            createDirectory: (...args: any[]) => mockCreateDirectory(...args),
            writeFile: (...args: any[]) => mockWriteFile(...args),
        },
    },
    Uri: {
        joinPath: (...args: any[]) => mockJoinPath(...args),
    },
}));

const mockFs = {
    createDirectory: (...args: any[]) => mockCreateDirectory(...args),
    writeFile: (...args: any[]) => mockWriteFile(...args),
} as any;

const rootUri = { path: "/workspace" } as any;
const noSeedContent = async (_path: string) => null;

describe("FileScaffold", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockCreateDirectory.mockResolvedValue(undefined);
        mockWriteFile.mockResolvedValue(undefined);
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
            const manifest = await scaffold.scaffoldTree(rootUri, entries, noSeedContent);
            const keys = Object.keys(manifest);
            expect(keys).toHaveLength(1);
            expect(keys[0]).not.toContain("\\");
            expect(manifest[keys[0]]).toMatch(/^sha256:[0-9a-f]{64}$/);
        });

        it("should not include folder entries in the returned manifest", async () => {
            const entries: WorkspaceEntry[] = [
                { name: "Folder/", isFolder: true },
                { name: "file.md", isFolder: false },
            ];
            const scaffold = new FileScaffold(mockFs);
            const manifest = await scaffold.scaffoldTree(rootUri, entries, noSeedContent);
            const keys = Object.keys(manifest);
            expect(keys).toHaveLength(1);
            expect(keys[0]).not.toContain("Folder/");
        });

        it("should return an empty manifest when no file entries exist", async () => {
            const scaffold = new FileScaffold(mockFs);
            const manifest = await scaffold.scaffoldTree(rootUri, [], noSeedContent);
            expect(manifest).toEqual({});
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
