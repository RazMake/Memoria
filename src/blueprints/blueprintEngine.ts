// Thin orchestrator that composes the blueprint subsystem components to perform workspace initialization.
// All logic lives in the collaborators (registry, scaffold, manifest); the engine just sequences them.

import * as vscode from "vscode";
import type { BlueprintRegistry } from "./blueprintRegistry";
import type { ManifestManager } from "./manifestManager";
import type { FileScaffold } from "./fileScaffold";
import type { BlueprintManifest } from "./types";

export class BlueprintEngine {
    constructor(
        private readonly registry: BlueprintRegistry,
        private readonly manifest: ManifestManager,
        private readonly scaffold: FileScaffold
    ) {}

    /**
     * Initializes a workspace root from the named blueprint:
     * 1. Reads the full blueprint definition.
     * 2. Scaffolds the folder/file tree with seed content.
     * 3. Persists the manifest (blueprint.json) and decoration rules (decorations.json).
     *
     * Throws on any failure — the caller is responsible for surfacing the error to the user.
     */
    async initialize(workspaceRoot: vscode.Uri, blueprintId: string): Promise<void> {
        const definition = await this.registry.getBlueprintDefinition(blueprintId);

        const fileManifest = await this.scaffold.scaffoldTree(
            workspaceRoot,
            definition.workspace,
            (relativePath) => this.registry.getSeedFileContent(blueprintId, relativePath)
        );

        const manifest: BlueprintManifest = {
            blueprintId: definition.id,
            blueprintVersion: definition.version,
            initializedAt: new Date().toISOString(),
            lastReinitAt: null,
            fileManifest,
        };

        await this.manifest.writeManifest(workspaceRoot, manifest);
        await this.manifest.writeDecorations(workspaceRoot, { rules: definition.decorations });
    }
}
