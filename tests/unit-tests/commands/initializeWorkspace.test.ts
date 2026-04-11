import { describe, it, expect, vi, beforeEach } from "vitest";
import { createInitializeWorkspaceCommand } from "../../../src/commands/initializeWorkspace";

const mockShowErrorMessage = vi.fn();
const mockShowInformationMessage = vi.fn();
const mockShowQuickPick = vi.fn();
const mockWorkspaceFolders: any[] = [];

vi.mock("vscode", () => ({
    workspace: {
        get workspaceFolders() {
            return mockWorkspaceFolders;
        },
    },
    window: {
        showErrorMessage: (...args: any[]) => mockShowErrorMessage(...args),
        showInformationMessage: (...args: any[]) => mockShowInformationMessage(...args),
        showQuickPick: (...args: any[]) => mockShowQuickPick(...args),
    },
}));

const rootUri = { path: "/workspace", fsPath: "/workspace", toString: () => "file:///workspace" } as any;
const root2Uri = { path: "/workspace2", fsPath: "/workspace2", toString: () => "file:///workspace2" } as any;

const makeBlueprint = (id: string) => ({
    id,
    name: `Blueprint ${id}`,
    description: `Description for ${id}`,
    version: "1.0.0",
    path: { path: `/ext/resources/blueprints/${id}` } as any,
});

describe("createInitializeWorkspaceCommand", () => {
    let mockEngine: any;
    let mockRegistry: any;
    let mockManifest: any;
    let mockTelemetry: any;
    let mockResolver: any;
    let mockOnWorkspaceInitialized: any;

    const makeHandler = () =>
        createInitializeWorkspaceCommand(mockEngine, mockRegistry, mockManifest, mockTelemetry, mockResolver, mockOnWorkspaceInitialized);

    beforeEach(() => {
        vi.clearAllMocks();
        mockWorkspaceFolders.length = 0;
        mockEngine = {
            initialize: vi.fn().mockResolvedValue(undefined),
            reinitialize: vi.fn().mockResolvedValue(undefined),
        };
        mockRegistry = { listBlueprints: vi.fn().mockResolvedValue([makeBlueprint("individual-contributor")]) };
        mockManifest = {
            isInitialized: vi.fn().mockResolvedValue(false),
            findInitializedRoot: vi.fn().mockResolvedValue(null),
            deleteMemoriaDir: vi.fn().mockResolvedValue(undefined),
            backupMemoriaDir: vi.fn().mockResolvedValue([]),
        };
        mockTelemetry = { logUsage: vi.fn(), logError: vi.fn() };
        mockResolver = {};
        mockOnWorkspaceInitialized = vi.fn().mockResolvedValue(undefined);
    });

    describe("single-root workspace (Phase 1 behaviour)", () => {
        it("should show an error message when no workspace folder is open", async () => {
            await makeHandler()();
            expect(mockShowErrorMessage).toHaveBeenCalledWith(expect.stringContaining("No workspace is open"));
        });

        it("should show an error when no blueprints are found", async () => {
            mockWorkspaceFolders.push({ uri: rootUri, name: "workspace" });
            mockRegistry.listBlueprints.mockResolvedValue([]);
            await makeHandler()();
            expect(mockShowErrorMessage).toHaveBeenCalledWith(expect.stringContaining("No bundled blueprints"));
        });

        it("should show a QuickPick populated with blueprint names and descriptions", async () => {
            mockWorkspaceFolders.push({ uri: rootUri, name: "workspace" });
            mockShowQuickPick.mockResolvedValue(undefined); // User cancels
            await makeHandler()();
            expect(mockShowQuickPick).toHaveBeenCalledWith(
                expect.arrayContaining([
                    expect.objectContaining({ label: "Blueprint individual-contributor", id: "individual-contributor" }),
                ]),
                expect.any(Object)
            );
        });

        it("should not call engine.initialize or engine.reinitialize when the user cancels the QuickPick", async () => {
            mockWorkspaceFolders.push({ uri: rootUri, name: "workspace" });
            mockShowQuickPick.mockResolvedValue(undefined);
            await makeHandler()();
            expect(mockEngine.initialize).not.toHaveBeenCalled();
            expect(mockEngine.reinitialize).not.toHaveBeenCalled();
        });

        it("should call engine.initialize when workspace is not yet initialized", async () => {
            mockWorkspaceFolders.push({ uri: rootUri, name: "workspace" });
            mockShowQuickPick.mockResolvedValue({ label: "Blueprint individual-contributor", id: "individual-contributor" });
            mockManifest.isInitialized.mockResolvedValue(false);
            await makeHandler()();
            expect(mockEngine.initialize).toHaveBeenCalledWith(rootUri, "individual-contributor");
            expect(mockEngine.reinitialize).not.toHaveBeenCalled();
        });

        it("should emit a blueprint.init telemetry event after fresh initialization", async () => {
            mockWorkspaceFolders.push({ uri: rootUri, name: "workspace" });
            mockShowQuickPick.mockResolvedValue({ label: "Blueprint individual-contributor", id: "individual-contributor" });
            await makeHandler()();
            expect(mockTelemetry.logUsage).toHaveBeenCalledWith("blueprint.init", { blueprintId: "individual-contributor" });
        });

        it("should show a success message after fresh initialization", async () => {
            mockWorkspaceFolders.push({ uri: rootUri, name: "workspace" });
            mockShowQuickPick.mockResolvedValue({ label: "Blueprint individual-contributor", id: "individual-contributor" });
            await makeHandler()();
            expect(mockShowInformationMessage).toHaveBeenCalledWith(expect.stringContaining("initialized"));
        });

        it("should call onWorkspaceInitialized after fresh initialization", async () => {
            mockWorkspaceFolders.push({ uri: rootUri, name: "workspace" });
            mockShowQuickPick.mockResolvedValue({ label: "Blueprint individual-contributor", id: "individual-contributor" });
            await makeHandler()();
            expect(mockOnWorkspaceInitialized).toHaveBeenCalledOnce();
        });

        it("should not call onWorkspaceInitialized when user cancels the blueprint QuickPick", async () => {
            mockWorkspaceFolders.push({ uri: rootUri, name: "workspace" });
            mockShowQuickPick.mockResolvedValue(undefined);
            await makeHandler()();
            expect(mockOnWorkspaceInitialized).not.toHaveBeenCalled();
        });

        it("should not call onWorkspaceInitialized when engine.initialize throws", async () => {
            mockWorkspaceFolders.push({ uri: rootUri, name: "workspace" });
            mockShowQuickPick.mockResolvedValue({ label: "Blueprint individual-contributor", id: "individual-contributor" });
            mockEngine.initialize.mockRejectedValue(new Error("Disk full"));
            await makeHandler()();
            expect(mockOnWorkspaceInitialized).not.toHaveBeenCalled();
        });

        it("should show an error message when engine.initialize throws", async () => {
            mockWorkspaceFolders.push({ uri: rootUri, name: "workspace" });
            mockShowQuickPick.mockResolvedValue({ label: "Blueprint individual-contributor", id: "individual-contributor" });
            mockEngine.initialize.mockRejectedValue(new Error("Disk full"));
            await makeHandler()();
            expect(mockShowErrorMessage).toHaveBeenCalledWith(expect.stringContaining("Disk full"));
            expect(mockTelemetry.logUsage).not.toHaveBeenCalled();
        });
    });

    describe("re-initialization (already-initialized workspace)", () => {
        it("should call engine.reinitialize when workspace is already initialized", async () => {
            mockWorkspaceFolders.push({ uri: rootUri, name: "workspace" });
            mockManifest.isInitialized.mockResolvedValue(true);
            mockShowQuickPick.mockResolvedValue({ label: "Blueprint individual-contributor", id: "individual-contributor" });
            await makeHandler()();
            expect(mockEngine.reinitialize).toHaveBeenCalledWith(rootUri, "individual-contributor", mockResolver);
            expect(mockEngine.initialize).not.toHaveBeenCalled();
        });

        it("should emit blueprint.reinit telemetry after successful re-initialization", async () => {
            mockWorkspaceFolders.push({ uri: rootUri, name: "workspace" });
            mockManifest.isInitialized.mockResolvedValue(true);
            mockShowQuickPick.mockResolvedValue({ label: "Blueprint individual-contributor", id: "individual-contributor" });
            await makeHandler()();
            expect(mockTelemetry.logUsage).toHaveBeenCalledWith("blueprint.reinit", { blueprintId: "individual-contributor" });
        });

        it("should show a re-initialized success message after reinit", async () => {
            mockWorkspaceFolders.push({ uri: rootUri, name: "workspace" });
            mockManifest.isInitialized.mockResolvedValue(true);
            mockShowQuickPick.mockResolvedValue({ label: "Blueprint individual-contributor", id: "individual-contributor" });
            await makeHandler()();
            expect(mockShowInformationMessage).toHaveBeenCalledWith(expect.stringContaining("re-initialized"));
        });

        it("should call onWorkspaceInitialized after successful re-initialization", async () => {
            mockWorkspaceFolders.push({ uri: rootUri, name: "workspace" });
            mockManifest.isInitialized.mockResolvedValue(true);
            mockShowQuickPick.mockResolvedValue({ label: "Blueprint individual-contributor", id: "individual-contributor" });
            await makeHandler()();
            expect(mockOnWorkspaceInitialized).toHaveBeenCalledOnce();
        });

        it("should not call onWorkspaceInitialized when engine.reinitialize throws", async () => {
            mockWorkspaceFolders.push({ uri: rootUri, name: "workspace" });
            mockManifest.isInitialized.mockResolvedValue(true);
            mockShowQuickPick.mockResolvedValue({ label: "Blueprint individual-contributor", id: "individual-contributor" });
            mockEngine.reinitialize.mockRejectedValue(new Error("Conflict resolution failed"));
            await makeHandler()();
            expect(mockOnWorkspaceInitialized).not.toHaveBeenCalled();
        });

        it("should show an error message when engine.reinitialize throws", async () => {
            mockWorkspaceFolders.push({ uri: rootUri, name: "workspace" });
            mockManifest.isInitialized.mockResolvedValue(true);
            mockShowQuickPick.mockResolvedValue({ label: "Blueprint individual-contributor", id: "individual-contributor" });
            mockEngine.reinitialize.mockRejectedValue(new Error("Conflict resolution failed"));
            await makeHandler()();
            expect(mockShowErrorMessage).toHaveBeenCalledWith(expect.stringContaining("Conflict resolution failed"));
            expect(mockTelemetry.logUsage).not.toHaveBeenCalled();
        });
    });

    describe("multi-root workspace", () => {
        it("should show a root selection QuickPick when multiple workspace folders are open", async () => {
            mockWorkspaceFolders.push({ uri: rootUri, name: "workspace" });
            mockWorkspaceFolders.push({ uri: root2Uri, name: "workspace2" });
            // First QuickPick = root selection (user cancels)
            mockShowQuickPick.mockResolvedValue(undefined);
            await makeHandler()();
            expect(mockShowQuickPick).toHaveBeenCalledWith(
                expect.arrayContaining([
                    expect.objectContaining({ label: "workspace" }),
                    expect.objectContaining({ label: "workspace2" }),
                ]),
                expect.any(Object)
            );
        });

        it("should return without action when user cancels the root selection QuickPick", async () => {
            mockWorkspaceFolders.push({ uri: rootUri, name: "workspace" });
            mockWorkspaceFolders.push({ uri: root2Uri, name: "workspace2" });
            mockShowQuickPick.mockResolvedValue(undefined);
            await makeHandler()();
            expect(mockEngine.initialize).not.toHaveBeenCalled();
            expect(mockEngine.reinitialize).not.toHaveBeenCalled();
        });

        it("should initialize the selected root in a multi-root workspace", async () => {
            mockWorkspaceFolders.push({ uri: rootUri, name: "workspace" });
            mockWorkspaceFolders.push({ uri: root2Uri, name: "workspace2" });
            // First QuickPick = root selection
            mockShowQuickPick.mockResolvedValueOnce({ label: "workspace2", uri: root2Uri });
            // Second QuickPick = blueprint selection
            mockShowQuickPick.mockResolvedValueOnce({ label: "Blueprint individual-contributor", id: "individual-contributor" });
            await makeHandler()();
            expect(mockEngine.initialize).toHaveBeenCalledWith(root2Uri, "individual-contributor");
        });

        it("should delete .memoria from the old root when initializing a different root", async () => {
            mockWorkspaceFolders.push({ uri: rootUri, name: "workspace" });
            mockWorkspaceFolders.push({ uri: root2Uri, name: "workspace2" });
            mockManifest.findInitializedRoot.mockResolvedValue(rootUri); // Root A is initialized
            // First QuickPick = root selection (pick Root B)
            mockShowQuickPick.mockResolvedValueOnce({ label: "workspace2", uri: root2Uri });
            // Second QuickPick = blueprint selection
            mockShowQuickPick.mockResolvedValueOnce({ label: "Blueprint individual-contributor", id: "individual-contributor" });
            await makeHandler()();
            expect(mockManifest.deleteMemoriaDir).toHaveBeenCalledWith(rootUri);
        });

        it("should back up .memoria from old root to new root before deleting", async () => {
            mockWorkspaceFolders.push({ uri: rootUri, name: "workspace" });
            mockWorkspaceFolders.push({ uri: root2Uri, name: "workspace2" });
            mockManifest.findInitializedRoot.mockResolvedValue(rootUri);
            mockShowQuickPick.mockResolvedValueOnce({ label: "workspace2", uri: root2Uri });
            mockShowQuickPick.mockResolvedValueOnce({ label: "Blueprint individual-contributor", id: "individual-contributor" });
            await makeHandler()();
            expect(mockManifest.backupMemoriaDir).toHaveBeenCalledWith(rootUri, root2Uri);
            // backupMemoriaDir should be called before deleteMemoriaDir
            const backupOrder = mockManifest.backupMemoriaDir.mock.invocationCallOrder[0];
            const deleteOrder = mockManifest.deleteMemoriaDir.mock.invocationCallOrder[0];
            expect(backupOrder).toBeLessThan(deleteOrder);
        });

        it("should log telemetry error when .memoria backup has failed paths", async () => {
            mockWorkspaceFolders.push({ uri: rootUri, name: "workspace" });
            mockWorkspaceFolders.push({ uri: root2Uri, name: "workspace2" });
            mockManifest.findInitializedRoot.mockResolvedValue(rootUri);
            mockManifest.backupMemoriaDir.mockResolvedValue(["custom.json"]);
            mockShowQuickPick.mockResolvedValueOnce({ label: "workspace2", uri: root2Uri });
            mockShowQuickPick.mockResolvedValueOnce({ label: "Blueprint individual-contributor", id: "individual-contributor" });
            await makeHandler()();
            expect(mockTelemetry.logError).toHaveBeenCalledWith("reinit.memoriaBackupFailed", {
                failedPaths: "custom.json",
            });
        });

        it("should not log telemetry error when .memoria backup succeeds fully", async () => {
            mockWorkspaceFolders.push({ uri: rootUri, name: "workspace" });
            mockWorkspaceFolders.push({ uri: root2Uri, name: "workspace2" });
            mockManifest.findInitializedRoot.mockResolvedValue(rootUri);
            mockManifest.backupMemoriaDir.mockResolvedValue([]);
            mockShowQuickPick.mockResolvedValueOnce({ label: "workspace2", uri: root2Uri });
            mockShowQuickPick.mockResolvedValueOnce({ label: "Blueprint individual-contributor", id: "individual-contributor" });
            await makeHandler()();
            expect(mockTelemetry.logError).not.toHaveBeenCalled();
        });

        it("should not delete .memoria when re-initializing the same root", async () => {
            mockWorkspaceFolders.push({ uri: rootUri, name: "workspace" });
            mockWorkspaceFolders.push({ uri: root2Uri, name: "workspace2" });
            mockManifest.findInitializedRoot.mockResolvedValue(rootUri); // Root A is initialized
            mockManifest.isInitialized.mockResolvedValue(true);
            // First QuickPick = root selection (pick Root A — same root)
            mockShowQuickPick.mockResolvedValueOnce({ label: "workspace", uri: rootUri });
            // Second QuickPick = blueprint selection
            mockShowQuickPick.mockResolvedValueOnce({ label: "Blueprint individual-contributor", id: "individual-contributor" });
            await makeHandler()();
            expect(mockManifest.deleteMemoriaDir).not.toHaveBeenCalled();
        });

        it("should not attempt cleanup when no root is initialized", async () => {
            mockWorkspaceFolders.push({ uri: rootUri, name: "workspace" });
            mockWorkspaceFolders.push({ uri: root2Uri, name: "workspace2" });
            mockManifest.findInitializedRoot.mockResolvedValue(null);
            mockShowQuickPick.mockResolvedValueOnce({ label: "workspace2", uri: root2Uri });
            mockShowQuickPick.mockResolvedValueOnce({ label: "Blueprint individual-contributor", id: "individual-contributor" });
            await makeHandler()();
            expect(mockManifest.deleteMemoriaDir).not.toHaveBeenCalled();
        });

        it("should not attempt cross-root cleanup in single-root workspace", async () => {
            mockWorkspaceFolders.push({ uri: rootUri, name: "workspace" });
            mockShowQuickPick.mockResolvedValueOnce({ label: "Blueprint individual-contributor", id: "individual-contributor" });
            await makeHandler()();
            expect(mockManifest.findInitializedRoot).not.toHaveBeenCalled();
            expect(mockManifest.deleteMemoriaDir).not.toHaveBeenCalled();
        });
    });
});
