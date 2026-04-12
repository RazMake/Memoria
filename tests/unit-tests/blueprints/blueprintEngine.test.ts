import { describe, it, expect, vi, beforeEach } from "vitest";
import { BlueprintEngine, buildFeaturesConfig, extractDecorationRules, mergeFeaturesConfig, mergeDefaultFileMap } from "../../../src/blueprints/blueprintEngine";
import type { BlueprintDefinition, BlueprintFeature, FeaturesConfig } from "../../../src/blueprints/types";

// BlueprintEngine uses only injected collaborators — no direct vscode API calls.
// We mock the vscode module minimally in case any imported dependency references it.
vi.mock("vscode", () => ({
    Uri: {
        joinPath: vi.fn((base: any, ...segments: string[]) => ({
            ...base,
            path: [base.path, ...segments].join("/"),
        })),
    },
}));

const mockDefinition: BlueprintDefinition = {
    id: "individual-contributor",
    name: "Test Blueprint",
    description: "desc",
    version: "1.0.0",
    workspace: [{ name: "Folder/", isFolder: true, children: [{ name: "file.md", isFolder: false }] }],
    features: [{
        id: "decorations",
        name: "Explorer Decorations",
        description: "Badges and colors",
        enabledByDefault: true,
        rules: [{ filter: "Folder/", color: "charts.green" }],
    }],
};

const managerDefinition: BlueprintDefinition = {
    id: "manager",
    name: "Manager Blueprint",
    description: "desc",
    version: "1.0.0",
    workspace: [{ name: "00-ToDo/", isFolder: true }],
    features: [{
        id: "decorations",
        name: "Explorer Decorations",
        description: "Badges and colors",
        enabledByDefault: true,
        rules: [],
    }],
};

const scaffoldResult = { fileManifest: { "Folder/file.md": "sha256:abc" }, skippedPaths: [] };

describe("BlueprintEngine", () => {
    const workspaceRoot = { path: "/workspace" } as any;

    let mockRegistry: any;
    let mockManifest: any;
    let mockScaffold: any;
    let mockFs: any;
    let mockTelemetry: any;

    beforeEach(() => {
        vi.clearAllMocks();
        mockRegistry = {
            getBlueprintDefinition: vi.fn().mockResolvedValue(mockDefinition),
            getSeedFileContent: vi.fn().mockResolvedValue(null),
        };
        mockManifest = {
            readManifest: vi.fn().mockResolvedValue(null),
            writeManifest: vi.fn().mockResolvedValue(undefined),
            writeDefaultFiles: vi.fn().mockResolvedValue(undefined),
            writeDecorations: vi.fn().mockResolvedValue(undefined),
            writeFeatures: vi.fn().mockResolvedValue(undefined),
            readFeatures: vi.fn().mockResolvedValue(null),
        };
        mockScaffold = {
            scaffoldTree: vi.fn().mockResolvedValue(scaffoldResult),
        };
        mockFs = {
            createDirectory: vi.fn().mockResolvedValue(undefined),
            rename: vi.fn().mockResolvedValue(undefined),
            readFile: vi.fn().mockResolvedValue(new Uint8Array(0)),
            copy: vi.fn().mockResolvedValue(undefined),
        };
        mockTelemetry = {
            logUsage: vi.fn(),
            logError: vi.fn(),
        };
    });

    describe("initialize", () => {
        it("should call getBlueprintDefinition with the provided blueprint id", async () => {
            const engine = new BlueprintEngine(mockRegistry, mockManifest, mockScaffold, mockFs, mockTelemetry);
            await engine.initialize(workspaceRoot, "individual-contributor");
            expect(mockRegistry.getBlueprintDefinition).toHaveBeenCalledWith("individual-contributor");
        });

        it("should call scaffoldTree with the workspace root and definition workspace entries", async () => {
            const engine = new BlueprintEngine(mockRegistry, mockManifest, mockScaffold, mockFs, mockTelemetry);
            await engine.initialize(workspaceRoot, "individual-contributor");
            expect(mockScaffold.scaffoldTree).toHaveBeenCalledWith(
                workspaceRoot,
                mockDefinition.workspace,
                expect.any(Function)
            );
        });

        it("should write manifest to .memoria/blueprint.json after scaffolding", async () => {
            const engine = new BlueprintEngine(mockRegistry, mockManifest, mockScaffold, mockFs, mockTelemetry);
            await engine.initialize(workspaceRoot, "individual-contributor");
            expect(mockManifest.writeManifest).toHaveBeenCalledWith(
                workspaceRoot,
                expect.objectContaining({
                    blueprintId: "individual-contributor",
                    blueprintVersion: "1.0.0",
                    fileManifest: { "Folder/file.md": "sha256:abc" },
                    lastReinitAt: null,
                })
            );
        });

        it("should write decoration rules to .memoria/decorations.json", async () => {
            const engine = new BlueprintEngine(mockRegistry, mockManifest, mockScaffold, mockFs, mockTelemetry);
            await engine.initialize(workspaceRoot, "individual-contributor");
            expect(mockManifest.writeDecorations).toHaveBeenCalledWith(workspaceRoot, {
                rules: mockDefinition.features[0].rules,
            });
        });

        it("should write features.json with enabledByDefault values", async () => {
            const engine = new BlueprintEngine(mockRegistry, mockManifest, mockScaffold, mockFs, mockTelemetry);
            await engine.initialize(workspaceRoot, "individual-contributor");
            expect(mockManifest.writeFeatures).toHaveBeenCalledWith(workspaceRoot, {
                features: [{
                    id: "decorations",
                    name: "Explorer Decorations",
                    description: "Badges and colors",
                    enabled: true,
                }],
            });
        });

        it("should write manifest before decorations (sequential ordering)", async () => {
            const callOrder: string[] = [];
            mockManifest.writeManifest.mockImplementation(async () => { callOrder.push("manifest"); });
            mockManifest.writeDecorations.mockImplementation(async () => { callOrder.push("decorations"); });
            mockManifest.writeFeatures.mockImplementation(async () => { callOrder.push("features"); });

            const engine = new BlueprintEngine(mockRegistry, mockManifest, mockScaffold, mockFs, mockTelemetry);
            await engine.initialize(workspaceRoot, "individual-contributor");

            expect(callOrder).toEqual(["manifest", "decorations", "features"]);
        });

        it("should propagate errors thrown by the registry", async () => {
            mockRegistry.getBlueprintDefinition.mockRejectedValue(new Error("Blueprint not found"));
            const engine = new BlueprintEngine(mockRegistry, mockManifest, mockScaffold, mockFs, mockTelemetry);
            await expect(engine.initialize(workspaceRoot, "unknown")).rejects.toThrow("Blueprint not found");
        });

        it("should propagate errors thrown by the scaffold", async () => {
            mockScaffold.scaffoldTree.mockRejectedValue(new Error("Disk write failed"));
            const engine = new BlueprintEngine(mockRegistry, mockManifest, mockScaffold, mockFs, mockTelemetry);
            await expect(engine.initialize(workspaceRoot, "individual-contributor")).rejects.toThrow("Disk write failed");
        });

        it("should write default-files.json when blueprint defines defaultFiles", async () => {
            const definitionWithDefault = {
                ...mockDefinition,
                defaultFiles: { relative: { "Folder/": ["file.md"] }, rootScoped: {} },
            };
            mockRegistry.getBlueprintDefinition.mockResolvedValue(definitionWithDefault);
            const engine = new BlueprintEngine(mockRegistry, mockManifest, mockScaffold, mockFs, mockTelemetry);
            await engine.initialize(workspaceRoot, "individual-contributor");
            expect(mockManifest.writeDefaultFiles).toHaveBeenCalledWith(
                workspaceRoot,
                { "Folder/": ["file.md"] }
            );
        });

        it("should prefix rootScoped defaultFiles with the workspace root name", async () => {
            const definitionWithDefault = {
                ...mockDefinition,
                defaultFiles: {
                    relative: { "A/": ["shared.md"] },
                    rootScoped: { "A/": ["local.md"] },
                },
            };
            mockRegistry.getBlueprintDefinition.mockResolvedValue(definitionWithDefault);
            const engine = new BlueprintEngine(mockRegistry, mockManifest, mockScaffold, mockFs, mockTelemetry);
            await engine.initialize(workspaceRoot, "individual-contributor");
            expect(mockManifest.writeDefaultFiles).toHaveBeenCalledWith(
                workspaceRoot,
                { "A/": ["shared.md"], "workspace/A/": ["local.md"] }
            );
        });

        it("should not write default-files.json when blueprint does not define any", async () => {
            const engine = new BlueprintEngine(mockRegistry, mockManifest, mockScaffold, mockFs, mockTelemetry);
            await engine.initialize(workspaceRoot, "individual-contributor");
            expect(mockManifest.writeDefaultFiles).not.toHaveBeenCalled();
        });

        it("should not include defaultFiles in manifest", async () => {
            const definitionWithDefault = {
                ...mockDefinition,
                defaultFiles: { relative: { "Folder/": ["file.md"] }, rootScoped: {} },
            };
            mockRegistry.getBlueprintDefinition.mockResolvedValue(definitionWithDefault);
            const engine = new BlueprintEngine(mockRegistry, mockManifest, mockScaffold, mockFs, mockTelemetry);
            await engine.initialize(workspaceRoot, "individual-contributor");
            const writtenManifest = mockManifest.writeManifest.mock.calls[0][1];
            expect(writtenManifest.defaultFiles).toBeUndefined();
        });
    });

    describe("reinitialize", () => {
        const existingManifest = {
            blueprintId: "individual-contributor",
            blueprintVersion: "1.0.0",
            initializedAt: "2026-01-01T00:00:00.000Z",
            lastReinitAt: null,
            fileManifest: { "Folder/file.md": "sha256:original" },
        };

        let mockResolver: any;

        beforeEach(() => {
            mockManifest.readManifest = vi.fn().mockResolvedValue(existingManifest);
            mockResolver = {
                resolveConflicts: vi.fn().mockResolvedValue({
                    foldersToCleanup: [],
                    unmodifiedBlueprintFiles: ["Folder/file.md"],
                    modifiedBlueprintFiles: [],
                    currentFileHashes: {},
                }),
                promptFileOverwrite: vi.fn(),
            };
        });

        it("should throw when no manifest exists (workspace not initialized)", async () => {
            mockManifest.readManifest.mockResolvedValue(null);
            const engine = new BlueprintEngine(mockRegistry, mockManifest, mockScaffold, mockFs, mockTelemetry);
            await expect(engine.reinitialize(workspaceRoot, "individual-contributor", mockResolver)).rejects.toThrow(
                "no .memoria/blueprint.json"
            );
        });

        it("should call resolveConflicts with the current manifest and new definition", async () => {
            const engine = new BlueprintEngine(mockRegistry, mockManifest, mockScaffold, mockFs, mockTelemetry);
            await engine.reinitialize(workspaceRoot, "individual-contributor", mockResolver);
            expect(mockResolver.resolveConflicts).toHaveBeenCalledWith(
                workspaceRoot,
                existingManifest,
                mockDefinition
            );
        });

        it("should move cleanup folders to ReInitializationCleanup/ via fs.rename", async () => {
            mockResolver.resolveConflicts.mockResolvedValue({
                foldersToCleanup: ["OldFolder"],
                unmodifiedBlueprintFiles: [],
                modifiedBlueprintFiles: [],
                currentFileHashes: {},
            });
            const engine = new BlueprintEngine(mockRegistry, mockManifest, mockScaffold, mockFs, mockTelemetry);
            await engine.reinitialize(workspaceRoot, "individual-contributor", mockResolver);
            expect(mockFs.createDirectory).toHaveBeenCalled();
            expect(mockFs.rename).toHaveBeenCalledWith(
                expect.objectContaining({ path: expect.stringContaining("OldFolder") }),
                expect.objectContaining({ path: expect.stringContaining("ReInitializationCleanup") }),
                { overwrite: false }
            );
        });

        it("should not rename anything when no folders need cleanup", async () => {
            const engine = new BlueprintEngine(mockRegistry, mockManifest, mockScaffold, mockFs, mockTelemetry);
            await engine.reinitialize(workspaceRoot, "individual-contributor", mockResolver);
            expect(mockFs.rename).not.toHaveBeenCalled();
        });

        it("should update manifest with new blueprintId and set lastReinitAt", async () => {
            const engine = new BlueprintEngine(mockRegistry, mockManifest, mockScaffold, mockFs, mockTelemetry);
            await engine.reinitialize(workspaceRoot, "individual-contributor", mockResolver);
            expect(mockManifest.writeManifest).toHaveBeenCalledWith(
                workspaceRoot,
                expect.objectContaining({
                    blueprintId: "individual-contributor",
                    blueprintVersion: "1.0.0",
                    lastReinitAt: expect.any(String),
                    initializedAt: existingManifest.initializedAt,
                })
            );
        });

        it("should prompt the user for each modified file", async () => {
            mockResolver.resolveConflicts.mockResolvedValue({
                foldersToCleanup: [],
                unmodifiedBlueprintFiles: [],
                modifiedBlueprintFiles: ["Folder/file.md"],
                currentFileHashes: { "Folder/file.md": "sha256:modified" },
            });
            mockResolver.promptFileOverwrite.mockResolvedValue("yes");
            // Make the scaffold mock actually invoke the seed callback for the modified file,
            // so the engine's overwrite-prompt logic is exercised.
            mockScaffold.scaffoldTree.mockImplementation(async (_root: any, _entries: any, callback: any) => {
                await callback("Folder/file.md");
                return { fileManifest: { "Folder/file.md": "sha256:abc" }, skippedPaths: [] };
            });
            const engine = new BlueprintEngine(mockRegistry, mockManifest, mockScaffold, mockFs, mockTelemetry);
            await engine.reinitialize(workspaceRoot, "individual-contributor", mockResolver);
            expect(mockResolver.promptFileOverwrite).toHaveBeenCalledWith("Folder/file.md");
        });

        it("should skip a file when the user chooses 'no' for overwrite", async () => {
            mockResolver.resolveConflicts.mockResolvedValue({
                foldersToCleanup: [],
                unmodifiedBlueprintFiles: [],
                modifiedBlueprintFiles: ["Folder/file.md"],
                currentFileHashes: { "Folder/file.md": "sha256:modified" },
            });
            mockResolver.promptFileOverwrite.mockResolvedValue("no");
            mockScaffold.scaffoldTree.mockResolvedValue({
                fileManifest: {},
                skippedPaths: ["Folder/file.md"],
            });
            const engine = new BlueprintEngine(mockRegistry, mockManifest, mockScaffold, mockFs, mockTelemetry);
            await engine.reinitialize(workspaceRoot, "individual-contributor", mockResolver);
            // Skipped file uses the cached hash from the plan — no extra fs.readFile needed.
            expect(mockFs.readFile).not.toHaveBeenCalled();
            const writtenManifest = mockManifest.writeManifest.mock.calls[0][1];
            expect(writtenManifest.fileManifest["Folder/file.md"]).toBe("sha256:modified");
        });

        it("should write updated decoration rules after reinit", async () => {
            const engine = new BlueprintEngine(mockRegistry, mockManifest, mockScaffold, mockFs, mockTelemetry);
            await engine.reinitialize(workspaceRoot, "individual-contributor", mockResolver);
            expect(mockManifest.writeDecorations).toHaveBeenCalledWith(workspaceRoot, {
                rules: mockDefinition.features[0].rules,
            });
        });

        it("should write merged features.json after reinit preserving user toggles", async () => {
            mockManifest.readFeatures.mockResolvedValue({
                features: [{ id: "decorations", name: "Old", description: "Old", enabled: false }],
            });
            const engine = new BlueprintEngine(mockRegistry, mockManifest, mockScaffold, mockFs, mockTelemetry);
            await engine.reinitialize(workspaceRoot, "individual-contributor", mockResolver);
            expect(mockManifest.writeFeatures).toHaveBeenCalledWith(workspaceRoot, {
                features: [{
                    id: "decorations",
                    name: "Explorer Decorations",
                    description: "Badges and colors",
                    enabled: false,
                }],
            });
        });

        it("should handle different-blueprint reinit by passing the new definition to resolveConflicts", async () => {
            mockManifest.readManifest.mockResolvedValue({
                ...existingManifest,
                blueprintId: "manager",
            });
            mockRegistry.getBlueprintDefinition.mockResolvedValue(mockDefinition);
            const engine = new BlueprintEngine(mockRegistry, mockManifest, mockScaffold, mockFs, mockTelemetry);
            await engine.reinitialize(workspaceRoot, "individual-contributor", mockResolver);
            // resolveConflicts receives the NEW definition; ReinitConflictResolver handles
            // the different-blueprint detection internally.
            expect(mockResolver.resolveConflicts).toHaveBeenCalledWith(
                workspaceRoot,
                expect.objectContaining({ blueprintId: "manager" }),
                mockDefinition
            );
        });

        it("should return SKIP_FILE from the seed callback when user chooses 'no'", async () => {
            mockResolver.resolveConflicts.mockResolvedValue({
                foldersToCleanup: [],
                unmodifiedBlueprintFiles: [],
                modifiedBlueprintFiles: ["Folder/file.md"],
                currentFileHashes: { "Folder/file.md": "sha256:modified" },
            });
            mockResolver.promptFileOverwrite.mockResolvedValue("no");
            let callbackResult: any;
            mockScaffold.scaffoldTree.mockImplementation(async (_root: any, _entries: any, callback: any) => {
                callbackResult = await callback("Folder/file.md");
                return { fileManifest: {}, skippedPaths: ["Folder/file.md"] };
            });
            const engine = new BlueprintEngine(mockRegistry, mockManifest, mockScaffold, mockFs, mockTelemetry);
            await engine.reinitialize(workspaceRoot, "individual-contributor", mockResolver);
            // SKIP_FILE is a Symbol — verify the callback returned it
            expect(typeof callbackResult).toBe("symbol");
        });

        it("should auto-overwrite subsequent files in the same folder after 'yes-folder'", async () => {
            mockResolver.resolveConflicts.mockResolvedValue({
                foldersToCleanup: [],
                unmodifiedBlueprintFiles: [],
                modifiedBlueprintFiles: ["Folder/a.md", "Folder/b.md"],
                currentFileHashes: {},
            });
            mockResolver.promptFileOverwrite.mockResolvedValue("yes-folder");
            mockRegistry.getSeedFileContent.mockResolvedValue(new Uint8Array([1]));
            mockScaffold.scaffoldTree.mockImplementation(async (_root: any, _entries: any, callback: any) => {
                await callback("Folder/a.md");
                await callback("Folder/b.md");
                return { fileManifest: { "Folder/a.md": "sha256:a", "Folder/b.md": "sha256:b" }, skippedPaths: [] };
            });
            const engine = new BlueprintEngine(mockRegistry, mockManifest, mockScaffold, mockFs, mockTelemetry);
            await engine.reinitialize(workspaceRoot, "individual-contributor", mockResolver);
            // Only the first file should trigger a prompt; the second is auto-overwritten.
            expect(mockResolver.promptFileOverwrite).toHaveBeenCalledTimes(1);
            expect(mockResolver.promptFileOverwrite).toHaveBeenCalledWith("Folder/a.md");
        });

        it("should auto-overwrite nested files after 'yes-folder-recursive'", async () => {
            mockResolver.resolveConflicts.mockResolvedValue({
                foldersToCleanup: [],
                unmodifiedBlueprintFiles: [],
                modifiedBlueprintFiles: ["Folder/a.md", "Folder/sub/b.md"],
                currentFileHashes: {},
            });
            mockResolver.promptFileOverwrite.mockResolvedValue("yes-folder-recursive");
            mockRegistry.getSeedFileContent.mockResolvedValue(new Uint8Array([1]));
            mockScaffold.scaffoldTree.mockImplementation(async (_root: any, _entries: any, callback: any) => {
                await callback("Folder/a.md");
                await callback("Folder/sub/b.md");
                return { fileManifest: { "Folder/a.md": "sha256:a", "Folder/sub/b.md": "sha256:b" }, skippedPaths: [] };
            });
            const engine = new BlueprintEngine(mockRegistry, mockManifest, mockScaffold, mockFs, mockTelemetry);
            await engine.reinitialize(workspaceRoot, "individual-contributor", mockResolver);
            // Only the first file triggers a prompt; nested file is covered by recursive scope.
            expect(mockResolver.promptFileOverwrite).toHaveBeenCalledTimes(1);
            expect(mockResolver.promptFileOverwrite).toHaveBeenCalledWith("Folder/a.md");
        });

        it("should omit deleted files from manifest when recording skipped file hashes", async () => {
            mockResolver.resolveConflicts.mockResolvedValue({
                foldersToCleanup: [],
                unmodifiedBlueprintFiles: [],
                modifiedBlueprintFiles: [],
                currentFileHashes: { "Folder/deleted.md": null },
            });
            mockScaffold.scaffoldTree.mockResolvedValue({
                fileManifest: {},
                skippedPaths: ["Folder/deleted.md"],
            });
            const engine = new BlueprintEngine(mockRegistry, mockManifest, mockScaffold, mockFs, mockTelemetry);
            await engine.reinitialize(workspaceRoot, "individual-contributor", mockResolver);
            // Cached null hash means file was deleted — no fs.readFile needed.
            expect(mockFs.readFile).not.toHaveBeenCalled();
            const writtenManifest = mockManifest.writeManifest.mock.calls[0][1];
            expect(writtenManifest.fileManifest).not.toHaveProperty("Folder/deleted.md");
        });

        it("should back up a modified file to ReInitializationCleanup/ before overwriting when user chooses 'yes'", async () => {
            mockResolver.resolveConflicts.mockResolvedValue({
                foldersToCleanup: [],
                unmodifiedBlueprintFiles: [],
                modifiedBlueprintFiles: ["Folder/file.md"],
                currentFileHashes: { "Folder/file.md": "sha256:modified" },
            });
            mockResolver.promptFileOverwrite.mockResolvedValue("yes");
            mockRegistry.getSeedFileContent.mockResolvedValue(new Uint8Array([1]));
            mockScaffold.scaffoldTree.mockImplementation(async (_root: any, _entries: any, callback: any) => {
                await callback("Folder/file.md");
                return { fileManifest: { "Folder/file.md": "sha256:abc" }, skippedPaths: [] };
            });
            const engine = new BlueprintEngine(mockRegistry, mockManifest, mockScaffold, mockFs, mockTelemetry);
            await engine.reinitialize(workspaceRoot, "individual-contributor", mockResolver);
            expect(mockFs.copy).toHaveBeenCalledWith(
                expect.objectContaining({ path: "/workspace/Folder/file.md" }),
                expect.objectContaining({ path: "/workspace/ReInitializationCleanup/Folder/file.md" }),
                { overwrite: true }
            );
        });

        it("should not back up a modified file when user chooses 'no'", async () => {
            mockResolver.resolveConflicts.mockResolvedValue({
                foldersToCleanup: [],
                unmodifiedBlueprintFiles: [],
                modifiedBlueprintFiles: ["Folder/file.md"],
                currentFileHashes: { "Folder/file.md": "sha256:modified" },
            });
            mockResolver.promptFileOverwrite.mockResolvedValue("no");
            mockScaffold.scaffoldTree.mockImplementation(async (_root: any, _entries: any, callback: any) => {
                await callback("Folder/file.md");
                return { fileManifest: {}, skippedPaths: ["Folder/file.md"] };
            });
            const engine = new BlueprintEngine(mockRegistry, mockManifest, mockScaffold, mockFs, mockTelemetry);
            await engine.reinitialize(workspaceRoot, "individual-contributor", mockResolver);
            expect(mockFs.copy).not.toHaveBeenCalled();
        });

        it("should back up all files in folder scope after 'yes-folder'", async () => {
            mockResolver.resolveConflicts.mockResolvedValue({
                foldersToCleanup: [],
                unmodifiedBlueprintFiles: [],
                modifiedBlueprintFiles: ["Folder/a.md", "Folder/b.md"],
                currentFileHashes: {},
            });
            mockResolver.promptFileOverwrite.mockResolvedValue("yes-folder");
            mockRegistry.getSeedFileContent.mockResolvedValue(new Uint8Array([1]));
            mockScaffold.scaffoldTree.mockImplementation(async (_root: any, _entries: any, callback: any) => {
                await callback("Folder/a.md");
                await callback("Folder/b.md");
                return { fileManifest: { "Folder/a.md": "sha256:a", "Folder/b.md": "sha256:b" }, skippedPaths: [] };
            });
            const engine = new BlueprintEngine(mockRegistry, mockManifest, mockScaffold, mockFs, mockTelemetry);
            await engine.reinitialize(workspaceRoot, "individual-contributor", mockResolver);
            // Both files should be backed up.
            expect(mockFs.copy).toHaveBeenCalledTimes(2);
            expect(mockFs.copy).toHaveBeenCalledWith(
                expect.objectContaining({ path: "/workspace/Folder/a.md" }),
                expect.objectContaining({ path: "/workspace/ReInitializationCleanup/Folder/a.md" }),
                { overwrite: true }
            );
            expect(mockFs.copy).toHaveBeenCalledWith(
                expect.objectContaining({ path: "/workspace/Folder/b.md" }),
                expect.objectContaining({ path: "/workspace/ReInitializationCleanup/Folder/b.md" }),
                { overwrite: true }
            );
        });

        it("should back up nested files after 'yes-folder-recursive'", async () => {
            mockResolver.resolveConflicts.mockResolvedValue({
                foldersToCleanup: [],
                unmodifiedBlueprintFiles: [],
                modifiedBlueprintFiles: ["Folder/a.md", "Folder/sub/b.md"],
                currentFileHashes: {},
            });
            mockResolver.promptFileOverwrite.mockResolvedValue("yes-folder-recursive");
            mockRegistry.getSeedFileContent.mockResolvedValue(new Uint8Array([1]));
            mockScaffold.scaffoldTree.mockImplementation(async (_root: any, _entries: any, callback: any) => {
                await callback("Folder/a.md");
                await callback("Folder/sub/b.md");
                return { fileManifest: { "Folder/a.md": "sha256:a", "Folder/sub/b.md": "sha256:b" }, skippedPaths: [] };
            });
            const engine = new BlueprintEngine(mockRegistry, mockManifest, mockScaffold, mockFs, mockTelemetry);
            await engine.reinitialize(workspaceRoot, "individual-contributor", mockResolver);
            expect(mockFs.copy).toHaveBeenCalledTimes(2);
            expect(mockFs.copy).toHaveBeenCalledWith(
                expect.objectContaining({ path: "/workspace/Folder/sub/b.md" }),
                expect.objectContaining({ path: "/workspace/ReInitializationCleanup/Folder/sub/b.md" }),
                { overwrite: true }
            );
        });

        it("should continue reinit and log telemetry error when backup copy fails", async () => {
            mockResolver.resolveConflicts.mockResolvedValue({
                foldersToCleanup: [],
                unmodifiedBlueprintFiles: [],
                modifiedBlueprintFiles: ["Folder/file.md"],
                currentFileHashes: { "Folder/file.md": "sha256:modified" },
            });
            mockResolver.promptFileOverwrite.mockResolvedValue("yes");
            mockRegistry.getSeedFileContent.mockResolvedValue(new Uint8Array([1]));
            mockFs.copy.mockRejectedValue(new Error("permission denied"));
            mockScaffold.scaffoldTree.mockImplementation(async (_root: any, _entries: any, callback: any) => {
                await callback("Folder/file.md");
                return { fileManifest: { "Folder/file.md": "sha256:abc" }, skippedPaths: [] };
            });
            const engine = new BlueprintEngine(mockRegistry, mockManifest, mockScaffold, mockFs, mockTelemetry);
            // Should not throw despite copy failure.
            await engine.reinitialize(workspaceRoot, "individual-contributor", mockResolver);
            expect(mockTelemetry.logError).toHaveBeenCalledWith("reinit.backupFailed", {
                path: "Folder/file.md",
                error: "permission denied",
            });
            // Reinit should still complete — manifest is written.
            expect(mockManifest.writeManifest).toHaveBeenCalled();
        });

        it("should not back up unmodified files", async () => {
            // Default resolver returns unmodifiedBlueprintFiles: ["Folder/file.md"], modifiedBlueprintFiles: []
            mockScaffold.scaffoldTree.mockImplementation(async (_root: any, _entries: any, callback: any) => {
                await callback("Folder/file.md");
                return { fileManifest: { "Folder/file.md": "sha256:abc" }, skippedPaths: [] };
            });
            const engine = new BlueprintEngine(mockRegistry, mockManifest, mockScaffold, mockFs, mockTelemetry);
            await engine.reinitialize(workspaceRoot, "individual-contributor", mockResolver);
            expect(mockFs.copy).not.toHaveBeenCalled();
        });

        it("should write default-files.json when blueprint defines defaultFiles during reinit", async () => {
            const definitionWithDefault = {
                ...mockDefinition,
                defaultFiles: { relative: { "Folder/": ["file.md"] }, rootScoped: {} },
            };
            mockRegistry.getBlueprintDefinition.mockResolvedValue(definitionWithDefault);
            const engine = new BlueprintEngine(mockRegistry, mockManifest, mockScaffold, mockFs, mockTelemetry);
            await engine.reinitialize(workspaceRoot, "individual-contributor", mockResolver);
            expect(mockManifest.writeDefaultFiles).toHaveBeenCalledWith(
                workspaceRoot,
                { "Folder/": ["file.md"] }
            );
        });

        it("should not write default-files.json when blueprint does not define any during reinit", async () => {
            const engine = new BlueprintEngine(mockRegistry, mockManifest, mockScaffold, mockFs, mockTelemetry);
            await engine.reinitialize(workspaceRoot, "individual-contributor", mockResolver);
            expect(mockManifest.writeDefaultFiles).not.toHaveBeenCalled();
        });

        it("should not include defaultFiles in updated manifest", async () => {
            const definitionWithDefault = {
                ...mockDefinition,
                defaultFiles: { relative: { "Folder/": ["file.md"] }, rootScoped: {} },
            };
            mockRegistry.getBlueprintDefinition.mockResolvedValue(definitionWithDefault);
            const engine = new BlueprintEngine(mockRegistry, mockManifest, mockScaffold, mockFs, mockTelemetry);
            await engine.reinitialize(workspaceRoot, "individual-contributor", mockResolver);
            const writtenManifest = mockManifest.writeManifest.mock.calls[0][1];
            expect(writtenManifest.defaultFiles).toBeUndefined();
        });
    });
});

describe("mergeDefaultFileMap", () => {
    it("should return relative entries as-is", () => {
        const root = { path: "/workspace" } as any;
        const result = mergeDefaultFileMap(
            { relative: { "A/": ["f.md"] }, rootScoped: {} },
            root
        );
        expect(result).toEqual({ "A/": ["f.md"] });
    });

    it("should prefix rootScoped entries with root folder name", () => {
        const root = { path: "/workspace" } as any;
        const result = mergeDefaultFileMap(
            { relative: {}, rootScoped: { "A/": ["f.md"] } },
            root
        );
        expect(result).toEqual({ "workspace/A/": ["f.md"] });
    });

    it("should merge both relative and rootScoped entries", () => {
        const root = { path: "/my-project" } as any;
        const result = mergeDefaultFileMap(
            {
                relative: { "A/": ["shared.md"] },
                rootScoped: { "A/": ["local.md"] },
            },
            root
        );
        expect(result).toEqual({
            "A/": ["shared.md"],
            "my-project/A/": ["local.md"],
        });
    });

    it("should handle root path with trailing slash", () => {
        const root = { path: "/workspace/" } as any;
        const result = mergeDefaultFileMap(
            { relative: {}, rootScoped: { "B/": ["x.md"] } },
            root
        );
        expect(result).toEqual({ "workspace/B/": ["x.md"] });
    });
});

describe("buildFeaturesConfig", () => {
    it("should map enabledByDefault to enabled for each feature", () => {
        const features: BlueprintFeature[] = [{
            id: "decorations",
            name: "Decorations",
            description: "Badges",
            enabledByDefault: true,
            rules: [],
        }];
        const config = buildFeaturesConfig(features);
        expect(config.features).toEqual([{
            id: "decorations",
            name: "Decorations",
            description: "Badges",
            enabled: true,
        }]);
    });

    it("should return empty features array for empty input", () => {
        expect(buildFeaturesConfig([])).toEqual({ features: [] });
    });
});

describe("extractDecorationRules", () => {
    it("should return rules from the decorations feature", () => {
        const features: BlueprintFeature[] = [{
            id: "decorations",
            name: "D",
            description: "D",
            enabledByDefault: true,
            rules: [{ filter: "Folder/", color: "charts.green" }],
        }];
        expect(extractDecorationRules(features)).toEqual([{ filter: "Folder/", color: "charts.green" }]);
    });

    it("should return empty array when no decorations feature exists", () => {
        expect(extractDecorationRules([])).toEqual([]);
    });
});

describe("mergeFeaturesConfig", () => {
    const baseFeatures: BlueprintFeature[] = [{
        id: "decorations",
        name: "New Name",
        description: "New Desc",
        enabledByDefault: true,
        rules: [],
    }];

    it("should preserve user's enabled state for existing features", () => {
        const existing: FeaturesConfig = {
            features: [{ id: "decorations", name: "Old", description: "Old", enabled: false }],
        };
        const result = mergeFeaturesConfig(baseFeatures, existing);
        expect(result.features[0].enabled).toBe(false);
    });

    it("should update name and description from the new blueprint", () => {
        const existing: FeaturesConfig = {
            features: [{ id: "decorations", name: "Old", description: "Old", enabled: false }],
        };
        const result = mergeFeaturesConfig(baseFeatures, existing);
        expect(result.features[0].name).toBe("New Name");
        expect(result.features[0].description).toBe("New Desc");
    });

    it("should use enabledByDefault for new features not in existing config", () => {
        const result = mergeFeaturesConfig(baseFeatures, { features: [] });
        expect(result.features[0].enabled).toBe(true);
    });

    it("should drop features that no longer exist in the new blueprint", () => {
        const existing: FeaturesConfig = {
            features: [
                { id: "decorations", name: "D", description: "D", enabled: true },
                { id: "removed", name: "R", description: "R", enabled: true },
            ],
        };
        const result = mergeFeaturesConfig(baseFeatures, existing);
        expect(result.features).toHaveLength(1);
        expect(result.features[0].id).toBe("decorations");
    });

    it("should use enabledByDefault when existing config is null", () => {
        const result = mergeFeaturesConfig(baseFeatures, null);
        expect(result.features[0].enabled).toBe(true);
    });
});
