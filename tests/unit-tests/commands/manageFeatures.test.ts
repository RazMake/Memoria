import { describe, it, expect, vi, beforeEach } from "vitest";
import { createManageFeaturesCommand } from "../../../src/commands/manageFeatures";

const mockWorkspaceFolders: any[] = [];
const mockShowErrorMessage = vi.fn();
const mockShowQuickPick = vi.fn();

vi.mock("vscode", () => ({
    workspace: {
        get workspaceFolders() {
            return mockWorkspaceFolders;
        },
    },
    window: {
        showErrorMessage: (...args: any[]) => mockShowErrorMessage(...args),
        showQuickPick: (...args: any[]) => mockShowQuickPick(...args),
    },
}));

const workspaceRoot = { path: "/workspace" } as any;

describe("createManageFeaturesCommand", () => {
    let mockManifest: any;
    let mockTelemetry: any;
    let mockFeatureManager: any;

    beforeEach(() => {
        vi.clearAllMocks();
        mockWorkspaceFolders.length = 0;
        mockManifest = {
            isInitialized: vi.fn().mockResolvedValue(true),
            findInitializedRoot: vi.fn().mockResolvedValue(workspaceRoot),
            readFeatures: vi.fn().mockResolvedValue({
                features: [
                    { id: "decorations", name: "Explorer Decorations", description: "Badges and colors", enabled: true },
                ],
            }),
            writeFeatures: vi.fn().mockResolvedValue(undefined),
        };
        mockTelemetry = { logUsage: vi.fn() };
        mockFeatureManager = { refresh: vi.fn().mockResolvedValue(undefined) };
    });

    it("should show error when no workspace is open", async () => {
        const handler = createManageFeaturesCommand(mockManifest, mockTelemetry, mockFeatureManager);
        await handler();
        expect(mockShowErrorMessage).toHaveBeenCalledWith(expect.stringContaining("No workspace"));
    });

    it("should show error when workspace is not initialized", async () => {
        mockWorkspaceFolders.push({ uri: workspaceRoot });
        mockManifest.findInitializedRoot.mockResolvedValue(null);

        const handler = createManageFeaturesCommand(mockManifest, mockTelemetry, mockFeatureManager);
        await handler();
        expect(mockShowErrorMessage).toHaveBeenCalledWith(expect.stringContaining("not initialized"));
    });

    it("should show error when features.json is null", async () => {
        mockWorkspaceFolders.push({ uri: workspaceRoot });
        mockManifest.readFeatures.mockResolvedValue(null);

        const handler = createManageFeaturesCommand(mockManifest, mockTelemetry, mockFeatureManager);
        await handler();
        expect(mockShowErrorMessage).toHaveBeenCalledWith(expect.stringContaining("No features configured"));
    });

    it("should show QuickPick with features from features.json", async () => {
        mockWorkspaceFolders.push({ uri: workspaceRoot });
        mockShowQuickPick.mockResolvedValue(undefined); // user cancels

        const handler = createManageFeaturesCommand(mockManifest, mockTelemetry, mockFeatureManager);
        await handler();

        expect(mockShowQuickPick).toHaveBeenCalledWith(
            expect.arrayContaining([
                expect.objectContaining({
                    label: "Explorer Decorations",
                    description: "Badges and colors",
                    picked: true,
                    id: "decorations",
                }),
            ]),
            expect.objectContaining({ canPickMany: true })
        );
    });

    it("should do nothing when user cancels the QuickPick", async () => {
        mockWorkspaceFolders.push({ uri: workspaceRoot });
        mockShowQuickPick.mockResolvedValue(undefined);

        const handler = createManageFeaturesCommand(mockManifest, mockTelemetry, mockFeatureManager);
        await handler();

        expect(mockManifest.writeFeatures).not.toHaveBeenCalled();
        expect(mockFeatureManager.refresh).not.toHaveBeenCalled();
    });

    it("should write updated features.json and refresh when user confirms", async () => {
        mockWorkspaceFolders.push({ uri: workspaceRoot });
        // User unchecks decorations (selects nothing)
        mockShowQuickPick.mockResolvedValue([]);

        const handler = createManageFeaturesCommand(mockManifest, mockTelemetry, mockFeatureManager);
        await handler();

        expect(mockManifest.writeFeatures).toHaveBeenCalledWith(workspaceRoot, {
            features: [expect.objectContaining({ id: "decorations", enabled: false })],
        });
        expect(mockFeatureManager.refresh).toHaveBeenCalledWith(workspaceRoot);
    });

    it("should keep feature enabled when user leaves it checked", async () => {
        mockWorkspaceFolders.push({ uri: workspaceRoot });
        mockShowQuickPick.mockResolvedValue([
            { label: "Explorer Decorations", description: "Badges and colors", picked: true, id: "decorations" },
        ]);

        const handler = createManageFeaturesCommand(mockManifest, mockTelemetry, mockFeatureManager);
        await handler();

        expect(mockManifest.writeFeatures).toHaveBeenCalledWith(workspaceRoot, {
            features: [expect.objectContaining({ id: "decorations", enabled: true })],
        });
    });

    it("should log telemetry with enabled feature ids", async () => {
        mockWorkspaceFolders.push({ uri: workspaceRoot });
        mockShowQuickPick.mockResolvedValue([
            { label: "Explorer Decorations", id: "decorations" },
        ]);

        const handler = createManageFeaturesCommand(mockManifest, mockTelemetry, mockFeatureManager);
        await handler();

        expect(mockTelemetry.logUsage).toHaveBeenCalledWith("features.toggle", {
            enabled: "decorations",
        });
    });
});
