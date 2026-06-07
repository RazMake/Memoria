import { describe, it, expect, vi, beforeEach } from "vitest";

const mockExecuteCommand = vi.fn();
const mockShowInformationMessage = vi.fn();
const mockShowErrorMessage = vi.fn();

vi.mock("vscode", () => ({
    commands: {
        executeCommand: (...args: unknown[]) => mockExecuteCommand(...args),
    },
    window: {
        showInformationMessage: (...args: unknown[]) => mockShowInformationMessage(...args),
        showErrorMessage: (...args: unknown[]) => mockShowErrorMessage(...args),
    },
}));

import { updateWorkspaceInitializedContext, checkForBlueprintUpdates, isNewerVersion } from "../../src/blueprintUpdateCheck";

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
        const mockOnReinitialized = vi.fn().mockResolvedValue(undefined);

        beforeEach(() => {
            mockManifest.readManifest.mockReset();
            mockRegistry.getBlueprintDefinition.mockReset();
            mockEngine.reinitialize.mockReset();
        });

        it("should return early when no initialized root", async () => {
            await checkForBlueprintUpdates(
                null, mockManifest as any, mockRegistry as any, mockEngine as any, mockResolver, mockOnReinitialized,
            );

            expect(mockManifest.readManifest).not.toHaveBeenCalled();
        });

        it("should return early when no stored manifest", async () => {
            const root = { path: "/workspace" } as any;
            mockManifest.readManifest.mockResolvedValue(null);

            await checkForBlueprintUpdates(
                root, mockManifest as any, mockRegistry as any, mockEngine as any, mockResolver, mockOnReinitialized,
            );

            expect(mockManifest.readManifest).toHaveBeenCalledWith(root);
            expect(mockRegistry.getBlueprintDefinition).not.toHaveBeenCalled();
        });

        it("returns silently when the blueprint id is no longer bundled", async () => {
            const root = { path: "/workspace" } as any;
            mockManifest.readManifest.mockResolvedValue({ blueprintId: "gone", blueprintVersion: "1.0.0" });
            mockRegistry.getBlueprintDefinition.mockRejectedValue(new Error("not found"));

            await checkForBlueprintUpdates(
                root, mockManifest as any, mockRegistry as any, mockEngine as any, mockResolver, mockOnReinitialized,
            );

            expect(mockShowInformationMessage).not.toHaveBeenCalled();
        });

        it("returns silently when the stored version is already current", async () => {
            const root = { path: "/workspace" } as any;
            mockManifest.readManifest.mockResolvedValue({ blueprintId: "bp", blueprintVersion: "2.0.0" });
            mockRegistry.getBlueprintDefinition.mockResolvedValue({ name: "BP", version: "2.0.0" });

            await checkForBlueprintUpdates(
                root, mockManifest as any, mockRegistry as any, mockEngine as any, mockResolver, mockOnReinitialized,
            );

            expect(mockShowInformationMessage).not.toHaveBeenCalled();
        });

        it("does not re-initialize when the user dismisses the prompt", async () => {
            const root = { path: "/workspace" } as any;
            mockManifest.readManifest.mockResolvedValue({ blueprintId: "bp", blueprintVersion: "1.0.0" });
            mockRegistry.getBlueprintDefinition.mockResolvedValue({ name: "BP", version: "2.0.0" });
            mockShowInformationMessage.mockResolvedValue("Later");

            await checkForBlueprintUpdates(
                root, mockManifest as any, mockRegistry as any, mockEngine as any, mockResolver, mockOnReinitialized,
            );

            expect(mockEngine.reinitialize).not.toHaveBeenCalled();
        });

        it("re-initializes and notifies on success when the user accepts", async () => {
            const root = { path: "/workspace" } as any;
            mockManifest.readManifest.mockResolvedValue({ blueprintId: "bp", blueprintVersion: "1.0.0" });
            mockRegistry.getBlueprintDefinition.mockResolvedValue({ name: "BP", version: "2.0.0" });
            mockShowInformationMessage.mockResolvedValue("Re-initialize");
            mockEngine.reinitialize.mockResolvedValue(undefined);

            await checkForBlueprintUpdates(
                root, mockManifest as any, mockRegistry as any, mockEngine as any, mockResolver, mockOnReinitialized,
            );

            expect(mockEngine.reinitialize).toHaveBeenCalledWith(root, "bp", mockResolver);
            expect(mockOnReinitialized).toHaveBeenCalledWith(root);
            expect(mockShowInformationMessage).toHaveBeenLastCalledWith(
                expect.stringContaining("re-initialized"),
            );
        });

        it("shows an error when re-initialization fails", async () => {
            const root = { path: "/workspace" } as any;
            mockManifest.readManifest.mockResolvedValue({ blueprintId: "bp", blueprintVersion: "1.0.0" });
            mockRegistry.getBlueprintDefinition.mockResolvedValue({ name: "BP", version: "2.0.0" });
            mockShowInformationMessage.mockResolvedValue("Re-initialize");
            mockEngine.reinitialize.mockRejectedValue(new Error("boom"));

            await checkForBlueprintUpdates(
                root, mockManifest as any, mockRegistry as any, mockEngine as any, mockResolver, mockOnReinitialized,
            );

            expect(mockShowErrorMessage).toHaveBeenCalledWith(
                expect.stringContaining("Re-initialization failed"),
            );
        });
    });

    describe("isNewerVersion", () => {
        it("compares the major version first", () => {
            expect(isNewerVersion("2.0.0", "1.9.9")).toBe(true);
            expect(isNewerVersion("1.0.0", "2.0.0")).toBe(false);
        });

        it("compares the minor version when majors match", () => {
            expect(isNewerVersion("1.2.0", "1.1.9")).toBe(true);
            expect(isNewerVersion("1.1.0", "1.2.0")).toBe(false);
        });

        it("compares the patch version when major and minor match", () => {
            expect(isNewerVersion("1.1.2", "1.1.1")).toBe(true);
            expect(isNewerVersion("1.1.1", "1.1.1")).toBe(false);
        });

        it("treats missing segments as zero", () => {
            expect(isNewerVersion("1.1", "1.0.9")).toBe(true);
            expect(isNewerVersion("1", "1.0.0")).toBe(false);
        });
    });
});
