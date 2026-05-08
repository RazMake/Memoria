// Factory for the "Memoria: Initialize workspace" command handler.
// Returns a function rather than a class — command handlers are single-operation callbacks,
// not stateful objects. Dependencies are provided at construction time for testability.

import * as vscode from "vscode";
import type { BlueprintEngine } from "../blueprints/blueprintEngine";
import type { BlueprintRegistry } from "../blueprints/blueprintRegistry";
import type { ManifestManager } from "../blueprints/manifestManager";
import type { WorkspaceInitConflictResolver } from "../blueprints/workspaceInitConflictResolver";
import type { TelemetryEmitter } from "../telemetry";
import { formatError } from "../utils/error";

async function selectWorkspaceRoot(
    folders: readonly vscode.WorkspaceFolder[],
): Promise<vscode.Uri | undefined> {
    if (folders.length === 1) {
        return folders[0].uri;
    }

    const rootItems = folders.map((f) => ({
        label: f.name,
        description: f.uri.fsPath,
        uri: f.uri,
    }));
    const picked = await vscode.window.showQuickPick(rootItems, {
        title: "Memoria: Select a workspace root",
        placeHolder: "Choose which root to initialize",
    });
    return picked?.uri;
}

async function selectBlueprint(
    registry: BlueprintRegistry,
): Promise<{ id: string; label: string } | undefined> {
    const blueprints = await registry.listBlueprints();
    if (blueprints.length === 0) {
        vscode.window.showErrorMessage("Memoria: No bundled blueprints found.");
        return undefined;
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

    return picked ? { id: picked.id, label: picked.label } : undefined;
}

async function migrateExistingRoot(
    folders: readonly vscode.WorkspaceFolder[],
    workspaceRoot: vscode.Uri,
    manifest: ManifestManager,
    telemetry: TelemetryEmitter,
): Promise<void> {
    if (folders.length <= 1) {
        return;
    }

    const oldRoot = await manifest.findInitializedRoot(folders.map((f) => f.uri));
    if (oldRoot && oldRoot.toString() !== workspaceRoot.toString()) {
        const failedPaths = await manifest.backupMemoriaDir(oldRoot, workspaceRoot);
        if (failedPaths.length > 0) {
            telemetry.logError("reinit.memoriaBackupFailed", {
                failedPaths: failedPaths.join(", "),
            });
        }
        await manifest.deleteMemoriaDir(oldRoot);
    }
}

export function createInitializeWorkspaceCommand(
    engine: BlueprintEngine,
    registry: BlueprintRegistry,
    manifest: ManifestManager,
    telemetry: TelemetryEmitter,
    resolver: WorkspaceInitConflictResolver,
    onWorkspaceInitialized: (root: vscode.Uri) => Promise<void>
): () => Promise<void> {
    return async () => {
        const folders = vscode.workspace.workspaceFolders;
        if (!folders || folders.length === 0) {
            vscode.window.showErrorMessage("Memoria: No workspace is open. Open a folder first.");
            return;
        }

        await vscode.workspace.saveAll(/* includeUntitled */ false);
        await vscode.commands.executeCommand("workbench.action.closeAllEditors");

        const workspaceRoot = await selectWorkspaceRoot(folders);
        if (!workspaceRoot) {
            return;
        }

        const blueprint = await selectBlueprint(registry);
        if (!blueprint) {
            return;
        }

        await migrateExistingRoot(folders, workspaceRoot, manifest, telemetry);

        const isInitialized = await manifest.isInitialized(workspaceRoot);

        try {
            if (isInitialized) {
                await engine.reinitialize(workspaceRoot, blueprint.id, resolver);
                telemetry.logUsage("blueprint.reinit", { blueprintId: blueprint.id });
            } else {
                await engine.initialize(workspaceRoot, blueprint.id);
                telemetry.logUsage("blueprint.init", { blueprintId: blueprint.id });
            }

            await onWorkspaceInitialized(workspaceRoot);
            const verb = isInitialized ? "re-initialized" : "initialized";
            vscode.window.showInformationMessage(
                `Memoria: Workspace ${verb} with "${blueprint.label}".`
            );
        } catch (err) {
            vscode.window.showErrorMessage(
                `Memoria: Initialization failed — ${formatError(err)}`
            );
        }
    };
}
