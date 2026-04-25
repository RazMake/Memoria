# System Patterns — Memoria

## Architecture

```text
extension.ts (activation, DI wiring, versioning check)
  ├── defaultFileContext.ts       — default-file context key management + watchers
  ├── registerFileWatchers()      — per-root .memoria/blueprint.json watchers + onDidDeleteFiles
  ├── registerCommands()          — command registration
  ├── commands/
  │   ├── initializeWorkspace.ts  — factory function → command handler
  │   ├── toggleDotFolders.ts     — factory function → command handler
  │   ├── manageFeatures.ts       — factory function → command handler
  │   ├── openDefaultFile.ts      — factory function → open blueprint-defined file for folder
  │   ├── openUserGuide.ts        — factory function → open bundled markdown docs
  │   ├── syncTasks.ts            — factory function → manual task synchronization trigger
  │   └── contactCommands.ts      — factory functions → add/edit/delete/move contact handlers
  ├── features/
  │   ├── featureManager.ts       — feature toggle orchestrator
  │   ├── decorations/
  │   │   ├── blueprintDecorationProvider.ts — FileDecorationProvider, reads .memoria/decorations.json
  │   │   ├── decorationCompletionProvider.ts — JSON completions for decorations.json
  │   │   ├── decorationColorProvider.ts     — color swatches for decoration rules
  │   │   ├── decorationSchema.ts            — field metadata for decoration rules
  │   │   └── themeColors.ts                 — theme color ID constants
  │   ├── navigator/
  │   │   └── defaultFileCompletionProvider.ts — IntelliSense completions for default-files.json paths
  │   ├── contacts/
  │   │   ├── contactsFeature.ts      — feature lifecycle, contacts service/query API, file watching, mutations
  │   │   ├── contactsViewProvider.ts — WebviewViewProvider for the Contacts Activity Bar panel
  │   │   ├── contactParser.ts        — pure markdown dictionary parsing/serialization for contacts + reference data
  │   │   ├── contactUtils.ts         — pure builder/clone helpers for resolved contacts + reference data
  │   │   ├── integrityCheck.ts       — pure dangling-reference detection/correction helpers
  │   │   ├── titleGenerator.ts       — canonical normal/short title generation from career paths + levels
  │   │   ├── referenceDefaults.ts    — code-only fallbacks for unknown pronoun/career/interview references
  │   │   ├── types.ts                — Contact, ResolvedContact, ContactsReferenceData, form messages
  │   │   └── webview/main.ts         — browser-side contacts sidebar UI (bundled to dist/contacts-webview.js)
  │   ├── taskCollector/
  │   │   ├── taskCollectorFeature.ts — feature lifecycle, sync orchestration, file watching, reconciliation
  │   │   ├── taskParser.ts           — parse markdown task lists from source and collector formats
  │   │   ├── taskIndex.ts            — stable task identity management (.memoria/tasks-index.json)
  │   │   ├── taskAlignment.ts        — Myers-diff-style alignment for rename-safe task matching
  │   │   ├── syncQueue.ts            — debounced job queue (source debounce, immediate full sync)
  │   │   ├── pathRewriter.ts         — rewrite relative image/link paths when tasks move between files
  │   │   ├── taskWriter.ts           — line-range replacement in source markdown files
  │   │   ├── pendingWrites.ts        — self-write suppression to prevent sync → save → sync loops
  │   │   ├── renameHandler.ts        — update collector paths when source files are renamed
  │   │   ├── aging.ts                — remove stale completed tasks after configurable period
  │   │   ├── collectorFormatter.ts   — render collector document from task index
  │   │   └── types.ts                — SyncJob, ParsedTask, StoredTaskIndex, etc.
  │   └── todoEditor/
  │       ├── types.ts                — UITask, ToWebviewMessage, ToExtensionMessage
  │       ├── documentSerializer.ts   — pure parse/mutate functions for .todo.md
  │       ├── todoEditorProvider.ts   — CustomTextEditorProvider, webview lifecycle
  │       └── webview/main.ts         — browser-side UI (IIFE bundle → dist/webview.js)
  └── blueprints/
      ├── types.ts                — shared data contracts (interfaces only)
      ├── blueprintParser.ts      — YAML → BlueprintDefinition (pure, no vscode)
      ├── blueprintRegistry.ts    — discovers bundled blueprints via extensionUri
      ├── manifestManager.ts      — .memoria/ R/W, single owner of metadata dir
      ├── hashUtils.ts            — SHA-256 hashing (single source of truth)
      ├── workspaceUtils.ts       — shared getWorkspaceRoots()
      ├── fileScaffold.ts         — creates folders/files via vscode.workspace.fs
      ├── blueprintEngine.ts      — thin orchestrator (init + reinit flows)
      └── workspaceInitConflictResolver.ts — conflict resolution UI (folder cleanup, file overwrite prompts)
```

## Key Design Patterns

### Factory Functions for Commands
Command handlers are created by factory functions (`createInitializeWorkspaceCommand`, `createToggleDotFoldersCommand`) that receive dependencies at construction time. This avoids classes for single-operation callbacks while preserving testability via DI.

Contacts commands follow the same pattern (`createAddPersonCommand`, `createEditPersonCommand`, `createDeletePersonCommand`, `createMovePersonCommand`). Palette invocation uses QuickPick fallback; sidebar invocation passes the contact id directly.

### Dependency Injection
- All classes take dependencies via constructor injection
- `typeof vscode.workspace.fs` is the FS abstraction — unit tests pass mock, E2E uses real `vscode.workspace.fs`
- `BlueprintEngine` takes `fs` separately from `FileScaffold` — engine uses its own `fs` for reinit cleanup ops, scaffold keeps its `fs` private
- `WorkspaceInitConflictResolver` imports `computeFileHash` directly (no callback injection needed)
- `ManifestManager` does NOT wrap `computeFileHash` — callers import from `hashUtils` directly

### Shared Utilities
- `src/blueprints/hashUtils.ts` — single source of truth for SHA-256 hashing via `computeFileHash(content: Uint8Array): string`
- `src/blueprints/workspaceUtils.ts` — shared `getWorkspaceRoots()` eliminates 3× duplicated `workspaceFolders?.map(f => f.uri) ?? []`
- Module-level `TextDecoder`/`TextEncoder` singletons in ManifestManager and BlueprintRegistry (avoids per-call allocation)

### Shared Seed Files (`seedSource`)
Blueprint workspace entries can reference shared seed files via `seedSource: "relative/path"` instead of keeping duplicate files in each blueprint's `files/` directory. Shared seeds live in `resources/blueprints/_shared/`. The `BlueprintRegistry` provides `getSharedSeedContent(seedSource)` alongside the per-blueprint `getSeedFileContent(id, path)`. The engine's `buildSeedSourceMap()` walks the workspace tree and routes seed callbacks accordingly. `listBlueprints()` skips `_`-prefixed directories so `_shared` is never treated as a blueprint.

### Composition in Engine
`BlueprintEngine` is a thin orchestrator that sequences calls to `BlueprintRegistry`, `FileScaffold`, and `ManifestManager`. All domain logic lives in the collaborators; the engine just sequences them.

Contacts extends this pattern: blueprint YAML declares only the initial contacts config (`peopleFolder` + group files), and `ContactsFeature` owns the runtime concerns such as custom-group discovery, reference-data loading, watcher-driven reloads, and integrity rewrites.

### Single Owner of `.memoria/`
`ManifestManager` is the sole component that reads/writes the `.memoria/` directory. It handles `blueprint.json`, `decorations.json`, and `dotfolders.json`. All write methods call `ensureMemoriaDir()` internally, so no other component needs to know about the metadata folder structure.

### SKIP_FILE Symbol
`FileScaffold` exports a `SKIP_FILE` symbol that seed callbacks return to signal "do not overwrite this file". This avoids boolean/null ambiguity and enables clean scaffold result tracking (`skippedPaths`).

### Single-Root `.memoria` Enforcement
In multi-root workspaces, only one root may have `.memoria/` at a time. `ManifestManager.findInitializedRoot()` discovers which root (if any) is initialized, and `deleteMemoriaDir()` removes `.memoria/` from the old root before initializing/re-initializing a different one.

## Behavioral Decisions

### ⛔ Protected Behavioral Rules
The following rules define core extension behavior. **No implementation change may violate these rules without explicit user confirmation.** If a requested change would depart from any of these, explain which rule is affected and ask the user to approve.

1. **Normal + multi-root workspace support** — The extension works in both single-folder workspaces and multi-root workspaces. All user-facing features must function correctly in both modes.
2. **Single initialized root, cross-root features** — In multi-root workspaces, only one root may hold `.memoria/` at a time. However, features that consume config from `.memoria/` (decorations, open-default-file, default-file context keys, file watchers) apply across **all** workspace roots/folders, not just the initialized one.
3. **Config stays in initialized root only** — All configuration files (including `default-files.json`) must remain in the single initialized root's `.memoria/` directory. Config must never be spread across multiple roots.

### Cleanup Timing (Multi-Root)
When initializing a different root in a multi-root workspace, deletion of the old root's `.memoria/` happens **after** the user has selected both the root and the blueprint, but **before** `engine.initialize`/`engine.reinitialize` is called. This ensures the old `.memoria/` is NOT deleted if the user cancels the blueprint selection QuickPick.

### Re-Initialization Conflict Resolution
- **Folder cleanup**: Extra top-level folders (absent from the new blueprint) are offered for move to `ReInitializationCleanup/`. `.memoria` and `ReInitializationCleanup` themselves are always excluded.
- **Different blueprint detection**: When `currentManifest.blueprintId !== newDefinition.id`, ALL top-level folders are treated as "extra" (aggressive cleanup).
- **Per-file prompts**: Modified files prompt the user with 4 choices: Yes, Yes-folder, Yes-folder-recursive, No. Scope decisions are memoized to avoid redundant prompts.
- **Skipped file hashing**: Files the user skips get their current on-disk hash recorded in the manifest, so future re-inits can detect further modifications.

## Testing Conventions
- vscode module is fully mocked in all unit tests via `vi.mock("vscode", ...)`
- Each test file re-declares mock functions at module scope
- workspaceInitConflictResolver tests use real `computeFileHash` from hashUtils (not fake hashes)
- `tests/unit-tests/packageJson.test.ts` — **contract tests** enforce that every command in `package.json` has a `commandPalette` entry with a `when: "memoria.workspaceInitialized"` guard. If a command should genuinely always be visible (like `initializeWorkspace`), add it to the `ALWAYS_VISIBLE` set in that test file — this makes the exemption explicit and reviewable.

## Optimization Patterns

### Parallel I/O
- Use `Promise.all()` for independent fs operations (reads, renames, stats)
- `findInitializedRoot`: parallel stat checks across workspace roots
- Blueprint listing: parallel YAML reads via `Promise.all(dirs.map(...))`
- Folder renames during reinit: `Promise.all` since destinations are distinct
- `resolveConflicts`: parallel hash reads across blueprint files via `Promise.all(flatFiles.map(...))`

### Avoid Redundant Lookups
- After init/reinit, pass the known workspace root through callbacks: `onWorkspaceInitialized(root: vscode.Uri)`
- `decorationProvider.refresh(knownRoot)` and `updateWorkspaceInitializedContext(knownRoot)` skip `findInitializedRoot()`
- Accept pre-computed root as optional param to avoid re-discovery
- `recheckInitialization()` caches last-known root string; skips context/feature updates when unchanged
- `ReinitPlan.currentFileHashes` caches hashes computed during conflict analysis so the engine avoids re-reading files for skipped paths

### Encapsulation
- Never expose `fs` handle publicly just so another class can use it — inject `fs` into both classes separately
- `FileScaffold.fs` is `private readonly`; `BlueprintEngine` has its own `fs` injection for reinit operations

### Activation Performance
- Defer heavy work via `queueMicrotask()` or `void promise.catch()`
- Background update checks must not block decoration rendering
- Pre-compute and cache decorations at refresh time, not per `provideFileDecoration()` call
- Webview-backed features should keep the provider thin and push expensive parsing/resolution work into the feature layer before posting snapshots

### Refactoring Complex Closures
- Extract large inline closures to named private methods (e.g. `buildReinitSeedCallback`)
- Move local state (Sets, Maps) that the closure captures into the extracted method's scope

## Component Relationships
- `extension.ts` creates all collaborators and wires them together; also runs `checkForBlueprintUpdates()` on activation
- `BlueprintEngine` depends on `BlueprintRegistry`, `ManifestManager`, `FileScaffold`
- `initializeWorkspace` command depends on `BlueprintEngine`, `BlueprintRegistry`, `ManifestManager`, `WorkspaceInitConflictResolver`
- `toggleDotFolders` command depends on `ManifestManager`
- `BlueprintDecorationProvider` depends on `ManifestManager` (reads decorations.json, discovers root)
- `BlueprintParser` is pure (no vscode dependency) — used only by `BlueprintRegistry`
- `TodoEditorProvider` depends on `ManifestManager` (reads task index), `documentSerializer` (parse/mutate .todo.md), `taskParser` (parse source files for write-back), `taskWriter.replaceLineRange` (source file edits). Registered/disposed dynamically via `FeatureManager` callback for `taskCollector`. Webview communicates via message protocol (`ToWebviewMessage`/`ToExtensionMessage`).
- `ContactsFeature` depends on `ManifestManager` for persisted blueprint config, reuses the shared path-normalization utility, and exposes the contacts/query/mutation surface used by both commands and the sidebar provider.
- `ContactsViewProvider` depends on `ContactsFeature` update + form-request hooks, keeps the webview HTML shell/CSP concerns in one place, and maps runtime snapshots into a UI-specific message protocol.
- `TaskCollectorFeature` depends on `ManifestManager` (reads task-collector config + task index), uses `SyncQueue` for debounced job dispatch, `TaskIndex` for stable identity tracking, `PendingWrites` for self-write suppression, `RenameHandler` for source file rename tracking, and pure modules (`taskParser`, `pathRewriter`, `collectorFormatter`, `taskAlignment`, `aging`) for the sync pipeline. Registered/disposed dynamically via `FeatureManager` callback for `taskCollector`.

## BlueprintDecorationProvider Pattern
- Registered via `vscode.window.registerFileDecorationProvider` in `extension.ts`
- `refresh(initializedRoot, enabled, allRoots)` receives the initialized root and all workspace roots from `FeatureManager` — rules are read from the initialized root but applied across all roots
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
