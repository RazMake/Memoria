// Data contracts shared between all blueprint subsystem components.
// These interfaces define the shape of data flowing between parser, registry,
// scaffold, manifest manager, and engine — keeping each component loosely coupled.

import * as vscode from "vscode";

/** A single entry in the blueprint workspace tree — either a folder or a file. */
export interface WorkspaceEntry {
    name: string;
    isFolder: boolean;
    children?: WorkspaceEntry[];
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

/** Discriminated union of all known feature types. Expand as new features are added. */
export type BlueprintFeature = DecorationsFeatureEntry;

/** The fully parsed, validated representation of a blueprint.yaml file. */
export interface BlueprintDefinition {
    id: string;
    name: string;
    description: string;
    version: string;
    workspace: WorkspaceEntry[];
    features: BlueprintFeature[];
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

/** Stored in .memoria/blueprint.json — tracks which blueprint was applied and file hashes. */
export interface BlueprintManifest {
    blueprintId: string;
    blueprintVersion: string;
    rootUri?: string;
    initializedAt: string;
    lastReinitAt: string | null;
    fileManifest: Record<string, string>;
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
 * The user's choice when prompted about a user-modified file during re-initialization.
 * Controls whether the blueprint version overwrites the user's changes.
 */
export type OverwriteChoice = "yes" | "yes-folder" | "yes-folder-recursive" | "no";

/**
 * Result of conflict analysis before re-initialization begins.
 * Folder cleanup decisions are captured here; per-file overwrite decisions
 * are made interactively during the re-init scaffold pass.
 */
export interface ReinitPlan {
    /** Relative paths of extra folders the user chose to move to ReInitializationCleanup/. */
    foldersToCleanup: string[];
    /** Blueprint file paths whose stored hash matches the on-disk content (safe to overwrite silently). */
    unmodifiedBlueprintFiles: string[];
    /** Blueprint file paths whose on-disk content differs from the stored hash (user has modified them). */
    modifiedBlueprintFiles: string[];
    /** Cached on-disk hashes computed during conflict analysis — avoids re-reading files in the engine. */
    currentFileHashes: Record<string, string | null>;
}

/**
 * Extended return type from scaffoldTree — separates created files from explicitly skipped files.
 * Skipped files are those the user chose not to overwrite during re-initialization.
 */
export interface ScaffoldResult {
    /** Relative path → SHA-256 hash for every file that was created or overwritten. */
    fileManifest: Record<string, string>;
    /** Relative paths of files that were skipped (not created or overwritten). */
    skippedPaths: string[];
}
