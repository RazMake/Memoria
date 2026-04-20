import { describe, it, expect, vi, beforeEach } from "vitest";
import { ManifestManager } from "../../../src/blueprints/manifestManager";
import type { BlueprintManifest, DecorationsConfig, DotfoldersConfig, FeaturesConfig } from "../../../src/blueprints/types";
import type { StoredTaskIndex, TaskCollectorConfig } from "../../../src/features/taskCollector/types";

const mockStat = vi.fn();
const mockReadFile = vi.fn();
const mockWriteFile = vi.fn();
const mockCreateDirectory = vi.fn();
const mockDelete = vi.fn();
const mockReadDirectory = vi.fn();
const mockCopy = vi.fn();
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
            readDirectory: (...args: any[]) => mockReadDirectory(...args),
            copy: (...args: any[]) => mockCopy(...args),
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

const encoder = new TextEncoder();
const workspaceRoot = { path: "/workspace" } as any;

const mockFs = {
    stat: (...args: any[]) => mockStat(...args),
    readFile: (...args: any[]) => mockReadFile(...args),
    writeFile: (...args: any[]) => mockWriteFile(...args),
    createDirectory: (...args: any[]) => mockCreateDirectory(...args),
    delete: (...args: any[]) => mockDelete(...args),
    readDirectory: (...args: any[]) => mockReadDirectory(...args),
    copy: (...args: any[]) => mockCopy(...args),
} as any;

describe("ManifestManager", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockCreateDirectory.mockResolvedValue(undefined);
        mockWriteFile.mockResolvedValue(undefined);
    });

    describe("computeFileHash (via hashUtils)", () => {
        it("should return a sha256: prefixed lowercase hex hash", async () => {
            const { computeFileHash } = await import("../../../src/blueprints/hashUtils");
            const hash = computeFileHash(encoder.encode("hello"));
            expect(hash).toMatch(/^sha256:[0-9a-f]{64}$/);
        });

        it("should return consistent hashes for the same content", async () => {
            const { computeFileHash } = await import("../../../src/blueprints/hashUtils");
            const a = computeFileHash(encoder.encode("same"));
            const b = computeFileHash(encoder.encode("same"));
            expect(a).toBe(b);
        });

        it("should return different hashes for different content", async () => {
            const { computeFileHash } = await import("../../../src/blueprints/hashUtils");
            const a = computeFileHash(encoder.encode("abc"));
            const b = computeFileHash(encoder.encode("xyz"));
            expect(a).not.toBe(b);
        });

        it("should return a lowercase hex hash (no uppercase letters)", async () => {
            const { computeFileHash } = await import("../../../src/blueprints/hashUtils");
            const hash = computeFileHash(encoder.encode("test content"));
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
            contacts: {
                peopleFolder: "05-Contacts/",
                groups: [{ file: "Colleagues.md", type: "colleague" }],
            },
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

    describe("readFeatures / writeFeatures", () => {
        const config: FeaturesConfig = {
            features: [{ id: "decorations", name: "Decorations", description: "Badges", enabled: true }],
        };

        it("should return null when features.json is not found", async () => {
            mockReadFile.mockRejectedValue(new Error("not found"));
            const manager = new ManifestManager(mockFs);
            expect(await manager.readFeatures(workspaceRoot)).toBeNull();
        });

        it("should return parsed config when features.json exists", async () => {
            mockReadFile.mockResolvedValue(encoder.encode(JSON.stringify(config)));
            const manager = new ManifestManager(mockFs);
            expect(await manager.readFeatures(workspaceRoot)).toEqual(config);
        });

        it("should write features config to features.json", async () => {
            const manager = new ManifestManager(mockFs);
            await manager.writeFeatures(workspaceRoot, config);
            expect(mockCreateDirectory).toHaveBeenCalledOnce();
            const written = JSON.parse(new TextDecoder().decode(mockWriteFile.mock.calls[0][1]));
            expect(written).toEqual(config);
        });
    });

    describe("readTaskCollectorConfig / writeTaskCollectorConfig", () => {
        const config: TaskCollectorConfig = {
            completedRetentionDays: 7,
            syncOnStartup: true,
            include: ["**/*.md"],
            exclude: ["**/.memoria/**"],
            debounceMs: 300,
        };

        it("should return null when task-collector.json is not found", async () => {
            mockReadFile.mockRejectedValue(new Error("not found"));
            const manager = new ManifestManager(mockFs);
            expect(await manager.readTaskCollectorConfig(workspaceRoot)).toBeNull();
        });

        it("should write task collector config to task-collector.json", async () => {
            const manager = new ManifestManager(mockFs);
            await manager.writeTaskCollectorConfig(workspaceRoot, config);
            expect(mockCreateDirectory).toHaveBeenCalledOnce();
            const written = JSON.parse(new TextDecoder().decode(mockWriteFile.mock.calls[0][1]));
            expect(written).toEqual(config);
        });
    });

    describe("readTaskIndex / writeTaskIndex / deleteTaskIndex", () => {
        const index: StoredTaskIndex = {
            version: 1,
            collectorPath: "00-Tasks/All-Tasks.md",
            tasks: {},
            collectorOrder: { active: [], completed: [] },
            sourceOrders: {},
        };

        it("should return null when tasks-index.json is not found", async () => {
            mockReadFile.mockRejectedValue(new Error("not found"));
            const manager = new ManifestManager(mockFs);
            expect(await manager.readTaskIndex(workspaceRoot)).toBeNull();
        });

        it("should write task index to tasks-index.json", async () => {
            const manager = new ManifestManager(mockFs);
            await manager.writeTaskIndex(workspaceRoot, index);
            expect(mockCreateDirectory).toHaveBeenCalledOnce();
            const written = JSON.parse(new TextDecoder().decode(mockWriteFile.mock.calls[0][1]));
            expect(written).toEqual(index);
        });

        it("should delete tasks-index.json when requested", async () => {
            mockDelete.mockResolvedValue(undefined);
            const manager = new ManifestManager(mockFs);
            await manager.deleteTaskIndex(workspaceRoot);
            expect(mockDelete).toHaveBeenCalledWith(
                expect.objectContaining({ path: "/workspace/.memoria/tasks-index.json" })
            );
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

    describe("backupMemoriaDir", () => {
        const newRoot = { path: "/newRoot" } as any;

        it("should copy all files from old .memoria/ to newRoot/WorkspaceInitializationBackups/.memoria/", async () => {
            mockReadDirectory.mockResolvedValue([
                ["blueprint.json", 1],
                ["decorations.json", 1],
            ]);
            mockCopy.mockResolvedValue(undefined);
            mockCreateDirectory.mockResolvedValue(undefined);
            const manager = new ManifestManager(mockFs);
            const failed = await manager.backupMemoriaDir(workspaceRoot, newRoot);
            expect(failed).toEqual([]);
            expect(mockCreateDirectory).toHaveBeenCalledWith(
                expect.objectContaining({ path: "/newRoot/WorkspaceInitializationBackups/.memoria" })
            );
            expect(mockCopy).toHaveBeenCalledTimes(2);
            expect(mockCopy).toHaveBeenCalledWith(
                expect.objectContaining({ path: "/workspace/.memoria/blueprint.json" }),
                expect.objectContaining({ path: "/newRoot/WorkspaceInitializationBackups/.memoria/blueprint.json" }),
                { overwrite: true }
            );
            expect(mockCopy).toHaveBeenCalledWith(
                expect.objectContaining({ path: "/workspace/.memoria/decorations.json" }),
                expect.objectContaining({ path: "/newRoot/WorkspaceInitializationBackups/.memoria/decorations.json" }),
                { overwrite: true }
            );
        });

        it("should skip directories inside .memoria/", async () => {
            mockReadDirectory.mockResolvedValue([
                ["blueprint.json", 1],
                ["subdir", 2],
            ]);
            mockCopy.mockResolvedValue(undefined);
            mockCreateDirectory.mockResolvedValue(undefined);
            const manager = new ManifestManager(mockFs);
            await manager.backupMemoriaDir(workspaceRoot, newRoot);
            expect(mockCopy).toHaveBeenCalledTimes(1);
        });

        it("should return failed path when copy throws for a file", async () => {
            mockReadDirectory.mockResolvedValue([
                ["blueprint.json", 1],
                ["custom.json", 1],
            ]);
            mockCopy.mockResolvedValueOnce(undefined);
            mockCopy.mockRejectedValueOnce(new Error("disk full"));
            mockCreateDirectory.mockResolvedValue(undefined);
            const manager = new ManifestManager(mockFs);
            const failed = await manager.backupMemoriaDir(workspaceRoot, newRoot);
            expect(failed).toEqual(["custom.json"]);
        });

        it("should return empty array when .memoria/ does not exist", async () => {
            mockReadDirectory.mockRejectedValue(new Error("not found"));
            const manager = new ManifestManager(mockFs);
            const failed = await manager.backupMemoriaDir(workspaceRoot, newRoot);
            expect(failed).toEqual([]);
            expect(mockCopy).not.toHaveBeenCalled();
        });

        it("should return empty array when .memoria/ is empty", async () => {
            mockReadDirectory.mockResolvedValue([]);
            mockCreateDirectory.mockResolvedValue(undefined);
            const manager = new ManifestManager(mockFs);
            const failed = await manager.backupMemoriaDir(workspaceRoot, newRoot);
            expect(failed).toEqual([]);
        });
    });

    describe("readDefaultFiles / writeDefaultFiles", () => {
        it("should return null when default-files.json is not found", async () => {
            mockReadFile.mockRejectedValue(new Error("not found"));
            const manager = new ManifestManager(mockFs);
            expect(await manager.readDefaultFiles(workspaceRoot)).toBeNull();
        });

        it("should return null when defaultFiles property is missing from the config", async () => {
            mockReadFile.mockResolvedValue(encoder.encode(JSON.stringify({})));
            const manager = new ManifestManager(mockFs);
            expect(await manager.readDefaultFiles(workspaceRoot)).toBeNull();
        });

        it("should return the defaultFiles map when values are already arrays", async () => {
            const config = { defaultFiles: { "00-ToDo/": ["Main.todo", "Notes.md"] } };
            mockReadFile.mockResolvedValue(encoder.encode(JSON.stringify(config)));
            const manager = new ManifestManager(mockFs);
            expect(await manager.readDefaultFiles(workspaceRoot)).toEqual({
                "00-ToDo/": { filesToOpen: ["Main.todo", "Notes.md"] },
            });
        });

        it("should normalize legacy string values to single-element arrays", async () => {
            // Legacy format stored a plain string instead of an array.
            const legacyConfig = { defaultFiles: { "00-ToDo/": "Main.todo" } };
            mockReadFile.mockResolvedValue(encoder.encode(JSON.stringify(legacyConfig)));
            const manager = new ManifestManager(mockFs);
            expect(await manager.readDefaultFiles(workspaceRoot)).toEqual({
                "00-ToDo/": { filesToOpen: ["Main.todo"] },
            });
        });

        it("should preserve DefaultFilesEntry objects with behavior flags", async () => {
            const config = {
                defaultFiles: {
                    "00-ToDo/": {
                        filesToOpen: ["Main.todo"],
                        closeCurrentlyOpenedFilesFirst: false,
                        openSideBySide: false,
                    },
                },
            };
            mockReadFile.mockResolvedValue(encoder.encode(JSON.stringify(config)));
            const manager = new ManifestManager(mockFs);
            expect(await manager.readDefaultFiles(workspaceRoot)).toEqual({
                "00-ToDo/": {
                    filesToOpen: ["Main.todo"],
                    closeCurrentlyOpenedFilesFirst: false,
                    openSideBySide: false,
                },
            });
        });

        it("should write the defaultFiles map wrapped in { defaultFiles } to default-files.json", async () => {
            const manager = new ManifestManager(mockFs);
            await manager.writeDefaultFiles(workspaceRoot, { "00-ToDo/": { filesToOpen: ["Main.todo"] } });
            expect(mockCreateDirectory).toHaveBeenCalledOnce();
            const written = JSON.parse(new TextDecoder().decode(mockWriteFile.mock.calls[0][1]));
            expect(written).toEqual({ defaultFiles: { "00-ToDo/": { filesToOpen: ["Main.todo"] } } });
        });
    });

    describe("ensureMemoriaDir deduplication", () => {
        it("should only create the directory once when multiple writes target the same root", async () => {
            const manager = new ManifestManager(mockFs);
            const config: FeaturesConfig = {
                features: [{ id: "decorations", name: "D", description: "D", enabled: true }],
            };
            await manager.writeFeatures(workspaceRoot, config);
            await manager.writeFeatures(workspaceRoot, config);
            // createDirectory must be called only once — the second call hits the early-return guard.
            expect(mockCreateDirectory).toHaveBeenCalledOnce();
        });
    });
});
