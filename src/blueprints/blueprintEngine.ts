// Thin orchestrator that composes the blueprint subsystem components to perform workspace initialization.
// All logic lives in the collaborators (registry, scaffold, manifest); the engine just sequences them.

import * as vscode from "vscode";
import type { BlueprintRegistry } from "./blueprintRegistry";
import type { ManifestManager } from "./manifestManager";
import type { FileScaffold } from "./fileScaffold";
import { SKIP_FILE } from "./fileScaffold";
import { computeFileHash } from "./hashUtils";
import { getRootFolderName } from "./workspaceUtils";
import type { BlueprintManifest, BlueprintFeature, FeaturesConfig, DecorationRule, ReinitPlan, OverwriteChoice, DefaultFileMap } from "./types";
import type { ReinitConflictResolver } from "./reinitConflictResolver";
import type { TelemetryEmitter } from "../telemetry";

export class BlueprintEngine {
    constructor(
        private readonly registry: BlueprintRegistry,
        private readonly manifest: ManifestManager,
        private readonly scaffold: FileScaffold,
        private readonly fs: typeof vscode.workspace.fs,
        private readonly telemetry: TelemetryEmitter
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
        if (definition.defaultFiles) {
            await this.manifest.writeDefaultFiles(
                workspaceRoot,
                mergeDefaultFileMap(definition.defaultFiles, workspaceRoot)
            );
        }
        await this.manifest.writeDecorations(workspaceRoot, { rules: extractDecorationRules(definition.features) });
        await this.manifest.writeFeatures(workspaceRoot, buildFeaturesConfig(definition.features));
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
            await this.fs.createDirectory(cleanupRoot);
            // Parallel renames — destinations are distinct so order is irrelevant.
            await Promise.all(plan.foldersToCleanup.map(async (folder) => {
                const src = vscode.Uri.joinPath(workspaceRoot, folder);
                const dest = vscode.Uri.joinPath(cleanupRoot, folder);
                await this.fs.rename(src, dest, { overwrite: false });
            }));
        }

        const { fileManifest, skippedPaths } = await this.scaffold.scaffoldTree(
            workspaceRoot,
            newDefinition.workspace,
            this.buildReinitSeedCallback(workspaceRoot, plan, resolver, blueprintId)
        );

        // For skipped files, record the current on-disk hash so future re-inits treat them correctly.
        // Use cached hashes from the conflict resolution phase to avoid re-reading the same files.
        for (const relativePath of skippedPaths) {
            const cachedHash = plan.currentFileHashes[relativePath];
            if (cachedHash !== undefined) {
                if (cachedHash !== null) {
                    fileManifest[relativePath] = cachedHash;
                }
                // null means file was deleted — omit from manifest.
                continue;
            }
            // Fallback for files not hashed during conflict analysis (e.g. new files the user skipped).
            const fileUri = vscode.Uri.joinPath(workspaceRoot, ...relativePath.split("/"));
            try {
                const content = await this.fs.readFile(fileUri);
                fileManifest[relativePath] = computeFileHash(content);
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
        if (newDefinition.defaultFiles) {
            await this.manifest.writeDefaultFiles(
                workspaceRoot,
                mergeDefaultFileMap(newDefinition.defaultFiles, workspaceRoot)
            );
        }
        await this.manifest.writeDecorations(workspaceRoot, { rules: extractDecorationRules(newDefinition.features) });

        const existingFeaturesConfig = await this.manifest.readFeatures(workspaceRoot);
        await this.manifest.writeFeatures(workspaceRoot, mergeFeaturesConfig(newDefinition.features, existingFeaturesConfig));
    }

    /**
     * Builds the seed-content callback for re-initialization scaffolding.
     * Tracks folder-scope overwrite decisions so the user is prompted at most once per scope.
     * Modified files that the user approves for overwrite are backed up to
     * ReInitializationCleanup/ before being replaced.
     */
    private buildReinitSeedCallback(
        workspaceRoot: vscode.Uri,
        plan: ReinitPlan,
        resolver: ReinitConflictResolver,
        blueprintId: string
    ): (relativePath: string) => Promise<Uint8Array | null | typeof SKIP_FILE> {
        const yesAllFolders = new Set<string>();
        const yesAllRecursiveFolders = new Set<string>();

        return async (relativePath: string): Promise<Uint8Array | null | typeof SKIP_FILE> => {
            const isModified = plan.modifiedBlueprintFiles.has(relativePath);

            if (isModified) {
                const parentFolder = relativePath.includes("/")
                    ? relativePath.substring(0, relativePath.lastIndexOf("/"))
                    : "";

                let coveredByRecursive = false;
                for (const f of yesAllRecursiveFolders) {
                    if (parentFolder === f || parentFolder.startsWith(f + "/")) {
                        coveredByRecursive = true;
                        break;
                    }
                }
                if (coveredByRecursive) {
                    await this.backupFile(workspaceRoot, relativePath);
                    return this.registry.getSeedFileContent(blueprintId, relativePath);
                }

                if (yesAllFolders.has(parentFolder)) {
                    await this.backupFile(workspaceRoot, relativePath);
                    return this.registry.getSeedFileContent(blueprintId, relativePath);
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
                // "yes" or expanded scope — back up and fall through to overwrite
                await this.backupFile(workspaceRoot, relativePath);
            }

            return this.registry.getSeedFileContent(blueprintId, relativePath);
        };
    }

    /**
     * Copies a modified file to ReInitializationCleanup/ before it is overwritten,
     * preserving its relative path. Non-fatal — errors are logged via telemetry
     * so they can be investigated without blocking the reinit flow.
     */
    private async backupFile(workspaceRoot: vscode.Uri, relativePath: string): Promise<void> {
        try {
            const segments = relativePath.split("/");
            const src = vscode.Uri.joinPath(workspaceRoot, ...segments);
            const dest = vscode.Uri.joinPath(workspaceRoot, "ReInitializationCleanup", ...segments);

            // Ensure parent directories exist for the backup destination.
            const destParent = segments.length > 1
                ? vscode.Uri.joinPath(workspaceRoot, "ReInitializationCleanup", ...segments.slice(0, -1))
                : vscode.Uri.joinPath(workspaceRoot, "ReInitializationCleanup");
            await this.fs.createDirectory(destParent);

            await this.fs.copy(src, dest, { overwrite: true });
        } catch (err) {
            this.telemetry.logError("reinit.backupFailed", {
                path: relativePath,
                error: (err as Error).message,
            });
        }
    }
}

/**
 * Merges the two-map DefaultFileMap into a flat Record for writing to default-files.json.
 * Root-scoped keys are prefixed with the workspace root folder name.
 */
export function mergeDefaultFileMap(
    map: DefaultFileMap,
    workspaceRoot: vscode.Uri
): Record<string, string[]> {
    const result: Record<string, string[]> = { ...map.relative };

    if (Object.keys(map.rootScoped).length > 0) {
        const rootName = getRootFolderName(workspaceRoot);

        for (const [folder, files] of Object.entries(map.rootScoped)) {
            result[rootName + "/" + folder] = files;
        }
    }

    return result;
}

/** Builds the initial FeaturesConfig from a blueprint's features, using each feature's enabledByDefault. */
export function buildFeaturesConfig(features: BlueprintFeature[]): FeaturesConfig {
    return {
        features: features.map((f) => ({
            id: f.id,
            name: f.name,
            description: f.description,
            enabled: f.enabledByDefault,
        })),
    };
}

/** Extracts decoration rules from the features array. Returns empty array if no decorations feature exists. */
export function extractDecorationRules(features: BlueprintFeature[]): DecorationRule[] {
    const decorations = features.find((f) => f.id === "decorations");
    return decorations ? decorations.rules : [];
}

/**
 * Merges a new blueprint's features with the user's existing toggle state.
 * - Features that still exist: preserve user's `enabled` state, update name/description from blueprint.
 * - New features: use `enabledByDefault`.
 * - Removed features: dropped.
 */
export function mergeFeaturesConfig(
    newFeatures: BlueprintFeature[],
    existingConfig: FeaturesConfig | null
): FeaturesConfig {
    const existingMap = new Map(
        (existingConfig?.features ?? []).map((f) => [f.id, f])
    );

    return {
        features: newFeatures.map((f) => {
            const existing = existingMap.get(f.id);
            return {
                id: f.id,
                name: f.name,
                description: f.description,
                enabled: existing !== undefined ? existing.enabled : f.enabledByDefault,
            };
        }),
    };
}
