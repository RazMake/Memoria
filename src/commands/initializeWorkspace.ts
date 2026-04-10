// Factory for the "Memoria: Initialize workspace" command handler.
// Returns a function rather than a class — command handlers are single-operation callbacks,
// not stateful objects. Dependencies are provided at construction time for testability.

import * as vscode from "vscode";
import type { BlueprintEngine } from "../blueprints/blueprintEngine";
import type { BlueprintRegistry } from "../blueprints/blueprintRegistry";
import type { ManifestManager } from "../blueprints/manifestManager";

export function createInitializeWorkspaceCommand(
    engine: BlueprintEngine,
    registry: BlueprintRegistry,
    manifest: ManifestManager,
    telemetry: vscode.TelemetryLogger
): () => Promise<void> {
    return async () => {
        const folders = vscode.workspace.workspaceFolders;
        if (!folders || folders.length === 0) {
            vscode.window.showErrorMessage("Memoria: No workspace is open. Open a folder first.");
            return;
        }

        // Phase 1: single-root only. Multi-root root selection is Phase 2.
        const workspaceRoot = folders[0].uri;

        if (await manifest.isInitialized(workspaceRoot)) {
            vscode.window.showInformationMessage(
                "Memoria: This workspace is already initialized. Re-initialization will be available in a future update."
            );
            return;
        }

        const blueprints = await registry.listBlueprints();
        if (blueprints.length === 0) {
            vscode.window.showErrorMessage("Memoria: No bundled blueprints found.");
            return;
        }

        const items = blueprints.map((bp) => ({
            label: bp.name,
            description: bp.description,
            id: bp.id,
        }));

        const picked = await vscode.window.showQuickPick(items, {
            title: "Memoria: Select a blueprint",
            placeHolder: "Choose a workspace blueprint to initialize",
        });

        if (!picked) {
            return;
        }

        try {
            await engine.initialize(workspaceRoot, picked.id);
            telemetry.logUsage("blueprint.init", { blueprintId: picked.id });
            vscode.window.showInformationMessage(
                `Memoria: Workspace initialized with "${picked.label}".`
            );
        } catch (err) {
            vscode.window.showErrorMessage(
                `Memoria: Initialization failed — ${(err as Error).message}`
            );
        }
    };
}
