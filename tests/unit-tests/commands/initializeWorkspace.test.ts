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

const rootUri = { path: "/workspace" } as any;

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

    beforeEach(() => {
        vi.clearAllMocks();
        mockWorkspaceFolders.length = 0;
        mockEngine = { initialize: vi.fn().mockResolvedValue(undefined) };
        mockRegistry = { listBlueprints: vi.fn().mockResolvedValue([makeBlueprint("individual-contributor")]) };
        mockManifest = { isInitialized: vi.fn().mockResolvedValue(false) };
        mockTelemetry = { logUsage: vi.fn() };
    });

    it("should show an error message when no workspace folder is open", async () => {
        const handler = createInitializeWorkspaceCommand(mockEngine, mockRegistry, mockManifest, mockTelemetry);
        await handler();
        expect(mockShowErrorMessage).toHaveBeenCalledWith(expect.stringContaining("No workspace is open"));
    });

    it("should show an info message when the workspace is already initialized", async () => {
        mockWorkspaceFolders.push({ uri: rootUri });
        mockManifest.isInitialized.mockResolvedValue(true);

        const handler = createInitializeWorkspaceCommand(mockEngine, mockRegistry, mockManifest, mockTelemetry);
        await handler();

        expect(mockShowInformationMessage).toHaveBeenCalledWith(expect.stringContaining("already initialized"));
        expect(mockEngine.initialize).not.toHaveBeenCalled();
    });

    it("should show an error when no blueprints are found", async () => {
        mockWorkspaceFolders.push({ uri: rootUri });
        mockRegistry.listBlueprints.mockResolvedValue([]);

        const handler = createInitializeWorkspaceCommand(mockEngine, mockRegistry, mockManifest, mockTelemetry);
        await handler();

        expect(mockShowErrorMessage).toHaveBeenCalledWith(expect.stringContaining("No bundled blueprints"));
    });

    it("should show a QuickPick populated with blueprint names and descriptions", async () => {
        mockWorkspaceFolders.push({ uri: rootUri });
        mockShowQuickPick.mockResolvedValue(undefined); // User cancels

        const handler = createInitializeWorkspaceCommand(mockEngine, mockRegistry, mockManifest, mockTelemetry);
        await handler();

        expect(mockShowQuickPick).toHaveBeenCalledWith(
            expect.arrayContaining([
                expect.objectContaining({ label: "Blueprint individual-contributor", id: "individual-contributor" }),
            ]),
            expect.any(Object)
        );
    });

    it("should not call engine.initialize when the user cancels the QuickPick", async () => {
        mockWorkspaceFolders.push({ uri: rootUri });
        mockShowQuickPick.mockResolvedValue(undefined);

        const handler = createInitializeWorkspaceCommand(mockEngine, mockRegistry, mockManifest, mockTelemetry);
        await handler();

        expect(mockEngine.initialize).not.toHaveBeenCalled();
    });

    it("should call engine.initialize with the workspace root and selected blueprint id", async () => {
        mockWorkspaceFolders.push({ uri: rootUri });
        mockShowQuickPick.mockResolvedValue({ label: "Blueprint individual-contributor", id: "individual-contributor" });

        const handler = createInitializeWorkspaceCommand(mockEngine, mockRegistry, mockManifest, mockTelemetry);
        await handler();

        expect(mockEngine.initialize).toHaveBeenCalledWith(rootUri, "individual-contributor");
    });

    it("should emit a blueprint.init telemetry event after successful initialization", async () => {
        mockWorkspaceFolders.push({ uri: rootUri });
        mockShowQuickPick.mockResolvedValue({ label: "Blueprint individual-contributor", id: "individual-contributor" });

        const handler = createInitializeWorkspaceCommand(mockEngine, mockRegistry, mockManifest, mockTelemetry);
        await handler();

        expect(mockTelemetry.logUsage).toHaveBeenCalledWith("blueprint.init", { blueprintId: "individual-contributor" });
    });

    it("should show a success message after successful initialization", async () => {
        mockWorkspaceFolders.push({ uri: rootUri });
        mockShowQuickPick.mockResolvedValue({ label: "Blueprint individual-contributor", id: "individual-contributor" });

        const handler = createInitializeWorkspaceCommand(mockEngine, mockRegistry, mockManifest, mockTelemetry);
        await handler();

        expect(mockShowInformationMessage).toHaveBeenCalledWith(expect.stringContaining("initialized"));
    });

    it("should show an error message when engine.initialize throws", async () => {
        mockWorkspaceFolders.push({ uri: rootUri });
        mockShowQuickPick.mockResolvedValue({ label: "Blueprint individual-contributor", id: "individual-contributor" });
        mockEngine.initialize.mockRejectedValue(new Error("Disk full"));

        const handler = createInitializeWorkspaceCommand(mockEngine, mockRegistry, mockManifest, mockTelemetry);
        await handler();

        expect(mockShowErrorMessage).toHaveBeenCalledWith(expect.stringContaining("Disk full"));
        expect(mockTelemetry.logUsage).not.toHaveBeenCalled();
    });
});
