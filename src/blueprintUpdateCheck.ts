import * as vscode from "vscode";
import { BlueprintRegistry } from "./blueprints/blueprintRegistry";
import { ManifestManager } from "./blueprints/manifestManager";
import { BlueprintEngine } from "./blueprints/blueprintEngine";
import { WorkspaceInitConflictResolver } from "./blueprints/workspaceInitConflictResolver";
import { FeatureManager } from "./features/featureManager";

/**
 * Sets the VS Code context key `memoria.workspaceInitialized`.
 * This drives the `when` clause visibility of the toggleDotFolders command.
 */
export async function updateWorkspaceInitializedContext(
    initializedRoot: vscode.Uri | null
): Promise<void> {
    await vscode.commands.executeCommand(
        "setContext",
        "memoria.workspaceInitialized",
        initializedRoot !== null
    );
}

/**
 * Compares the stored blueprint version in .memoria/blueprint.json with the version
 * of the bundled blueprint. When the bundled version is newer, prompts the user to
 * re-initialize so the latest structure is applied.
 *
 * Runs silently (no-op) when: the workspace is not initialized, the blueprint id is no
 * longer bundled, or the stored version is current.
 *
 * Called with `void` + `.catch()` in activate() because showInformationMessage() with
 * action buttons blocks until the user responds — awaiting it would delay command
 * registration and initial decoration rendering. Errors are swallowed because the
 * update check is best-effort and must never prevent the extension from starting.
 */
export async function checkForBlueprintUpdates(
    initializedRoot: vscode.Uri | null,
    manifest: ManifestManager,
    registry: BlueprintRegistry,
    engine: BlueprintEngine,
    resolver: WorkspaceInitConflictResolver,
    featureManager: FeatureManager
): Promise<void> {
    if (!initializedRoot) {
        return;
    }

    const storedManifest = await manifest.readManifest(initializedRoot);
    if (!storedManifest) {
        return;
    }

    let bundledDefinition;
    try {
        bundledDefinition = await registry.getBlueprintDefinition(storedManifest.blueprintId);
    } catch {
        // Blueprint ID no longer bundled — skip silently.
        return;
    }

    if (!isNewerVersion(bundledDefinition.version, storedManifest.blueprintVersion)) {
        return;
    }

    const answer = await vscode.window.showInformationMessage(
        `Memoria: A newer version of blueprint "${bundledDefinition.name}" is available (${bundledDefinition.version}). Re-initialize to apply updates?`,
        "Re-initialize",
        "Later"
    );

    if (answer !== "Re-initialize") {
        return;
    }

    try {
        await engine.reinitialize(initializedRoot, storedManifest.blueprintId, resolver);
        await updateWorkspaceInitializedContext(initializedRoot);
        await featureManager.refresh(initializedRoot);
        vscode.window.showInformationMessage(
            `Memoria: Workspace re-initialized with "${bundledDefinition.name}" ${bundledDefinition.version}.`
        );
    } catch (err) {
        vscode.window.showErrorMessage(
            `Memoria: Re-initialization failed — ${(err as Error).message}`
        );
    }
}

/**
 * Returns true when `bundled` is a strictly newer SemVer than `stored`.
 * Handles only numeric major.minor.patch — pre-release suffixes are not compared.
 *
 * Exported so unit tests can exercise version-comparison logic in isolation,
 * without activating the full extension.
 */
export function isNewerVersion(bundled: string, stored: string): boolean {
    const parse = (v: string): [number, number, number] => {
        const parts = v.split(".").map(Number);
        return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
    };
    const [bMaj, bMin, bPatch] = parse(bundled);
    const [sMaj, sMin, sPatch] = parse(stored);
    if (bMaj !== sMaj) {
        return bMaj > sMaj;
    }
    if (bMin !== sMin) {
        return bMin > sMin;
    }
    return bPatch > sPatch;
}
