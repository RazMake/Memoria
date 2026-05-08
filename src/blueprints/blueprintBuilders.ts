// Pure builder/utility functions for constructing blueprint-related data structures.
// Separated from BlueprintEngine (the I/O orchestrator) to follow Single Responsibility:
// the engine sequences operations; these functions transform data.

import type {
    BlueprintDefinition,
    BlueprintFeature,
    BlueprintManifest,
    ContactsFeatureEntry,
    DefaultFileMap,
    DefaultFilesEntry,
    FeaturesConfig,
    SnippetsFeatureEntry,
    TaskCollectorFeatureEntry,
    WorkspaceEntry,
} from "./types";
import { getRootFolderName } from "./workspaceUtils";

/**
 * Merges the two-map DefaultFileMap into a flat Record for writing to default-files.json.
 * Root-scoped keys are prefixed with the workspace root folder name.
 */
export function mergeDefaultFileMap(
    map: DefaultFileMap,
    workspaceRoot: { path: string }
): Record<string, DefaultFilesEntry> {
    const result: Record<string, DefaultFilesEntry> = {};

    for (const [folder, files] of Object.entries(map.relative)) {
        result[folder] = { filesToOpen: files };
    }

    if (Object.keys(map.rootScoped).length > 0) {
        const rootName = getRootFolderName(workspaceRoot);

        for (const [folder, files] of Object.entries(map.rootScoped)) {
            result[rootName + "/" + folder] = { filesToOpen: files };
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

/** Extracts a typed feature entry by ID from the features array. Returns `null` if not present. */
export function extractFeature<T extends BlueprintFeature>(
    features: BlueprintFeature[],
    id: T["id"],
): T | null {
    const feature = features.find((entry): entry is T => entry.id === id);
    return feature ?? null;
}

export interface KnownFeatures {
    taskCollector: TaskCollectorFeatureEntry | null;
    contacts: ContactsFeatureEntry | null;
    snippets: SnippetsFeatureEntry | null;
}

/** Extracts the three known feature types from a features array in one call. */
export function extractKnownFeatures(features: BlueprintFeature[]): KnownFeatures {
    return {
        taskCollector: extractFeature<TaskCollectorFeatureEntry>(features, "taskCollector"),
        contacts: extractFeature<ContactsFeatureEntry>(features, "contacts"),
        snippets: extractFeature<SnippetsFeatureEntry>(features, "snippets"),
    };
}

/** Builds a BlueprintManifest from a definition, file hashes, and feature entries. */
export function buildManifest(
    definition: BlueprintDefinition,
    fileManifest: Record<string, string>,
    features: KnownFeatures,
    timestamps: Pick<BlueprintManifest, "initializedAt" | "lastReinitAt"> & { rootUri?: string },
): BlueprintManifest {
    return {
        blueprintId: definition.id,
        blueprintVersion: definition.version,
        ...timestamps,
        fileManifest,
        taskCollector: features.taskCollector ? { collectorPath: features.taskCollector.collectorPath } : undefined,
        contacts: features.contacts ? buildContactsManifestConfig(features.contacts) : undefined,
        snippets: features.snippets ? { snippetsFolder: features.snippets.snippetsFolder } : undefined,
    };
}

function buildContactsManifestConfig(feature: ContactsFeatureEntry): NonNullable<BlueprintManifest["contacts"]> {
    return {
        peopleFolder: feature.peopleFolder,
        groups: feature.groups.map((group) => ({ ...group })),
    };
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

/**
 * Recursively walks a WorkspaceEntry tree, calling `visitor` for each non-folder
 * entry. The `prefix` accumulates the path segments as the tree is descended.
 */
export function walkWorkspaceTree<T>(
    entries: WorkspaceEntry[],
    visitor: (entry: WorkspaceEntry, relativePath: string) => T | undefined,
    prefix = "",
): T[] {
    const results: T[] = [];
    for (const entry of entries) {
        if (entry.children) {
            results.push(...walkWorkspaceTree(entry.children, visitor, prefix + entry.name));
        } else if (!entry.isFolder) {
            const value = visitor(entry, prefix + entry.name);
            if (value !== undefined) { results.push(value); }
        }
    }
    return results;
}

/**
 * Walks the workspace entry tree and builds a map of relative paths to their shared seed source paths.
 * Only file entries with a `seedSource` field are included.
 */
export function buildSeedSourceMap(entries: WorkspaceEntry[]): Map<string, string> {
    const pairs = walkWorkspaceTree<[string, string]>(
        entries,
        (entry, path) => entry.seedSource ? [path, entry.seedSource] : undefined,
    );
    return new Map(pairs);
}
