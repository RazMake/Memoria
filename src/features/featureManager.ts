// Lightweight coordinator that connects feature toggle state (.memoria/features.json)
// with feature implementations.
//
// WHY FeatureManager exists: it decouples extension.ts from knowing which specific
// features exist. Each feature registers a lifecycle callback once during activation;
// FeatureManager reads the persisted features.json config and dispatches enable/disable
// to each callback, so adding a new feature requires no changes to extension.ts.

import * as vscode from "vscode";
import type { ManifestManager } from "../blueprints/manifestManager";

type FeatureRefreshFn = (root: vscode.Uri | null, enabled: boolean) => Promise<void>;

export class FeatureManager {
    private readonly callbacks = new Map<string, FeatureRefreshFn>();

    constructor(private readonly manifest: ManifestManager) {}

    /** Registers a feature callback. Called once during activation for each known feature. */
    register(featureId: string, refreshFn: FeatureRefreshFn): void {
        this.callbacks.set(featureId, refreshFn);
    }

    /**
     * Reads features.json and dispatches each registered callback with the correct enabled state.
     *
     * - `workspaceRoot` null → all callbacks receive `(null, false)`.
     * - features.json missing → all callbacks receive `(root, false)`.
     * - Feature registered but absent from features.json → treated as disabled.
     * - Feature in features.json but not registered → silently ignored.
     */
    async refresh(workspaceRoot: vscode.Uri | null): Promise<void> {
        if (!workspaceRoot) {
            await Promise.all(
                [...this.callbacks.values()].map((fn) => fn(null, false))
            );
            return;
        }

        const config = await this.manifest.readFeatures(workspaceRoot);
        const enabledMap = new Map(
            (config?.features ?? []).map((f) => [f.id, f.enabled])
        );

        await Promise.all(
            [...this.callbacks.entries()].map(([id, fn]) =>
                fn(workspaceRoot, enabledMap.get(id) ?? false)
            )
        );
    }
}
