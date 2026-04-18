// Thin orchestrator that composes the blueprint subsystem components to perform workspace initialization.
// All logic lives in the collaborators (registry, scaffold, manifest); the engine just sequences them.

import * as vscode from "vscode";
import type { BlueprintRegistry } from "./blueprintRegistry";
import type { ManifestManager } from "./manifestManager";
import type { FileScaffold } from "./fileScaffold";
import { getRootFolderName } from "./workspaceUtils";
import type { BlueprintManifest, BlueprintFeature, FeaturesConfig, DecorationRule, ReinitPlan, DefaultFileMap, TaskCollectorFeatureEntry } from "./types";
import type { WorkspaceInitConflictResolver } from "./workspaceInitConflictResolver";
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
        const taskCollector = extractTaskCollectorFeature(definition.features);

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
            taskCollector: taskCollector ? { collectorPath: taskCollector.collectorPath } : undefined,
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
        if (taskCollector) {
            await this.manifest.writeTaskCollectorConfig(workspaceRoot, taskCollector.config);
        }
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
        const taskCollector = extractTaskCollectorFeature(newDefinition.features);

        const plan = await resolver.resolveConflicts(
            workspaceRoot,
            currentManifest,
            newDefinition,
            (relativePath) => this.registry.getSeedFileContent(blueprintId, relativePath)
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
            const cleanupRoot = vscode.Uri.joinPath(workspaceRoot, "WorkspaceInitializationBackups");
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
            (relativePath) => this.registry.getSeedFileContent(blueprintId, relativePath)
        );

        const updatedManifest: BlueprintManifest = {
            blueprintId: newDefinition.id,
            blueprintVersion: newDefinition.version,
            rootUri: currentManifest.rootUri,
            initializedAt: currentManifest.initializedAt,
            lastReinitAt: new Date().toISOString(),
            fileManifest,
            taskCollector: taskCollector ? { collectorPath: taskCollector.collectorPath } : undefined,
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
        if (taskCollector) {
            await this.manifest.writeTaskCollectorConfig(workspaceRoot, taskCollector.config);
        }
        await this.manifest.deleteTaskIndex(workspaceRoot);

        // Phase E — Open diff editors for files the user wants to merge manually.
        if (plan.filesToDiff.length > 0) {
            const cleanupRoot = vscode.Uri.joinPath(workspaceRoot, "WorkspaceInitializationBackups");
            await resolver.openDiffEditors(workspaceRoot, cleanupRoot, plan.filesToDiff);
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

export function extractTaskCollectorFeature(features: BlueprintFeature[]): TaskCollectorFeatureEntry | null {
    const feature = features.find((entry): entry is TaskCollectorFeatureEntry => entry.id === "taskCollector");
    return feature ?? null;
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
