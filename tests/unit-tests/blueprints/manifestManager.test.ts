import { describe, it, expect, vi, beforeEach } from "vitest";
import { ManifestManager } from "../../../src/blueprints/manifestManager";
import type { BlueprintManifest, DecorationsConfig, DotfoldersConfig } from "../../../src/blueprints/types";

const mockStat = vi.fn();
const mockReadFile = vi.fn();
const mockWriteFile = vi.fn();
const mockCreateDirectory = vi.fn();
const mockDelete = vi.fn();
const mockJoinPath = vi.fn((base: any, ...segments: string[]) => ({
    ...base,
    path: [base.path, ...segments].join("/"),
}));

vi.mock("vscode", () => ({
    workspace: {
        fs: {
            stat: (...args: any[]) => mockStat(...args),
            readFile: (...args: any[]) => mockReadFile(...args),
            writeFile: (...args: any[]) => mockWriteFile(...args),
            createDirectory: (...args: any[]) => mockCreateDirectory(...args),
            delete: (...args: any[]) => mockDelete(...args),
        },
    },
    Uri: {
        joinPath: (...args: any[]) => mockJoinPath(...args),
    },
}));

const encoder = new TextEncoder();
const workspaceRoot = { path: "/workspace" } as any;

const mockFs = {
    stat: (...args: any[]) => mockStat(...args),
    readFile: (...args: any[]) => mockReadFile(...args),
    writeFile: (...args: any[]) => mockWriteFile(...args),
    createDirectory: (...args: any[]) => mockCreateDirectory(...args),
    delete: (...args: any[]) => mockDelete(...args),
} as any;

describe("ManifestManager", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockCreateDirectory.mockResolvedValue(undefined);
        mockWriteFile.mockResolvedValue(undefined);
    });

    describe("computeFileHash", () => {
        it("should return a sha256: prefixed lowercase hex hash", () => {
            const manager = new ManifestManager(mockFs);
            const hash = manager.computeFileHash(encoder.encode("hello"));
            expect(hash).toMatch(/^sha256:[0-9a-f]{64}$/);
        });

        it("should return consistent hashes for the same content", () => {
            const manager = new ManifestManager(mockFs);
            const a = manager.computeFileHash(encoder.encode("same"));
            const b = manager.computeFileHash(encoder.encode("same"));
            expect(a).toBe(b);
        });

        it("should return different hashes for different content", () => {
            const manager = new ManifestManager(mockFs);
            const a = manager.computeFileHash(encoder.encode("abc"));
            const b = manager.computeFileHash(encoder.encode("xyz"));
            expect(a).not.toBe(b);
        });

        it("should return a lowercase hex hash (no uppercase letters)", () => {
            const manager = new ManifestManager(mockFs);
            const hash = manager.computeFileHash(encoder.encode("test content"));
            expect(hash).toBe(hash.toLowerCase());
        });
    });

    describe("isInitialized", () => {
        it("should return true when blueprint.json exists", async () => {
            mockStat.mockResolvedValue({});
            const manager = new ManifestManager(mockFs);
            expect(await manager.isInitialized(workspaceRoot)).toBe(true);
        });

        it("should return false when blueprint.json does not exist", async () => {
            mockStat.mockRejectedValue(new Error("not found"));
            const manager = new ManifestManager(mockFs);
            expect(await manager.isInitialized(workspaceRoot)).toBe(false);
        });
    });

    describe("readManifest / writeManifest", () => {
        const manifest: BlueprintManifest = {
            blueprintId: "individual-contributor",
            blueprintVersion: "1.0.0",
            initializedAt: "2026-04-10T00:00:00Z",
            lastReinitAt: null,
            fileManifest: { "Folder/file.md": "sha256:abc123" },
        };

        it("should return null when blueprint.json is not found", async () => {
            mockReadFile.mockRejectedValue(new Error("not found"));
            const manager = new ManifestManager(mockFs);
            expect(await manager.readManifest(workspaceRoot)).toBeNull();
        });

        it("should return parsed manifest when blueprint.json exists", async () => {
            mockReadFile.mockResolvedValue(encoder.encode(JSON.stringify(manifest)));
            const manager = new ManifestManager(mockFs);
            expect(await manager.readManifest(workspaceRoot)).toEqual(manifest);
        });

        it("should create .memoria/ directory before writing the manifest", async () => {
            const manager = new ManifestManager(mockFs);
            await manager.writeManifest(workspaceRoot, manifest);
            expect(mockCreateDirectory).toHaveBeenCalledOnce();
        });

        it("should write serialized JSON to blueprint.json", async () => {
            const manager = new ManifestManager(mockFs);
            await manager.writeManifest(workspaceRoot, manifest);
            const written = JSON.parse(new TextDecoder().decode(mockWriteFile.mock.calls[0][1]));
            expect(written).toEqual(manifest);
        });
    });

    describe("readDecorations / writeDecorations", () => {
        const config: DecorationsConfig = { rules: [{ filter: "Folder/", color: "charts.green" }] };

        it("should return null when decorations.json is not found", async () => {
            mockReadFile.mockRejectedValue(new Error("not found"));
            const manager = new ManifestManager(mockFs);
            expect(await manager.readDecorations(workspaceRoot)).toBeNull();
        });

        it("should write decorations config to decorations.json", async () => {
            const manager = new ManifestManager(mockFs);
            await manager.writeDecorations(workspaceRoot, config);
            expect(mockCreateDirectory).toHaveBeenCalledOnce();
            const written = JSON.parse(new TextDecoder().decode(mockWriteFile.mock.calls[0][1]));
            expect(written).toEqual(config);
        });
    });

    describe("readDotfolders / writeDotfolders", () => {
        const config: DotfoldersConfig = { managedEntries: [".git", ".vscode"] };

        it("should return null when dotfolders.json is not found", async () => {
            mockReadFile.mockRejectedValue(new Error("not found"));
            const manager = new ManifestManager(mockFs);
            expect(await manager.readDotfolders(workspaceRoot)).toBeNull();
        });

        it("should write dotfolders config to dotfolders.json", async () => {
            const manager = new ManifestManager(mockFs);
            await manager.writeDotfolders(workspaceRoot, config);
            expect(mockCreateDirectory).toHaveBeenCalledOnce();
            const written = JSON.parse(new TextDecoder().decode(mockWriteFile.mock.calls[0][1]));
            expect(written).toEqual(config);
        });
    });

    describe("findInitializedRoot", () => {
        const root2 = { path: "/workspace2" } as any;

        it("should return the initialized root when one root has .memoria", async () => {
            mockStat.mockRejectedValueOnce(new Error("not found")); // root1: not initialized
            mockStat.mockResolvedValueOnce({}); // root2: initialized
            const manager = new ManifestManager(mockFs);
            const result = await manager.findInitializedRoot([workspaceRoot, root2]);
            expect(result).toBe(root2);
        });

        it("should return null when no root is initialized", async () => {
            mockStat.mockRejectedValue(new Error("not found"));
            const manager = new ManifestManager(mockFs);
            const result = await manager.findInitializedRoot([workspaceRoot, root2]);
            expect(result).toBeNull();
        });

        it("should return the first initialized root when multiple are initialized", async () => {
            mockStat.mockResolvedValue({}); // both initialized
            const manager = new ManifestManager(mockFs);
            const result = await manager.findInitializedRoot([workspaceRoot, root2]);
            expect(result).toBe(workspaceRoot);
        });

        it("should return null for an empty roots array", async () => {
            const manager = new ManifestManager(mockFs);
            const result = await manager.findInitializedRoot([]);
            expect(result).toBeNull();
        });
    });

    describe("deleteMemoriaDir", () => {
        it("should delete .memoria/ directory recursively", async () => {
            mockDelete.mockResolvedValue(undefined);
            const manager = new ManifestManager(mockFs);
            await manager.deleteMemoriaDir(workspaceRoot);
            expect(mockDelete).toHaveBeenCalledWith(
                expect.objectContaining({ path: "/workspace/.memoria" }),
                { recursive: true }
            );
        });
    });
});
