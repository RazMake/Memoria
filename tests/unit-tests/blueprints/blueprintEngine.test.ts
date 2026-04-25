import { describe, it, expect, vi, beforeEach } from "vitest";
import { BlueprintEngine, buildFeaturesConfig, buildSeedSourceMap, extractContactsFeature, extractDecorationRules, mergeFeaturesConfig, mergeDefaultFileMap } from "../../../src/blueprints/blueprintEngine";
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

const scaffoldResult = { fileManifest: { "Folder/file.md": "sha256:abc" } };

const taskCollectorDefinition: BlueprintDefinition = {
    ...mockDefinition,
    features: [
        ...mockDefinition.features,
        {
            id: "taskCollector",
            name: "Task Collector",
            description: "Sync Markdown tasks",
            enabledByDefault: true,
            collectorPath: "00-Tasks/All-Tasks.md",
            config: {
                completedRetentionDays: 7,
                syncOnStartup: true,
                include: ["**/*.md"],
                exclude: ["**/.memoria/**"],
                debounceMs: 300,
            },
        },
    ],
};

const contactsFeature = {
    id: "contacts" as const,
    name: "Contacts",
    description: "Browse and manage colleagues.",
    enabledByDefault: true,
    peopleFolder: "05-Contacts/",
    groups: [{ file: "Colleagues.md", type: "colleague" as const }],
};

const contactsDefinition: BlueprintDefinition = {
    ...mockDefinition,
    features: [
        ...mockDefinition.features,
        contactsFeature,
    ],
};

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
            getSharedSeedContent: vi.fn().mockResolvedValue(null),
        };
        mockManifest = {
            readManifest: vi.fn().mockResolvedValue(null),
            writeManifest: vi.fn().mockResolvedValue(undefined),
            writeDefaultFiles: vi.fn().mockResolvedValue(undefined),
            writeDecorations: vi.fn().mockResolvedValue(undefined),
            writeFeatures: vi.fn().mockResolvedValue(undefined),
            writeTaskCollectorConfig: vi.fn().mockResolvedValue(undefined),
            readFeatures: vi.fn().mockResolvedValue(null),
            backupMemoriaDir: vi.fn().mockResolvedValue([]),
            deleteTaskIndex: vi.fn().mockResolvedValue(undefined),
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
                { "Folder/": { filesToOpen: ["file.md"] } }
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
                { "A/": { filesToOpen: ["shared.md"] }, "workspace/A/": { filesToOpen: ["local.md"] } }
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

        it("should invoke the seed callback with the relative path to fetch file content", async () => {
            // The seed callback lambda body (line 38) must be executed — set up scaffoldTree to call it.
            const seedContent = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
            mockRegistry.getSeedFileContent.mockResolvedValue(seedContent);
            let capturedCallback: ((path: string) => Promise<any>) | undefined;
            mockScaffold.scaffoldTree.mockImplementation(async (_root: any, _entries: any, callback: any) => {
                capturedCallback = callback;
                const result = await callback("Folder/file.md");
                return { fileManifest: { "Folder/file.md": "sha256:abc" } };
            });

            const engine = new BlueprintEngine(mockRegistry, mockManifest, mockScaffold, mockFs, mockTelemetry);
            await engine.initialize(workspaceRoot, "individual-contributor");

            expect(mockRegistry.getSeedFileContent).toHaveBeenCalledWith("individual-contributor", "Folder/file.md");
        });

        it("should use getSharedSeedContent for entries with seedSource", async () => {
            const sharedContent = new Uint8Array([83, 104, 97, 114, 101, 100]); // "Shared"
            mockRegistry.getSharedSeedContent.mockResolvedValue(sharedContent);

            const definitionWithSeedSource: BlueprintDefinition = {
                ...mockDefinition,
                workspace: [
                    { name: "Folder/", isFolder: true, children: [
                        { name: "file.md", isFolder: false, seedSource: "shared/file.md" },
                    ] },
                ],
            };
            mockRegistry.getBlueprintDefinition.mockResolvedValue(definitionWithSeedSource);

            mockScaffold.scaffoldTree.mockImplementation(async (_root: any, _entries: any, callback: any) => {
                await callback("Folder/file.md");
                return { fileManifest: { "Folder/file.md": "sha256:abc" } };
            });

            const engine = new BlueprintEngine(mockRegistry, mockManifest, mockScaffold, mockFs, mockTelemetry);
            await engine.initialize(workspaceRoot, "individual-contributor");

            expect(mockRegistry.getSharedSeedContent).toHaveBeenCalledWith("shared/file.md");
            expect(mockRegistry.getSeedFileContent).not.toHaveBeenCalled();
        });

        it("should write task collector config and collector path when the blueprint defines the feature", async () => {
            mockRegistry.getBlueprintDefinition.mockResolvedValue(taskCollectorDefinition);
            const engine = new BlueprintEngine(mockRegistry, mockManifest, mockScaffold, mockFs, mockTelemetry);

            await engine.initialize(workspaceRoot, "individual-contributor");

            expect(mockManifest.writeTaskCollectorConfig).toHaveBeenCalledWith(
                workspaceRoot,
                taskCollectorDefinition.features[1].config
            );
            expect(mockManifest.writeManifest).toHaveBeenCalledWith(
                workspaceRoot,
                expect.objectContaining({
                    taskCollector: { collectorPath: "00-Tasks/All-Tasks.md" },
                })
            );
        });

        it("should write contacts config into the manifest when the blueprint defines the feature", async () => {
            mockRegistry.getBlueprintDefinition.mockResolvedValue(contactsDefinition);
            const engine = new BlueprintEngine(mockRegistry, mockManifest, mockScaffold, mockFs, mockTelemetry);

            await engine.initialize(workspaceRoot, "individual-contributor");

            expect(mockManifest.writeManifest).toHaveBeenCalledWith(
                workspaceRoot,
                expect.objectContaining({
                    contacts: {
                        peopleFolder: "05-Contacts/",
                        groups: [{ file: "Colleagues.md", type: "colleague" }],
                    },
                })
            );
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
                    extraFolders: [],
                    foldersToCleanup: [],
                    toMergeList: [],
                    filesToDiff: [],
                }),
                openDiffEditors: vi.fn().mockResolvedValue(undefined),
            };
        });

        it("should throw when no manifest exists (workspace not initialized)", async () => {
            mockManifest.readManifest.mockResolvedValue(null);
            const engine = new BlueprintEngine(mockRegistry, mockManifest, mockScaffold, mockFs, mockTelemetry);
            await expect(engine.reinitialize(workspaceRoot, "individual-contributor", mockResolver)).rejects.toThrow(
                "no .memoria/blueprint.json"
            );
        });

        it("should call resolveConflicts with the current manifest, new definition, and seed callback", async () => {
            const engine = new BlueprintEngine(mockRegistry, mockManifest, mockScaffold, mockFs, mockTelemetry);
            await engine.reinitialize(workspaceRoot, "individual-contributor", mockResolver);
            expect(mockResolver.resolveConflicts).toHaveBeenCalledWith(
                workspaceRoot,
                existingManifest,
                mockDefinition,
                expect.any(Function)
            );
        });

        it("should return early without scaffolding when resolveConflicts returns undefined (user cancelled)", async () => {
            mockResolver.resolveConflicts.mockResolvedValue(undefined);
            const engine = new BlueprintEngine(mockRegistry, mockManifest, mockScaffold, mockFs, mockTelemetry);
            await engine.reinitialize(workspaceRoot, "individual-contributor", mockResolver);
            expect(mockScaffold.scaffoldTree).not.toHaveBeenCalled();
            expect(mockManifest.writeManifest).not.toHaveBeenCalled();
        });

        it("should move cleanup folders to WorkspaceInitializationBackups/ via fs.rename", async () => {
            mockResolver.resolveConflicts.mockResolvedValue({
                extraFolders: ["OldFolder"],
                foldersToCleanup: ["OldFolder"],
                toMergeList: [],
                filesToDiff: [],
            });
            const engine = new BlueprintEngine(mockRegistry, mockManifest, mockScaffold, mockFs, mockTelemetry);
            await engine.reinitialize(workspaceRoot, "individual-contributor", mockResolver);
            expect(mockFs.createDirectory).toHaveBeenCalled();
            expect(mockFs.rename).toHaveBeenCalledWith(
                expect.objectContaining({ path: expect.stringContaining("OldFolder") }),
                expect.objectContaining({ path: expect.stringContaining("WorkspaceInitializationBackups") }),
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

        it("should scaffold all blueprint files unconditionally (no skip logic)", async () => {
            const engine = new BlueprintEngine(mockRegistry, mockManifest, mockScaffold, mockFs, mockTelemetry);
            await engine.reinitialize(workspaceRoot, "individual-contributor", mockResolver);
            expect(mockScaffold.scaffoldTree).toHaveBeenCalledWith(
                workspaceRoot,
                mockDefinition.workspace,
                expect.any(Function)
            );
        });

        it("should call openDiffEditors with filesToDiff and cleanupRoot after reinit", async () => {
            mockResolver.resolveConflicts.mockResolvedValue({
                extraFolders: [],
                foldersToCleanup: [],
                toMergeList: ["Folder/file.md"],
                filesToDiff: ["Folder/file.md"],
            });
            const engine = new BlueprintEngine(mockRegistry, mockManifest, mockScaffold, mockFs, mockTelemetry);
            await engine.reinitialize(workspaceRoot, "individual-contributor", mockResolver);
            expect(mockResolver.openDiffEditors).toHaveBeenCalledWith(
                workspaceRoot,
                expect.objectContaining({ path: expect.stringContaining("WorkspaceInitializationBackups") }),
                ["Folder/file.md"]
            );
        });

        it("should not call openDiffEditors when filesToDiff is empty", async () => {
            const engine = new BlueprintEngine(mockRegistry, mockManifest, mockScaffold, mockFs, mockTelemetry);
            await engine.reinitialize(workspaceRoot, "individual-contributor", mockResolver);
            expect(mockResolver.openDiffEditors).not.toHaveBeenCalled();
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
            // resolveConflicts receives the NEW definition; WorkspaceInitConflictResolver handles
            // the different-blueprint detection internally.
            expect(mockResolver.resolveConflicts).toHaveBeenCalledWith(
                workspaceRoot,
                expect.objectContaining({ blueprintId: "manager" }),
                mockDefinition,
                expect.any(Function)
            );
        });

        it("should write updated manifest with fileManifest from scaffoldTree", async () => {
            const engine = new BlueprintEngine(mockRegistry, mockManifest, mockScaffold, mockFs, mockTelemetry);
            await engine.reinitialize(workspaceRoot, "individual-contributor", mockResolver);
            const writtenManifest = mockManifest.writeManifest.mock.calls[0][1];
            expect(writtenManifest.fileManifest).toEqual({ "Folder/file.md": "sha256:abc" });
        });

        it("should write manifest with only files actually written by scaffoldTree", async () => {
            mockScaffold.scaffoldTree.mockResolvedValue({ fileManifest: {} });
            const engine = new BlueprintEngine(mockRegistry, mockManifest, mockScaffold, mockFs, mockTelemetry);
            await engine.reinitialize(workspaceRoot, "individual-contributor", mockResolver);
            const writtenManifest = mockManifest.writeManifest.mock.calls[0][1];
            expect(writtenManifest.fileManifest).toEqual({});
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
                { "Folder/": { filesToOpen: ["file.md"] } }
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

        it("should back up .memoria and reset tasks-index during reinit", async () => {
            mockRegistry.getBlueprintDefinition.mockResolvedValue(taskCollectorDefinition);
            const engine = new BlueprintEngine(mockRegistry, mockManifest, mockScaffold, mockFs, mockTelemetry);

            await engine.reinitialize(workspaceRoot, "individual-contributor", mockResolver);

            expect(mockManifest.backupMemoriaDir).toHaveBeenCalledWith(workspaceRoot, workspaceRoot);
            expect(mockManifest.deleteTaskIndex).toHaveBeenCalledWith(workspaceRoot);
            expect(mockManifest.writeTaskCollectorConfig).toHaveBeenCalledWith(
                workspaceRoot,
                taskCollectorDefinition.features[1].config
            );
        });

        it("should write contacts config into the updated manifest during reinit", async () => {
            mockRegistry.getBlueprintDefinition.mockResolvedValue(contactsDefinition);
            const engine = new BlueprintEngine(mockRegistry, mockManifest, mockScaffold, mockFs, mockTelemetry);

            await engine.reinitialize(workspaceRoot, "individual-contributor", mockResolver);

            expect(mockManifest.writeManifest).toHaveBeenCalledWith(
                workspaceRoot,
                expect.objectContaining({
                    contacts: {
                        peopleFolder: "05-Contacts/",
                        groups: [{ file: "Colleagues.md", type: "colleague" }],
                    },
                })
            );
        });

    });
});

describe("extractContactsFeature", () => {
    it("should return the contacts feature when present", () => {
        expect(extractContactsFeature(contactsDefinition.features)).toEqual(contactsFeature);
    });

    it("should return null when the blueprint has no contacts feature", () => {
        expect(extractContactsFeature(mockDefinition.features)).toBeNull();
    });
});

describe("mergeDefaultFileMap", () => {
    it("should return relative entries as DefaultFilesEntry objects", () => {
        const root = { path: "/workspace" } as any;
        const result = mergeDefaultFileMap(
            { relative: { "A/": ["f.md"] }, rootScoped: {} },
            root
        );
        expect(result).toEqual({ "A/": { filesToOpen: ["f.md"] } });
    });

    it("should prefix rootScoped entries with root folder name", () => {
        const root = { path: "/workspace" } as any;
        const result = mergeDefaultFileMap(
            { relative: {}, rootScoped: { "A/": ["f.md"] } },
            root
        );
        expect(result).toEqual({ "workspace/A/": { filesToOpen: ["f.md"] } });
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
            "A/": { filesToOpen: ["shared.md"] },
            "my-project/A/": { filesToOpen: ["local.md"] },
        });
    });

    it("should handle root path with trailing slash", () => {
        const root = { path: "/workspace/" } as any;
        const result = mergeDefaultFileMap(
            { relative: {}, rootScoped: { "B/": ["x.md"] } },
            root
        );
        expect(result).toEqual({ "workspace/B/": { filesToOpen: ["x.md"] } });
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

describe("buildSeedSourceMap", () => {
    it("should return an empty map when no entries have seedSource", () => {
        const entries = [
            { name: "Folder/", isFolder: true, children: [{ name: "file.md", isFolder: false }] },
        ];
        const map = buildSeedSourceMap(entries);
        expect(map.size).toBe(0);
    });

    it("should map relative path to seedSource for file entries", () => {
        const entries = [
            { name: "Folder/", isFolder: true, children: [
                { name: "file.md", isFolder: false, seedSource: "shared/file.md" },
            ] },
        ];
        const map = buildSeedSourceMap(entries);
        expect(map.get("Folder/file.md")).toBe("shared/file.md");
    });

    it("should handle deeply nested entries", () => {
        const entries = [
            { name: "A/", isFolder: true, children: [
                { name: "B/", isFolder: true, children: [
                    { name: "deep.md", isFolder: false, seedSource: "shared/deep.md" },
                ] },
            ] },
        ];
        const map = buildSeedSourceMap(entries);
        expect(map.get("A/B/deep.md")).toBe("shared/deep.md");
    });

    it("should include only entries with seedSource", () => {
        const entries = [
            { name: "Folder/", isFolder: true, children: [
                { name: "shared.md", isFolder: false, seedSource: "shared/file.md" },
                { name: "local.md", isFolder: false },
            ] },
        ];
        const map = buildSeedSourceMap(entries);
        expect(map.size).toBe(1);
        expect(map.has("Folder/shared.md")).toBe(true);
        expect(map.has("Folder/local.md")).toBe(false);
    });

    it("should handle multiple seedSource entries across the tree", () => {
        const entries = [
            { name: "A/", isFolder: true, children: [
                { name: "f1.md", isFolder: false, seedSource: "shared/f1.md" },
            ] },
            { name: "B/", isFolder: true, children: [
                { name: "f2.md", isFolder: false, seedSource: "shared/f2.md" },
            ] },
        ];
        const map = buildSeedSourceMap(entries);
        expect(map.size).toBe(2);
        expect(map.get("A/f1.md")).toBe("shared/f1.md");
        expect(map.get("B/f2.md")).toBe("shared/f2.md");
    });
});
