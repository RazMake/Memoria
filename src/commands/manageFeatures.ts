// Factory for the "Memoria: Manage features" command handler.
// Shows a multi-select QuickPick of blueprint features where checked = enabled.
// Persists toggle state to .memoria/features.json and refreshes all features.

import * as vscode from "vscode";
import type { ManifestManager } from "../blueprints/manifestManager";
import type { TelemetryEmitter } from "../telemetry";
import type { FeatureManager } from "../features/featureManager";

export function createManageFeaturesCommand(
    manifest: ManifestManager,
    telemetry: TelemetryEmitter,
    featureManager: FeatureManager
): () => Promise<void> {
    return async () => {
        const folders = vscode.workspace.workspaceFolders;
        if (!folders || folders.length === 0) {
            vscode.window.showErrorMessage("Memoria: No workspace is open.");
            return;
        }

        const workspaceRoot = folders[0].uri;
        if (!(await manifest.isInitialized(workspaceRoot))) {
            vscode.window.showErrorMessage(
                "Memoria: Workspace is not initialized. Run 'Memoria: Initialize workspace' first."
            );
            return;
        }

        const config = await manifest.readFeatures(workspaceRoot);
        if (!config) {
            vscode.window.showErrorMessage(
                "Memoria: No features configured. Re-initialize the workspace."
            );
            return;
        }

        const items = config.features.map((f) => ({
            label: f.name,
            description: f.description,
            picked: f.enabled,
            id: f.id,
        }));

        const selected = await vscode.window.showQuickPick(items, {
            title: "Memoria: Manage blueprint features",
            placeHolder: "Checked = enabled, unchecked = disabled",
            canPickMany: true,
        });

        if (selected === undefined) {
            return;
        }

        const enabledIds = new Set(selected.map((item) => item.id));

        const updatedConfig = {
            features: config.features.map((f) => ({
                ...f,
                enabled: enabledIds.has(f.id),
            })),
        };

        await manifest.writeFeatures(workspaceRoot, updatedConfig);
        await featureManager.refresh(workspaceRoot);

        telemetry.logUsage("features.toggle", {
            enabled: selected.map((s) => s.id).join(","),
        });
    };
}
