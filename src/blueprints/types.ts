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
}

/** The fully parsed, validated representation of a blueprint.yaml file. */
export interface BlueprintDefinition {
    id: string;
    name: string;
    description: string;
    version: string;
    workspace: WorkspaceEntry[];
    decorations: DecorationRule[];
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
