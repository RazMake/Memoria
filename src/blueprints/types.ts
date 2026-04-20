// Data contracts shared between all blueprint subsystem components.
// These interfaces define the shape of data flowing between parser, registry,
// scaffold, manifest manager, and engine — keeping each component loosely coupled.

import * as vscode from "vscode";
import type { ContactKind } from "../features/contacts/types";
import type { TaskCollectorConfig } from "../features/taskCollector/types";

/** Allowed values for the `default` field on a workspace entry. */
export type DefaultScope = "relative" | "includingRoot";

/** A single entry in the blueprint workspace tree — either a folder or a file. */
export interface WorkspaceEntry {
    name: string;
    isFolder: boolean;
    children?: WorkspaceEntry[];
    /**
     * Marks this file as a default file to open quickly.
     * - `"relative"` — folder key is relative (e.g. "00-ToDo/"), matches any workspace root.
     * - `"includingRoot"` — folder key is root-prefixed (e.g. "ProjectA/00-ToDo/"),
     *   matches only the named root.
     * Omit to leave the file as a non-default entry.
     */
    default?: DefaultScope;
}

/** A single decoration rule keyed by glob filter pattern. */
export interface DecorationRule {
    filter: string;
    color?: string;
    badge?: string;
    /** Hover tooltip shown on the decorated item in the Explorer. */
    tooltip?: string;
    /**
     * When true, children of a decorated folder inherit the decoration.
     * Only meaningful for folder-name filters (e.g. "FolderName/").
     * Defaults to false.
     */
    propagate?: boolean;
}

/** Common properties shared by all blueprint feature entries. */
export interface FeatureEntry {
    id: string;
    name: string;
    description: string;
    enabledByDefault: boolean;
}

/** A decorations feature — provides Explorer badges and colors based on filter rules. */
export interface DecorationsFeatureEntry extends FeatureEntry {
    id: "decorations";
    rules: DecorationRule[];
}

/** A task collector feature — aggregates Markdown tasks into a blueprint-owned collector file. */
export interface TaskCollectorFeatureEntry extends FeatureEntry {
    id: "taskCollector";
    collectorPath: string;
    config: TaskCollectorConfig;
}

/** A blueprint-defined contact group file under the contacts people folder. */
export interface ContactGroup {
    file: string;
    type: ContactKind;
}

/** A contacts feature — provides group-based people data rooted in a blueprint-owned folder. */
export interface ContactsFeatureEntry extends FeatureEntry {
    id: "contacts";
    peopleFolder: string;
    groups: ContactGroup[];
}

/** Discriminated union of all known feature types. Expand as new features are added. */
export type BlueprintFeature = DecorationsFeatureEntry | TaskCollectorFeatureEntry | ContactsFeatureEntry;

/**
 * Default files split by scope, as returned by `resolveDefaultFiles()`.
 * - `relative` — folder key matches any workspace root.
 * - `rootScoped` — folder key is prefixed with the root name at write time.
 */
export interface DefaultFileMap {
    relative: Record<string, string[]>;
    rootScoped: Record<string, string[]>;
}

/** The fully parsed, validated representation of a blueprint.yaml file. */
export interface BlueprintDefinition {
    id: string;
    name: string;
    description: string;
    version: string;
    workspace: WorkspaceEntry[];
    features: BlueprintFeature[];
    /**
     * Default files split by scope.
     * - `relative` keys (e.g. "00-ToDo/") match any workspace root.
     * - `rootScoped` keys (e.g. "00-ToDo/") are prefixed with the workspace root name
     *   at write time to produce root-specific keys in default-files.json.
     */
    defaultFiles?: DefaultFileMap;
}

/** Per-feature enabled/disabled state — stored in .memoria/features.json. */
export interface FeatureState {
    id: string;
    name: string;
    description: string;
    enabled: boolean;
}

/** Stored in .memoria/features.json — tracks user's feature toggle choices. */
export interface FeaturesConfig {
    features: FeatureState[];
}

/** Sub-object within BlueprintManifest that records task-collector metadata. */
export interface TaskCollectorManifestConfig {
    collectorPath: string;
}

/** Sub-object within BlueprintManifest that records contacts feature metadata. */
export interface ContactsManifestConfig {
    peopleFolder: string;
    groups: ContactGroup[];
}

/** Stored in .memoria/blueprint.json — tracks which blueprint was applied and file hashes. */
export interface BlueprintManifest {
    blueprintId: string;
    blueprintVersion: string;
    rootUri?: string;
    initializedAt: string;
    lastReinitAt: string | null;
    fileManifest: Record<string, string>;
    taskCollector?: TaskCollectorManifestConfig;
    contacts?: ContactsManifestConfig;
}

/**
 * Stored in .memoria/default-files.json — maps folder paths to their default file names.
 * File names are relative to the matched folder, not to the workspace root.
 * Keys are either relative (e.g. "00-ToDo/") matching any root,
 * or root-prefixed (e.g. "ProjectA/00-ToDo/") matching only the named root.
 * Root-prefixed keys take priority over relative keys.
 */

/** Configuration object for a single folder entry in default-files.json. */
export interface DefaultFilesEntry {
    /** The list of files to open when the command is triggered on this folder. */
    filesToOpen: string[];
    /**
     * When true (the default), all currently open editors are closed before opening
     * the new files. Set to false to open the files alongside existing editors.
     */
    closeCurrentlyOpenedFilesFirst?: boolean;
    /**
     * When true (the default), each file is opened in its own editor column (side by side).
     * Set to false to open all files as tabs in the active editor group.
     */
    openSideBySide?: boolean;
}

export interface DefaultFilesConfig {
    /** Map from folder path to either a `DefaultFilesEntry` object or a legacy `string[]`. */
    defaultFiles: Record<string, DefaultFilesEntry | string[]>;
}

/** Stored in .memoria/decorations.json — read by FileDecorationProvider at runtime. */
export interface DecorationsConfig {
    rules: DecorationRule[];
}

/** Stored in .memoria/dotfolders.json — tracks which files.exclude entries Memoria owns. */
export interface DotfoldersConfig {
    managedEntries: string[];
}

/** Summary info about a bundled blueprint — used to populate the QuickPick list. */
export interface BlueprintInfo {
    /** Folder name under resources/blueprints/, e.g. "individual-contributor". */
    id: string;
    name: string;
    description: string;
    version: string;
    path: vscode.Uri;
}

/**
 * Result of conflict analysis before re-initialization begins.
 * Produced by WorkspaceInitConflictResolver.resolveConflicts() after both QuickPicks complete.
 */
export interface ReinitPlan {
    /** All top-level on-disk folders absent from the new blueprint (input to folder picker). */
    extraFolders: string[];
    /**
     * Subset of extraFolders the user unchecked in the folder QuickPick — these will be moved
     * to WorkspaceInitializationBackups/. Kept folders remain in place (user chose to keep them).
     */
    foldersToCleanup: string[];
    /** Relative paths of conflicting files (input to file merge picker). All will be overwritten. */
    toMergeList: string[];
    /** Subset of toMergeList the user checked — diff editors will open for these after reinit. */
    filesToDiff: string[];
}

/**
 * Return type from scaffoldTree — maps every written file to its SHA-256 hash.
 */
export interface ScaffoldResult {
    /** Relative path → SHA-256 hash for every file that was created or overwritten. */
    fileManifest: Record<string, string>;
}
