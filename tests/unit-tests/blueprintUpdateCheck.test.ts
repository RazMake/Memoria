import { describe, it, expect, vi, beforeEach } from "vitest";

const mockExecuteCommand = vi.fn();
const mockShowInformationMessage = vi.fn();

vi.mock("vscode", () => ({
    commands: {
        executeCommand: (...args: unknown[]) => mockExecuteCommand(...args),
    },
    window: {
        showInformationMessage: (...args: unknown[]) => mockShowInformationMessage(...args),
        showErrorMessage: vi.fn(),
    },
}));

import { updateWorkspaceInitializedContext, checkForBlueprintUpdates } from "../../src/blueprintUpdateCheck";

describe("blueprintUpdateCheck", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe("updateWorkspaceInitializedContext", () => {
        it("should call setContext with true when root is provided", async () => {
            const root = { path: "/workspace" } as any;
            mockExecuteCommand.mockResolvedValue(undefined);

            await updateWorkspaceInitializedContext(root);

            expect(mockExecuteCommand).toHaveBeenCalledWith(
                "setContext",
                "memoria.workspaceInitialized",
                true,
            );
        });

        it("should call setContext with false when root is null", async () => {
            mockExecuteCommand.mockResolvedValue(undefined);

            await updateWorkspaceInitializedContext(null);

            expect(mockExecuteCommand).toHaveBeenCalledWith(
                "setContext",
                "memoria.workspaceInitialized",
                false,
            );
        });
    });

    describe("checkForBlueprintUpdates", () => {
        const mockManifest = { readManifest: vi.fn() };
        const mockRegistry = { getBlueprintDefinition: vi.fn() };
        const mockEngine = { reinitialize: vi.fn() };
        const mockResolver = {} as any;
        const mockFeatureManager = { refresh: vi.fn() } as any;

        beforeEach(() => {
            mockManifest.readManifest.mockReset();
            mockRegistry.getBlueprintDefinition.mockReset();
            mockEngine.reinitialize.mockReset();
        });

        it("should return early when no initialized root", async () => {
            await checkForBlueprintUpdates(
                null, mockManifest as any, mockRegistry as any, mockEngine as any, mockResolver, mockFeatureManager,
            );

            expect(mockManifest.readManifest).not.toHaveBeenCalled();
        });

        it("should return early when no stored manifest", async () => {
            const root = { path: "/workspace" } as any;
            mockManifest.readManifest.mockResolvedValue(null);

            await checkForBlueprintUpdates(
                root, mockManifest as any, mockRegistry as any, mockEngine as any, mockResolver, mockFeatureManager,
            );

            expect(mockManifest.readManifest).toHaveBeenCalledWith(root);
            expect(mockRegistry.getBlueprintDefinition).not.toHaveBeenCalled();
        });
    });
});
