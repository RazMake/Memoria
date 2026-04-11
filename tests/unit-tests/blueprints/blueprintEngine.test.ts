import { describe, it, expect, vi, beforeEach } from "vitest";
import { BlueprintEngine } from "../../../src/blueprints/blueprintEngine";
import type { BlueprintDefinition } from "../../../src/blueprints/types";

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
    decorations: [{ filter: "Folder/", color: "charts.green" }],
};

const managerDefinition: BlueprintDefinition = {
    id: "manager",
    name: "Manager Blueprint",
    description: "desc",
    version: "1.0.0",
    workspace: [{ name: "00-ToDo/", isFolder: true }],
    decorations: [],
};

const scaffoldResult = { fileManifest: { "Folder/file.md": "sha256:abc" }, skippedPaths: [] };

describe("BlueprintEngine", () => {
    const workspaceRoot = { path: "/workspace" } as any;

    let mockRegistry: any;
    let mockManifest: any;
    let mockScaffold: any;

    beforeEach(() => {
        vi.clearAllMocks();
        mockRegistry = {
            getBlueprintDefinition: vi.fn().mockResolvedValue(mockDefinition),
            getSeedFileContent: vi.fn().mockResolvedValue(null),
        };
        mockManifest = {
            readManifest: vi.fn().mockResolvedValue(null),
            writeManifest: vi.fn().mockResolvedValue(undefined),
            writeDecorations: vi.fn().mockResolvedValue(undefined),
            computeFileHash: vi.fn().mockReturnValue("sha256:current"),
        };
        mockScaffold = {
            scaffoldTree: vi.fn().mockResolvedValue(scaffoldResult),
            fs: {
                createDirectory: vi.fn().mockResolvedValue(undefined),
                rename: vi.fn().mockResolvedValue(undefined),
                readFile: vi.fn().mockResolvedValue(new Uint8Array(0)),
            },
        };
    });

    describe("initialize", () => {
        it("should call getBlueprintDefinition with the provided blueprint id", async () => {
            const engine = new BlueprintEngine(mockRegistry, mockManifest, mockScaffold);
            await engine.initialize(workspaceRoot, "individual-contributor");
            expect(mockRegistry.getBlueprintDefinition).toHaveBeenCalledWith("individual-contributor");
        });

        it("should call scaffoldTree with the workspace root and definition workspace entries", async () => {
            const engine = new BlueprintEngine(mockRegistry, mockManifest, mockScaffold);
            await engine.initialize(workspaceRoot, "individual-contributor");
            expect(mockScaffold.scaffoldTree).toHaveBeenCalledWith(
                workspaceRoot,
                mockDefinition.workspace,
                expect.any(Function)
            );
        });

        it("should write manifest to .memoria/blueprint.json after scaffolding", async () => {
            const engine = new BlueprintEngine(mockRegistry, mockManifest, mockScaffold);
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
            const engine = new BlueprintEngine(mockRegistry, mockManifest, mockScaffold);
            await engine.initialize(workspaceRoot, "individual-contributor");
            expect(mockManifest.writeDecorations).toHaveBeenCalledWith(workspaceRoot, {
                rules: mockDefinition.decorations,
            });
        });

        it("should write manifest before decorations (sequential ordering)", async () => {
            const callOrder: string[] = [];
            mockManifest.writeManifest.mockImplementation(async () => { callOrder.push("manifest"); });
            mockManifest.writeDecorations.mockImplementation(async () => { callOrder.push("decorations"); });

            const engine = new BlueprintEngine(mockRegistry, mockManifest, mockScaffold);
            await engine.initialize(workspaceRoot, "individual-contributor");

            expect(callOrder).toEqual(["manifest", "decorations"]);
        });

        it("should propagate errors thrown by the registry", async () => {
            mockRegistry.getBlueprintDefinition.mockRejectedValue(new Error("Blueprint not found"));
            const engine = new BlueprintEngine(mockRegistry, mockManifest, mockScaffold);
            await expect(engine.initialize(workspaceRoot, "unknown")).rejects.toThrow("Blueprint not found");
        });

        it("should propagate errors thrown by the scaffold", async () => {
            mockScaffold.scaffoldTree.mockRejectedValue(new Error("Disk write failed"));
            const engine = new BlueprintEngine(mockRegistry, mockManifest, mockScaffold);
            await expect(engine.initialize(workspaceRoot, "individual-contributor")).rejects.toThrow("Disk write failed");
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
                }),
                promptFileOverwrite: vi.fn(),
            };
        });

        it("should throw when no manifest exists (workspace not initialized)", async () => {
            mockManifest.readManifest.mockResolvedValue(null);
            const engine = new BlueprintEngine(mockRegistry, mockManifest, mockScaffold);
            await expect(engine.reinitialize(workspaceRoot, "individual-contributor", mockResolver)).rejects.toThrow(
                "no .memoria/blueprint.json"
            );
        });

        it("should call resolveConflicts with the current manifest and new definition", async () => {
            const engine = new BlueprintEngine(mockRegistry, mockManifest, mockScaffold);
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
            });
            const engine = new BlueprintEngine(mockRegistry, mockManifest, mockScaffold);
            await engine.reinitialize(workspaceRoot, "individual-contributor", mockResolver);
            expect(mockScaffold.fs.createDirectory).toHaveBeenCalled();
            expect(mockScaffold.fs.rename).toHaveBeenCalledWith(
                expect.objectContaining({ path: expect.stringContaining("OldFolder") }),
                expect.objectContaining({ path: expect.stringContaining("ReInitializationCleanup") }),
                { overwrite: false }
            );
        });

        it("should not rename anything when no folders need cleanup", async () => {
            const engine = new BlueprintEngine(mockRegistry, mockManifest, mockScaffold);
            await engine.reinitialize(workspaceRoot, "individual-contributor", mockResolver);
            expect(mockScaffold.fs.rename).not.toHaveBeenCalled();
        });

        it("should update manifest with new blueprintId and set lastReinitAt", async () => {
            const engine = new BlueprintEngine(mockRegistry, mockManifest, mockScaffold);
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
            });
            mockResolver.promptFileOverwrite.mockResolvedValue("yes");
            // Make the scaffold mock actually invoke the seed callback for the modified file,
            // so the engine's overwrite-prompt logic is exercised.
            mockScaffold.scaffoldTree.mockImplementation(async (_root: any, _entries: any, callback: any) => {
                await callback("Folder/file.md");
                return { fileManifest: { "Folder/file.md": "sha256:abc" }, skippedPaths: [] };
            });
            const engine = new BlueprintEngine(mockRegistry, mockManifest, mockScaffold);
            await engine.reinitialize(workspaceRoot, "individual-contributor", mockResolver);
            expect(mockResolver.promptFileOverwrite).toHaveBeenCalledWith("Folder/file.md");
        });

        it("should skip a file when the user chooses 'no' for overwrite", async () => {
            mockResolver.resolveConflicts.mockResolvedValue({
                foldersToCleanup: [],
                unmodifiedBlueprintFiles: [],
                modifiedBlueprintFiles: ["Folder/file.md"],
            });
            mockResolver.promptFileOverwrite.mockResolvedValue("no");
            mockScaffold.scaffoldTree.mockResolvedValue({
                fileManifest: {},
                skippedPaths: ["Folder/file.md"],
            });
            const engine = new BlueprintEngine(mockRegistry, mockManifest, mockScaffold);
            await engine.reinitialize(workspaceRoot, "individual-contributor", mockResolver);
            // Skipped file should appear in the final manifest with its current on-disk hash.
            expect(mockScaffold.fs.readFile).toHaveBeenCalled();
            const writtenManifest = mockManifest.writeManifest.mock.calls[0][1];
            expect(writtenManifest.fileManifest["Folder/file.md"]).toMatch(/^sha256:/);
        });

        it("should write updated decoration rules after reinit", async () => {
            const engine = new BlueprintEngine(mockRegistry, mockManifest, mockScaffold);
            await engine.reinitialize(workspaceRoot, "individual-contributor", mockResolver);
            expect(mockManifest.writeDecorations).toHaveBeenCalledWith(workspaceRoot, {
                rules: mockDefinition.decorations,
            });
        });

        it("should handle different-blueprint reinit by passing the new definition to resolveConflicts", async () => {
            mockManifest.readManifest.mockResolvedValue({
                ...existingManifest,
                blueprintId: "manager",
            });
            mockRegistry.getBlueprintDefinition.mockResolvedValue(mockDefinition);
            const engine = new BlueprintEngine(mockRegistry, mockManifest, mockScaffold);
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
            });
            mockResolver.promptFileOverwrite.mockResolvedValue("no");
            let callbackResult: any;
            mockScaffold.scaffoldTree.mockImplementation(async (_root: any, _entries: any, callback: any) => {
                callbackResult = await callback("Folder/file.md");
                return { fileManifest: {}, skippedPaths: ["Folder/file.md"] };
            });
            const engine = new BlueprintEngine(mockRegistry, mockManifest, mockScaffold);
            await engine.reinitialize(workspaceRoot, "individual-contributor", mockResolver);
            // SKIP_FILE is a Symbol — verify the callback returned it
            expect(typeof callbackResult).toBe("symbol");
        });

        it("should auto-overwrite subsequent files in the same folder after 'yes-folder'", async () => {
            mockResolver.resolveConflicts.mockResolvedValue({
                foldersToCleanup: [],
                unmodifiedBlueprintFiles: [],
                modifiedBlueprintFiles: ["Folder/a.md", "Folder/b.md"],
            });
            mockResolver.promptFileOverwrite.mockResolvedValue("yes-folder");
            mockRegistry.getSeedFileContent.mockResolvedValue(new Uint8Array([1]));
            mockScaffold.scaffoldTree.mockImplementation(async (_root: any, _entries: any, callback: any) => {
                await callback("Folder/a.md");
                await callback("Folder/b.md");
                return { fileManifest: { "Folder/a.md": "sha256:a", "Folder/b.md": "sha256:b" }, skippedPaths: [] };
            });
            const engine = new BlueprintEngine(mockRegistry, mockManifest, mockScaffold);
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
            });
            mockResolver.promptFileOverwrite.mockResolvedValue("yes-folder-recursive");
            mockRegistry.getSeedFileContent.mockResolvedValue(new Uint8Array([1]));
            mockScaffold.scaffoldTree.mockImplementation(async (_root: any, _entries: any, callback: any) => {
                await callback("Folder/a.md");
                await callback("Folder/sub/b.md");
                return { fileManifest: { "Folder/a.md": "sha256:a", "Folder/sub/b.md": "sha256:b" }, skippedPaths: [] };
            });
            const engine = new BlueprintEngine(mockRegistry, mockManifest, mockScaffold);
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
            });
            mockScaffold.scaffoldTree.mockResolvedValue({
                fileManifest: {},
                skippedPaths: ["Folder/deleted.md"],
            });
            mockScaffold.fs.readFile.mockRejectedValue(new Error("file not found"));
            const engine = new BlueprintEngine(mockRegistry, mockManifest, mockScaffold);
            await engine.reinitialize(workspaceRoot, "individual-contributor", mockResolver);
            const writtenManifest = mockManifest.writeManifest.mock.calls[0][1];
            expect(writtenManifest.fileManifest).not.toHaveProperty("Folder/deleted.md");
        });
    });
});
