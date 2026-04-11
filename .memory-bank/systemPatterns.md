# System Patterns — Memoria

## Architecture

```
extension.ts (activation, command registration, context key, versioning check)
  ├── commands/
  │   ├── initializeWorkspace.ts  — factory function → command handler
  │   └── toggleDotFolders.ts     — factory function → command handler
  ├── features/
  │   └── decorations/
  │       └── blueprintDecorationProvider.ts — FileDecorationProvider, reads .memoria/decorations.json
  └── blueprints/
      ├── types.ts                — shared data contracts (interfaces only)
      ├── blueprintParser.ts      — YAML → BlueprintDefinition (pure, no vscode)
      ├── blueprintRegistry.ts    — discovers bundled blueprints via extensionUri
      ├── manifestManager.ts      — .memoria/ R/W, SHA-256 hashing, single owner of metadata dir
      ├── fileScaffold.ts         — creates folders/files via vscode.workspace.fs
      ├── blueprintEngine.ts      — thin orchestrator (init + reinit flows)
      └── reinitConflictResolver.ts — conflict resolution UI (folder cleanup, file overwrite prompts)
```

## Key Design Patterns

### Factory Functions for Commands
Command handlers are created by factory functions (`createInitializeWorkspaceCommand`, `createToggleDotFoldersCommand`) that receive dependencies at construction time. This avoids classes for single-operation callbacks while preserving testability via DI.

### Composition in Engine
`BlueprintEngine` is a thin orchestrator that sequences calls to `BlueprintRegistry`, `FileScaffold`, and `ManifestManager`. All domain logic lives in the collaborators; the engine just sequences them.

### Single Owner of `.memoria/`
`ManifestManager` is the sole component that reads/writes the `.memoria/` directory. It handles `blueprint.json`, `decorations.json`, and `dotfolders.json`. All write methods call `ensureMemoriaDir()` internally, so no other component needs to know about the metadata folder structure.

### SKIP_FILE Symbol
`FileScaffold` exports a `SKIP_FILE` symbol that seed callbacks return to signal "do not overwrite this file". This avoids boolean/null ambiguity and enables clean scaffold result tracking (`skippedPaths`).

### Single-Root `.memoria` Enforcement
In multi-root workspaces, only one root may have `.memoria/` at a time. `ManifestManager.findInitializedRoot()` discovers which root (if any) is initialized, and `deleteMemoriaDir()` removes `.memoria/` from the old root before initializing/re-initializing a different one.

## Behavioral Decisions

### Cleanup Timing (Multi-Root)
When initializing a different root in a multi-root workspace, deletion of the old root's `.memoria/` happens **after** the user has selected both the root and the blueprint, but **before** `engine.initialize`/`engine.reinitialize` is called. This ensures the old `.memoria/` is NOT deleted if the user cancels the blueprint selection QuickPick.

### Re-Initialization Conflict Resolution
- **Folder cleanup**: Extra top-level folders (absent from the new blueprint) are offered for move to `ReInitializationCleanup/`. `.memoria` and `ReInitializationCleanup` themselves are always excluded.
- **Different blueprint detection**: When `currentManifest.blueprintId !== newDefinition.id`, ALL top-level folders are treated as "extra" (aggressive cleanup).
- **Per-file prompts**: Modified files prompt the user with 4 choices: Yes, Yes-folder, Yes-folder-recursive, No. Scope decisions are memoized to avoid redundant prompts.
- **Skipped file hashing**: Files the user skips get their current on-disk hash recorded in the manifest, so future re-inits can detect further modifications.

## Component Relationships
- `extension.ts` creates all collaborators and wires them together; also runs `checkForBlueprintUpdates()` on activation
- `BlueprintEngine` depends on `BlueprintRegistry`, `ManifestManager`, `FileScaffold`
- `initializeWorkspace` command depends on `BlueprintEngine`, `BlueprintRegistry`, `ManifestManager`, `ReinitConflictResolver`
- `toggleDotFolders` command depends on `ManifestManager`
- `BlueprintDecorationProvider` depends on `ManifestManager` (reads decorations.json, discovers root)
- `BlueprintParser` is pure (no vscode dependency) — used only by `BlueprintRegistry`

## BlueprintDecorationProvider Pattern
- Registered via `vscode.window.registerFileDecorationProvider` in `extension.ts`
- `refresh()` self-discovers the initialized root via `findInitializedRoot()` — callers do not pass the root URI, keeping the `onWorkspaceInitialized` callback signature unchanged
- `matchesFilter(filter, relativePath)` — exported for unit testability; handles three syntaxes:
  - `"FolderName/"` → matches any item whose last path segment equals `FolderName`
  - `"*.ext"` → matches any item whose filename ends with `.ext`
  - `"exact/path"` → exact workspace-relative path match
- Returns `undefined` (no decoration) for items outside the workspace root, the root itself, or when no rule matches
- Fires `onDidChangeFileDecorations(undefined)` after each `refresh()` to re-query all URIs

## Blueprint Versioning UX Pattern
`checkForBlueprintUpdates()` in `extension.ts`:
1. Finds initialized root via `ManifestManager.findInitializedRoot()`
2. Reads stored `blueprintId` + `blueprintVersion` from `.memoria/blueprint.json`
3. Loads bundled definition for that ID; skips silently if ID no longer bundled
4. Calls `isNewerVersion(bundled, stored)` — plain major.minor.patch comparison
5. If newer: shows info message with "Re-initialize" / "Later"; on confirmation triggers `engine.reinitialize()`
