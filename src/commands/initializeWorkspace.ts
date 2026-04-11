// Factory for the "Memoria: Initialize workspace" command handler.
// Returns a function rather than a class — command handlers are single-operation callbacks,
// not stateful objects. Dependencies are provided at construction time for testability.

import * as vscode from "vscode";
import type { BlueprintEngine } from "../blueprints/blueprintEngine";
import type { BlueprintRegistry } from "../blueprints/blueprintRegistry";
import type { ManifestManager } from "../blueprints/manifestManager";
import type { ReinitConflictResolver } from "../blueprints/reinitConflictResolver";

export function createInitializeWorkspaceCommand(
    engine: BlueprintEngine,
    registry: BlueprintRegistry,
    manifest: ManifestManager,
    telemetry: vscode.TelemetryLogger,
    resolver: ReinitConflictResolver
): () => Promise<void> {
    return async () => {
        const folders = vscode.workspace.workspaceFolders;
        if (!folders || folders.length === 0) {
            vscode.window.showErrorMessage("Memoria: No workspace is open. Open a folder first.");
            return;
        }

        // Multi-root: let the user choose which root to initialize.
        // Single-root: use the only available root directly.
        let workspaceRoot: vscode.Uri;
        if (folders.length === 1) {
            workspaceRoot = folders[0].uri;
        } else {
            const rootItems = folders.map((f) => ({
                label: f.name,
                description: f.uri.fsPath,
                uri: f.uri,
            }));
            const pickedRoot = await vscode.window.showQuickPick(rootItems, {
                title: "Memoria: Select a workspace root",
                placeHolder: "Choose which root to initialize",
            });
            if (!pickedRoot) {
                return;
            }
            workspaceRoot = pickedRoot.uri;
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

        // In multi-root workspaces, only one root may have .memoria/ at a time.
        // If a different root is already initialized, delete its .memoria/ before proceeding.
        // This cleanup runs after blueprint selection rather than earlier (after root
        // selection) so that cancelling the blueprint QuickPick does not delete .memoria/
        // from the old root unnecessarily.
        if (folders.length > 1) {
            const oldRoot = await manifest.findInitializedRoot(folders.map((f) => f.uri));
            if (oldRoot && oldRoot.toString() !== workspaceRoot.toString()) {
                await manifest.deleteMemoriaDir(oldRoot);
            }
        }

        const isInitialized = await manifest.isInitialized(workspaceRoot);

        try {
            if (isInitialized) {
                await engine.reinitialize(workspaceRoot, picked.id, resolver);
                telemetry.logUsage("blueprint.reinit", { blueprintId: picked.id });
                vscode.window.showInformationMessage(
                    `Memoria: Workspace re-initialized with "${picked.label}".`
                );
            } else {
                await engine.initialize(workspaceRoot, picked.id);
                telemetry.logUsage("blueprint.init", { blueprintId: picked.id });
                vscode.window.showInformationMessage(
                    `Memoria: Workspace initialized with "${picked.label}".`
                );
            }
        } catch (err) {
            vscode.window.showErrorMessage(
                `Memoria: Initialization failed — ${(err as Error).message}`
            );
        }
    };
}
