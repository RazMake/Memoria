// Thin orchestrator that composes the blueprint subsystem components to perform workspace initialization.
// All logic lives in the collaborators (registry, scaffold, manifest); the engine just sequences them.

import * as vscode from "vscode";
import type { BlueprintRegistry } from "./blueprintRegistry";
import type { ManifestManager } from "./manifestManager";
import type { FileScaffold } from "./fileScaffold";
import { SKIP_FILE } from "./fileScaffold";
import type { BlueprintManifest, ReinitPlan, OverwriteChoice } from "./types";
import type { ReinitConflictResolver } from "./reinitConflictResolver";

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

        const { fileManifest } = await this.scaffold.scaffoldTree(
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

    /**
     * Re-initializes a workspace root from the named blueprint, applying conflict resolution:
     * - Extra folders (on disk but absent from the new blueprint) are moved to ReInitializationCleanup/
     *   if the user opts for cleanup.
     * - User-modified files are only overwritten with the user's explicit consent.
     * - Unmodified files are silently overwritten with the latest blueprint version.
     * - After scaffolding, the manifest is updated with fresh hashes (including current hashes
     *   for any files the user chose to skip).
     *
     * Throws if no manifest exists or if a rename fails.
     */
    async reinitialize(
        workspaceRoot: vscode.Uri,
        blueprintId: string,
        resolver: ReinitConflictResolver
    ): Promise<void> {
        const currentManifest = await this.manifest.readManifest(workspaceRoot);
        if (!currentManifest) {
            throw new Error("Cannot re-initialize: workspace has no .memoria/blueprint.json.");
        }

        const newDefinition = await this.registry.getBlueprintDefinition(blueprintId);
        const plan = await resolver.resolveConflicts(workspaceRoot, currentManifest, newDefinition);

        // Move folders the user chose to clean up into ReInitializationCleanup/.
        if (plan.foldersToCleanup.length > 0) {
            const cleanupRoot = vscode.Uri.joinPath(workspaceRoot, "ReInitializationCleanup");
            await this.scaffold.fs.createDirectory(cleanupRoot);
            for (const folder of plan.foldersToCleanup) {
                const src = vscode.Uri.joinPath(workspaceRoot, folder);
                const dest = vscode.Uri.joinPath(cleanupRoot, folder);
                await this.scaffold.fs.rename(src, dest, { overwrite: false });
            }
        }

        // Track "yes-all" overwrite decisions to avoid per-file prompts within the same scope.
        const yesAllFolders = new Set<string>();
        const yesAllRecursiveFolders = new Set<string>();

        const buildSeedCallback = (blueprintIdArg: string) => {
            return async (relativePath: string): Promise<Uint8Array | null | typeof SKIP_FILE> => {
                const isModified = plan.modifiedBlueprintFiles.includes(relativePath);

                if (isModified) {
                    const parentFolder = relativePath.includes("/")
                        ? relativePath.substring(0, relativePath.lastIndexOf("/"))
                        : "";

                    const coveredByRecursive = [...yesAllRecursiveFolders].some(
                        (f) => parentFolder === f || parentFolder.startsWith(f + "/")
                    );
                    if (coveredByRecursive) {
                        return this.registry.getSeedFileContent(blueprintIdArg, relativePath);
                    }

                    if (yesAllFolders.has(parentFolder)) {
                        return this.registry.getSeedFileContent(blueprintIdArg, relativePath);
                    }

                    const choice: OverwriteChoice = await resolver.promptFileOverwrite(relativePath);
                    if (choice === "no") {
                        return SKIP_FILE;
                    }
                    if (choice === "yes-folder") {
                        yesAllFolders.add(parentFolder);
                    } else if (choice === "yes-folder-recursive") {
                        yesAllRecursiveFolders.add(parentFolder);
                    }
                    // "yes" or expanded scope — fall through to overwrite
                }

                return this.registry.getSeedFileContent(blueprintIdArg, relativePath);
            };
        };

        const { fileManifest, skippedPaths } = await this.scaffold.scaffoldTree(
            workspaceRoot,
            newDefinition.workspace,
            buildSeedCallback(blueprintId)
        );

        // For skipped files, record the current on-disk hash so future re-inits treat them correctly.
        for (const relativePath of skippedPaths) {
            const fileUri = vscode.Uri.joinPath(workspaceRoot, ...relativePath.split("/"));
            try {
                const content = await this.scaffold.fs.readFile(fileUri);
                fileManifest[relativePath] = this.manifest.computeFileHash(content);
            } catch {
                // File was deleted by the user — omit from manifest.
            }
        }

        const updatedManifest: BlueprintManifest = {
            blueprintId: newDefinition.id,
            blueprintVersion: newDefinition.version,
            rootUri: currentManifest.rootUri,
            initializedAt: currentManifest.initializedAt,
            lastReinitAt: new Date().toISOString(),
            fileManifest,
        };

        await this.manifest.writeManifest(workspaceRoot, updatedManifest);
        await this.manifest.writeDecorations(workspaceRoot, { rules: newDefinition.decorations });
    }
}
