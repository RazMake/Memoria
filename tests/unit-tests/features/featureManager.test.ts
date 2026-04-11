import { describe, it, expect, vi, beforeEach } from "vitest";
import { FeatureManager } from "../../../src/features/featureManager";

vi.mock("vscode", () => ({}));

const mockReadFeatures = vi.fn<any, any>();

const makeManifest = () =>
    ({
        readFeatures: mockReadFeatures,
    }) as any;

const workspaceRoot = { path: "/workspace" } as any;

describe("FeatureManager", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe("refresh", () => {
        it("should call registered callback with (root, true) when feature is enabled", async () => {
            mockReadFeatures.mockResolvedValue({
                features: [{ id: "decorations", name: "D", description: "D", enabled: true }],
            });

            const callback = vi.fn().mockResolvedValue(undefined);
            const manager = new FeatureManager(makeManifest());
            manager.register("decorations", callback);

            await manager.refresh(workspaceRoot);

            expect(callback).toHaveBeenCalledWith(workspaceRoot, true);
        });

        it("should call registered callback with (root, false) when feature is disabled", async () => {
            mockReadFeatures.mockResolvedValue({
                features: [{ id: "decorations", name: "D", description: "D", enabled: false }],
            });

            const callback = vi.fn().mockResolvedValue(undefined);
            const manager = new FeatureManager(makeManifest());
            manager.register("decorations", callback);

            await manager.refresh(workspaceRoot);

            expect(callback).toHaveBeenCalledWith(workspaceRoot, false);
        });

        it("should call all callbacks with (null, false) when root is null", async () => {
            const callback = vi.fn().mockResolvedValue(undefined);
            const manager = new FeatureManager(makeManifest());
            manager.register("decorations", callback);

            await manager.refresh(null);

            expect(callback).toHaveBeenCalledWith(null, false);
            expect(mockReadFeatures).not.toHaveBeenCalled();
        });

        it("should call all callbacks with (root, false) when features.json is missing", async () => {
            mockReadFeatures.mockResolvedValue(null);

            const callback = vi.fn().mockResolvedValue(undefined);
            const manager = new FeatureManager(makeManifest());
            manager.register("decorations", callback);

            await manager.refresh(workspaceRoot);

            expect(callback).toHaveBeenCalledWith(workspaceRoot, false);
        });

        it("should treat registered feature not in features.json as disabled", async () => {
            mockReadFeatures.mockResolvedValue({ features: [] });

            const callback = vi.fn().mockResolvedValue(undefined);
            const manager = new FeatureManager(makeManifest());
            manager.register("decorations", callback);

            await manager.refresh(workspaceRoot);

            expect(callback).toHaveBeenCalledWith(workspaceRoot, false);
        });

        it("should silently ignore feature IDs in features.json with no registered callback", async () => {
            mockReadFeatures.mockResolvedValue({
                features: [{ id: "unknown", name: "U", description: "U", enabled: true }],
            });

            const manager = new FeatureManager(makeManifest());
            // No callback registered for "unknown" — should not throw.
            await expect(manager.refresh(workspaceRoot)).resolves.toBeUndefined();
        });

        it("should call multiple registered callbacks in parallel", async () => {
            mockReadFeatures.mockResolvedValue({
                features: [
                    { id: "decorations", name: "D", description: "D", enabled: true },
                    { id: "other", name: "O", description: "O", enabled: false },
                ],
            });

            const cb1 = vi.fn().mockResolvedValue(undefined);
            const cb2 = vi.fn().mockResolvedValue(undefined);
            const manager = new FeatureManager(makeManifest());
            manager.register("decorations", cb1);
            manager.register("other", cb2);

            await manager.refresh(workspaceRoot);

            expect(cb1).toHaveBeenCalledWith(workspaceRoot, true);
            expect(cb2).toHaveBeenCalledWith(workspaceRoot, false);
        });
    });
});
