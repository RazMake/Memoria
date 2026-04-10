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
    workspace: [{ name: "Folder/", isFolder: true }],
    decorations: [{ filter: "Folder/", color: "charts.green" }],
};

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
            writeManifest: vi.fn().mockResolvedValue(undefined),
            writeDecorations: vi.fn().mockResolvedValue(undefined),
        };
        mockScaffold = {
            scaffoldTree: vi.fn().mockResolvedValue({ "Folder/file.md": "sha256:abc" }),
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
});
