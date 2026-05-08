// Thin orchestrator that composes the blueprint subsystem components to perform workspace initialization.
// All logic lives in the collaborators (registry, scaffold, manifest, builders); the engine just sequences them.

import * as vscode from "vscode";
import type { BlueprintRegistry } from "./blueprintRegistry";
import type { ManifestManager } from "./manifestManager";
import type { FileScaffold } from "./fileScaffold";
import { BACKUP_FOLDER_NAME, type BlueprintDefinition, type DecorationsFeatureEntry, type FeaturesConfig, type TaskCollectorFeatureEntry, type WorkspaceEntry } from "./types";
import type { WorkspaceInitConflictResolver } from "./workspaceInitConflictResolver";
import type { TelemetryEmitter } from "../telemetry";
import {
    mergeDefaultFileMap,
    buildFeaturesConfig,
    extractFeature,
    extractKnownFeatures,
    buildManifest,
    mergeFeaturesConfig,
    buildSeedSourceMap,
} from "./blueprintBuilders";

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
        const features = extractKnownFeatures(definition.features);
        const getSeedContent = this.buildSeedContentCallback(blueprintId, definition.workspace);

        const { fileManifest } = await this.scaffold.scaffoldTree(
            workspaceRoot,
            definition.workspace,
            getSeedContent,
        );

        const manifest = buildManifest(definition, fileManifest, features, {
            initializedAt: new Date().toISOString(),
            lastReinitAt: null,
        });

        await this.manifest.writeManifest(workspaceRoot, manifest);
        await this.persistMetadata(workspaceRoot, definition, features.taskCollector, null);
    }

    /**
     * Re-initializes a workspace root from the named blueprint, applying conflict resolution:
     * - Extra folders (on disk but absent from the new blueprint) are moved to WorkspaceInitializationBackups/
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
        resolver: WorkspaceInitConflictResolver
    ): Promise<void> {
        const currentManifest = await this.manifest.readManifest(workspaceRoot);
        if (!currentManifest) {
            throw new Error("Cannot re-initialize: workspace has no .memoria/blueprint.json.");
        }

        const newDefinition = await this.registry.getBlueprintDefinition(blueprintId);
        const features = extractKnownFeatures(newDefinition.features);
        const getSeedContent = this.buildSeedContentCallback(blueprintId, newDefinition.workspace);

        const plan = await resolver.resolveConflicts(
            workspaceRoot,
            currentManifest,
            newDefinition,
            getSeedContent
        );

        if (!plan) {
            return; // user cancelled at a QuickPick
        }

        // Back up .memoria/ before re-scaffolding so the user can recover metadata
        // (task index, feature toggles, etc.) if reinit goes wrong mid-way.
        const backupFailures = await this.manifest.backupMemoriaDir(workspaceRoot, workspaceRoot);
        if (backupFailures.length > 0) {
            this.telemetry.logError("taskCollector.reinitBackupFailed", {
                failedPaths: backupFailures.join(","),
            });
        }

        // Phase D — Execute.
        // Move folders the user chose to clean up into WorkspaceInitializationBackups/.
        if (plan.foldersToCleanup.length > 0) {
            const cleanupRoot = vscode.Uri.joinPath(workspaceRoot, BACKUP_FOLDER_NAME);
            await this.fs.createDirectory(cleanupRoot);
            await Promise.all(
                plan.foldersToCleanup.map(async (folder) => {
                    const src = vscode.Uri.joinPath(workspaceRoot, folder);
                    const dest = vscode.Uri.joinPath(cleanupRoot, folder);
                    await this.fs.rename(src, dest, { overwrite: false });
                })
            );
        }

        // Scaffold all blueprint files unconditionally — conflicts already resolved.
        const { fileManifest } = await this.scaffold.scaffoldTree(
            workspaceRoot,
            newDefinition.workspace,
            getSeedContent
        );

        const updatedManifest = buildManifest(newDefinition, fileManifest, features, {
            rootUri: currentManifest.rootUri,
            initializedAt: currentManifest.initializedAt,
            lastReinitAt: new Date().toISOString(),
        });

        await this.manifest.writeManifest(workspaceRoot, updatedManifest);

        const existingFeaturesConfig = await this.manifest.readFeatures(workspaceRoot);
        await this.persistMetadata(workspaceRoot, newDefinition, features.taskCollector, existingFeaturesConfig);
        await this.manifest.deleteTaskIndex(workspaceRoot);

        // Phase E — Open diff editors for files the user wants to merge manually.
        if (plan.filesToDiff.length > 0) {
            const cleanupRoot = vscode.Uri.joinPath(workspaceRoot, BACKUP_FOLDER_NAME);
            await resolver.openDiffEditors(workspaceRoot, cleanupRoot, plan.filesToDiff);
        }
    }

    /**
     * Writes default-files, decorations, features, and task-collector config.
     * Shared between initialize() and reinitialize() to avoid duplicating the write sequence.
     * When `existingFeaturesConfig` is provided, feature toggles are merged with existing state;
     * otherwise a fresh config is built from the blueprint definition.
     */
    private async persistMetadata(
        workspaceRoot: vscode.Uri,
        definition: BlueprintDefinition,
        taskCollector: TaskCollectorFeatureEntry | null,
        existingFeaturesConfig: FeaturesConfig | null,
    ): Promise<void> {
        if (definition.defaultFiles) {
            await this.manifest.writeDefaultFiles(
                workspaceRoot,
                mergeDefaultFileMap(definition.defaultFiles, workspaceRoot),
            );
        }
        await this.manifest.writeDecorations(workspaceRoot, { rules: extractFeature<DecorationsFeatureEntry>(definition.features, "decorations")?.rules ?? [] });

        const featuresConfig = existingFeaturesConfig
            ? mergeFeaturesConfig(definition.features, existingFeaturesConfig)
            : buildFeaturesConfig(definition.features);
        await this.manifest.writeFeatures(workspaceRoot, featuresConfig);

        if (taskCollector) {
            await this.manifest.writeTaskCollectorConfig(workspaceRoot, taskCollector.config);
        }
    }

    /** Returns a seed content callback that dispatches to shared vs blueprint-specific seed files. */
    private buildSeedContentCallback(
        blueprintId: string,
        workspace: WorkspaceEntry[],
    ): (relativePath: string) => Promise<Uint8Array | null> {
        const seedSourceMap = buildSeedSourceMap(workspace);
        return (relativePath: string) => {
            const seedSource = seedSourceMap.get(relativePath);
            if (seedSource) {
                return this.registry.getSharedSeedContent(seedSource);
            }
            return this.registry.getSeedFileContent(blueprintId, relativePath);
        };
    }
}


