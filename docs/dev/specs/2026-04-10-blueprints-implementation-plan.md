# Implementation Plan: Blueprints — Workspace Scaffolding

**Date**: 2026-04-10
**PRD**: [2026-04-10-blueprints-workspace-scaffolding.md](2026-04-10-blueprints-workspace-scaffolding.md)

Implement the Blueprints feature across 3 phases (MVP → Core Polish → Visual & UX) as defined in the PRD. The feature lets users scaffold a personal knowledge base workspace from bundled YAML-defined templates, with re-initialization, dot-folder toggling, and file decorations.

---

## Source Structure

Mirror test folders to `src/` as required by testing guidelines.

```
src/
  extension.ts                          # Update: wire new commands + decoration provider
  telemetry.ts                          # Existing — no changes
  blueprints/
    types.ts                            # Shared interfaces: BlueprintDefinition, BlueprintManifest, WorkspaceEntry, DecorationRule
    blueprintParser.ts                  # Parses blueprint.yaml → typed tree + decoration rules, validates structure
    blueprintRegistry.ts                # Discovers bundled blueprints under resources/blueprints/
    fileScaffold.ts                     # Creates folders + copies seed files via vscode.workspace.fs
    manifestManager.ts                  # Reads/writes .memoria/blueprint.json, .memoria/decorations.json, .memoria/dotfolders.json, computes SHA-256 via Node crypto
    blueprintEngine.ts                  # Orchestrates init/reinit by composing parser, scaffold, manifest
    reinitConflictResolver.ts           # (Phase 2) Conflict resolution UI + logic for re-init
  commands/
    initializeWorkspace.ts              # Command handler: root selection, QuickPick blueprint, delegates to engine
    toggleDotFolders.ts                 # (Phase 2) Command handler: files.exclude management via .memoria/dotfolders.json
  features/                            # Extensible folder for self-contained feature modules
    decorations/
      blueprintDecorationProvider.ts   # (Phase 3) FileDecorationProvider reading from .memoria/decorations.json
  resources/
    blueprints/
      individual-worker/
        blueprint.yaml
        files/                          # Seed file contents
      manager/
        blueprint.yaml
        files/

tests/
  unit-tests/
    blueprints/
      blueprintParser.test.ts
      blueprintRegistry.test.ts
      fileScaffold.test.ts
      manifestManager.test.ts
      blueprintEngine.test.ts
      reinitConflictResolver.test.ts    # Phase 2
    commands/
      initializeWorkspace.test.ts
      toggleDotFolders.test.ts          # Phase 2
    features/                           # Mirrors src/features/
      decorations/
        blueprintDecorationProvider.test.ts  # Phase 3
  e2e-tests/
    extension.test.ts                   # Existing — update to check new commands
    helpers.ts                          # Existing — extend with blueprint helpers
    blueprints/
      initializeWorkspace.test.ts       # E2E: full init + verify file tree
      reinitializeWorkspace.test.ts     # Phase 2 E2E
    fixtures/
      empty-workspace/                  # Existing
```

---

## Phase 1 — MVP (single-root init, 2 bundled blueprints)

### Step 0: Baseline verification

- Run `cd src && npm run build` — verify esbuild completes without errors.
- Run `cd src && npm test` — verify all existing unit tests pass.
- Run `cd src && npm run compile:tests` — verify E2E test compilation succeeds.
- Fix `tests/e2e-tests/tsconfig.json`: add `"typeRoots": ["../../src/node_modules/@types"]` to `compilerOptions` so `@types/mocha` and `@types/node` resolve correctly (they are installed under `src/node_modules/`, which is not an ancestor of `tests/e2e-tests/`).
- Confirm all three commands pass before proceeding to Step 1.

### Step 1: Add `yaml` dependency

- `npm install yaml` in `src/` — adds to `dependencies` in package.json.
- esbuild bundles it (NOT added to `external`) since it's pure JS with no CJS issues.
- `.vscodeignore` already excludes `node_modules/`, so bundling is required for runtime availability.

### Step 2: Create `src/blueprints/types.ts`

- Define `WorkspaceEntry` interface: `name: string`, `isFolder: boolean`, `children?: WorkspaceEntry[]`.
- Define `DecorationRule` interface: `filter: string`, `color?: string`, `badge?: string`.
- Define `BlueprintDefinition` interface: `name: string`, `description: string`, `version: string`, `workspace: WorkspaceEntry[]`, `decorations: DecorationRule[]`.
- Define `BlueprintManifest` interface: `blueprintName: string`, `blueprintVersion: string`, `rootUri?: string`, `initializedAt: string`, `lastReinitAt: string | null`, `fileManifest: Record<string, string>`.
- Define `DecorationsConfig` interface: `rules: DecorationRule[]`.
- Define `DotfoldersConfig` interface: `managedEntries: string[]`.
- Define `BlueprintInfo` interface (for registry listing): `id: string` (folder name), `name: string`, `description: string`, `version: string`, `path: vscode.Uri`.
- Add purpose comment at top of file explaining these are the data contracts between blueprint subsystem components.

### Step 3: Create `src/blueprints/blueprintParser.ts`

- Export `parseBlueprintYaml(content: string): BlueprintDefinition` — uses `yaml` package to parse, validates required fields (name, description, version, workspace), throws descriptive errors on invalid structure.
- Export `parseWorkspaceTree(raw: unknown): WorkspaceEntry[]` — recursive function that normalizes the YAML workspace tree into typed `WorkspaceEntry[]`. Each raw entry must have a `name` field; names ending in `/` are folders. Folders may have a `children` array. Files cannot have `children`.
- Export `parseDecorationRules(raw: unknown): DecorationRule[]` — validates the `decorations` array from YAML. Each rule must have a `filter` string. Badge is ≤2 chars, color is a non-empty string if present. Returns empty array if section is absent.
- Pure functions — no VS Code API dependency → fully unit-testable.
- Add comment explaining the YAML schema contract and why validation happens at parse time (fail-fast before any filesystem operations).

### Step 4: Create `src/blueprints/blueprintRegistry.ts`

- Export `BlueprintRegistry` class.
- Constructor receives `extensionUri: vscode.Uri` (from `context.extensionUri`).
- `listBlueprints(): Promise<BlueprintInfo[]>` — reads `resources/blueprints/` directory via `vscode.workspace.fs.readDirectory`, parses each `blueprint.yaml` to extract name/description/version, returns array of `BlueprintInfo`.
- `getBlueprintDefinition(id: string): Promise<BlueprintDefinition>` — reads and parses full `blueprint.yaml` for the given blueprint.
- `getSeedFileContent(blueprintId: string, relativePath: string): Promise<Uint8Array | null>` — reads from `files/` subdirectory. Returns null if no seed file exists (empty file will be created by scaffold).
- Comment explaining why blueprints are resolved via `extensionUri` (works in both dev and installed extension contexts).

### Step 5: Create `src/blueprints/manifestManager.ts`

- Export `ManifestManager` class.
- Constructor receives `fs: typeof vscode.workspace.fs` (inject for testability, same pattern as `FileScaffold`).
- `computeFileHash(content: Uint8Array): string` — SHA-256 via Node `crypto.createHash`. Returns `sha256:<lowercase hex>`.
- **Directory ownership:** All write methods (`writeManifest`, `writeDecorations`, `writeDotfolders`) ensure the `.memoria/` directory exists (via `fs.createDirectory`) before writing. This makes `ManifestManager` the single owner of `.memoria/` directory creation — callers never need to create it manually.
- `readManifest(workspaceRoot: vscode.Uri): Promise<BlueprintManifest | null>` — reads `.memoria/blueprint.json` via `vscode.workspace.fs`. Returns null if not found.
- `writeManifest(workspaceRoot: vscode.Uri, manifest: BlueprintManifest): Promise<void>` — ensures `.memoria/` exists, then writes `blueprint.json` as formatted JSON.
- `readDecorations(workspaceRoot: vscode.Uri): Promise<DecorationsConfig | null>` — reads `.memoria/decorations.json`. Returns null if not found.
- `writeDecorations(workspaceRoot: vscode.Uri, config: DecorationsConfig): Promise<void>` — ensures `.memoria/` exists, then writes `decorations.json`.
- `readDotfolders(workspaceRoot: vscode.Uri): Promise<DotfoldersConfig | null>` — reads `.memoria/dotfolders.json`. Returns null if not found.
- `writeDotfolders(workspaceRoot: vscode.Uri, config: DotfoldersConfig): Promise<void>` — ensures `.memoria/` exists, then writes `dotfolders.json`.
- `isInitialized(workspaceRoot: vscode.Uri): Promise<boolean>` — checks if `.memoria/blueprint.json` exists.
- Comment on why SHA-256 is used (detect user modifications for safe re-init, per PRD).
- Comment on why ManifestManager owns `.memoria/` directory creation (single responsibility — no other component needs to know about the metadata folder structure).

### Step 6: Create `src/blueprints/fileScaffold.ts`

- Export `FileScaffold` class.
- Constructor receives `fs: typeof vscode.workspace.fs` (inject for testability — can be mocked in unit tests).
- `scaffoldTree(rootUri: vscode.Uri, entries: WorkspaceEntry[], getSeedContent: (path: string) => Promise<Uint8Array | null>): Promise<Record<string, string>>` — recursively creates folders and files. Returns a `fileManifest` map (relative path → SHA-256 hash) for all created files.
  - For folders: `fs.createDirectory`.
  - For files: reads seed content via callback, falls back to empty `Uint8Array` if null. Writes via `fs.writeFile`. Computes hash of written content.
- **Path validation:** Before creating any file or folder, verify the resolved URI starts with `rootUri`. Reject entries containing `..` path segments. This prevents blueprint definitions from writing outside the workspace root.
- **Path normalization:** All manifest paths use forward slashes (`/`), regardless of OS.
- Uses `vscode.workspace.fs` exclusively (not Node `fs`) for virtual filesystem compatibility per PRD requirement.
- Comment explaining why the manifest is built during scaffolding (single pass, avoids re-reading files).

### Step 7: Create `src/blueprints/blueprintEngine.ts`

- Export `BlueprintEngine` class.
- Constructor receives: `registry: BlueprintRegistry`, `manifest: ManifestManager`, `scaffold: FileScaffold`.
- `initialize(workspaceRoot: vscode.Uri, blueprintId: string): Promise<void>` — orchestrates:
  1. Get blueprint definition from registry.
  2. Scaffold file tree (with seed content callback to registry).
  3. Build manifest from scaffold result.
  4. Write manifest to `.memoria/blueprint.json`.
  5. Write decoration rules to `.memoria/decorations.json` (from blueprint's `decorations` section).
- Returns void; errors thrown on failure (caller handles UI).
- Comment explaining the composition pattern: engine is a thin orchestrator, all logic lives in collaborators.

### Step 8: Create `src/commands/initializeWorkspace.ts`

- Export `createInitializeWorkspaceCommand(engine: BlueprintEngine, registry: BlueprintRegistry, manifest: ManifestManager, telemetry: vscode.TelemetryLogger): (...args: any[]) => Promise<void>` — factory that returns the command handler function.
- **Telemetry injection:** The factory accepts a `vscode.TelemetryLogger` directly. The existing `createTelemetry()` in `telemetry.ts` returns `TelemetryReporterLike | vscode.TelemetryLogger` — a union of incompatible types (`TelemetryReporterLike` is an opaque `Disposable` with no event methods; `TelemetryLogger` has `logUsage()`). To resolve this, `extension.ts` will constrain the telemetry instance: when no connection string is configured (the default dev path), `createTelemetry()` returns a `TelemetryLogger` which is passed directly to the command factory. When a connection string is present, `extension.ts` wraps the `TelemetryReporter` in a `vscode.TelemetryLogger` via `vscode.env.createTelemetryLogger()` so that all downstream consumers receive a uniform `TelemetryLogger` interface.
- Handler logic:
  1. Get workspace folder. If no workspace open, show error and return.
  2. Check if already initialized via `manifest.isInitialized()`. If yes, show info message "Workspace already initialized" (re-init is Phase 2).
  3. List blueprints via `registry.listBlueprints()`.
  4. Show QuickPick with blueprint name and description.
  5. On selection, call `engine.initialize(rootUri, blueprintId)`.
  6. Show success information message.
  7. Emit telemetry event `blueprint.init` via `telemetry.logUsage()`.
- Error handling: catch and display via `vscode.window.showErrorMessage`.
- Comment explaining why this is a factory (dependency injection for testability, follows existing telemetry pattern).

### Step 9: Wire up in `extension.ts`

- Import and instantiate: `BlueprintRegistry`, `ManifestManager`, `FileScaffold`, `BlueprintEngine`.
- **Telemetry wiring:** The `createTelemetry()` return value must be normalized to a `vscode.TelemetryLogger` before passing to command factories. When `createTelemetry()` returns a `TelemetryLogger` (no connection string), use it directly. When it returns a `TelemetryReporterLike` (with connection string), the extension entry point must adapt it — however, since Phase 1 has no connection string, simply assert/cast the dev-path `TelemetryLogger` for now. A proper adapter will be added when a connection string is configured (pre-publish).
- Create command handler via `createInitializeWorkspaceCommand(engine, registry, manifest, telemetry)`.
- Replace the existing placeholder `registerCommand` callback with the real handler.
- Push all disposables to `context.subscriptions`.

### Step 10: Create bundled blueprints

**Note:** This step must be completed before Step 12 (unit tests) and Step 13 (E2E tests), because blueprint YAML files serve as test fixtures.

- `src/resources/blueprints/individual-worker/blueprint.yaml` — "Individual Contributor Notebook" blueprint:
  ```yaml
  name: "Individual Contributor Notebook"
  description: "A personal knowledge base for developers and PMs."
  version: "1.0.0"

  workspace:
    - name: "00-ToDo/"
      children:
        - name: "Main.todo"
    - name: "01-ToRemember/"
    - name: "02-MeetingNotes/"
    - name: "03-Inbox/"
    - name: "04-Archive/"

  decorations:
    - filter: "00-ToDo/"
      color: "charts.yellow"
      badge: "TD"
    - filter: "04-Archive/"
      color: "charts.grey"
  ```
- `src/resources/blueprints/manager/blueprint.yaml` — "People Manager Notebook" blueprint:
  ```yaml
  name: "People Manager Notebook"
  description: "For managers: meeting notes, 1:1s, team contacts, and project status."
  version: "1.0.0"

  workspace:
    - name: "00-ToDo/"
      children:
        - name: "Main.todo"
    - name: "01-People/"
    - name: "02-ToRemember/"
    - name: "03-MeetingNotes/"
      children:
        - name: "1-1/"
        - name: "Ad-hoc/"
        - name: "WOR/"
    - name: "04-Inbox/"
    - name: "05-Archive/"

  decorations:
    - filter: "00-ToDo/"
      color: "charts.yellow"
      badge: "TD"
    - filter: "01-People/"
      color: "charts.blue"
    - filter: "05-Archive/"
      color: "charts.grey"
  ```
- Seed file `Main.todo` content (shared across both blueprints via their respective `files/00-ToDo/Main.todo`):
  ```
  # Active
  - [ ] Add here all your ToDos and sort them in the order they should be completed.

  # Completed
  - [x] This todo has been completed
     - Completed on: 2026-03-25
  ```
- Both `files/` directories contain only `00-ToDo/Main.todo` for MVP.
- Ensure `.vscodeignore` does NOT exclude `resources/` (currently it doesn't — only `.ts`, `node_modules`, etc. are excluded).

### Step 11: Update `package.json`

- Add `yaml` to `dependencies`.
- Verify `contributes.commands` and `contributes.menus` are correct for `memoria.initializeWorkspace`.

### Step 12: Unit tests (Phase 1)

- `tests/unit-tests/blueprints/blueprintParser.test.ts` — test valid YAML parsing, invalid YAML errors, missing fields, folder vs file detection via `name` suffix, children on files rejected, decoration rule parsing (filter, badge ≤2 chars, color validation), empty decorations section.
- `tests/unit-tests/blueprints/blueprintRegistry.test.ts` — test listing blueprints, getting definitions, seed file resolution (mock `vscode.workspace.fs`).
- `tests/unit-tests/blueprints/fileScaffold.test.ts` — test folder creation, file creation with seed content, empty file fallback, manifest hash generation, **path traversal rejection** (`../` entries throw) (mock `fs`).
- `tests/unit-tests/blueprints/manifestManager.test.ts` — test hash computation (lowercase hex), manifest read/write, decorations read/write, dotfolders read/write, isInitialized check (mock `vscode.workspace.fs`).
- `tests/unit-tests/blueprints/blueprintEngine.test.ts` — test orchestration: verify it calls registry, scaffold, and manifest in correct order with correct args, verify decorations.json is written (mock collaborators).
- `tests/unit-tests/commands/initializeWorkspace.test.ts` — test QuickPick flow, error cases (no workspace, already initialized), telemetry emission (mock all VS Code UI APIs + engine).

### Step 13: E2E tests (Phase 1)

- `tests/e2e-tests/blueprints/initializeWorkspace.test.ts`:
  - **Non-interactive strategy:** E2E tests cannot programmatically drive QuickPick UI. Instead, test the observable outcomes that don't require user interaction:
  - Test: verify `memoria.initializeWorkspace` command is registered.
  - Test: use the `BlueprintEngine` directly (instantiated with real `vscode.workspace.fs`) to initialize the workspace, then verify `.memoria/blueprint.json` is created with correct structure.
  - Test: verify folder tree matches blueprint definition after engine-driven init.
  - Test: verify seed file contents are correct.
  - QuickPick selection logic (blueprint choice, error when no workspace, already-initialized guard) is covered in unit tests for the command handler (Step 12).
- Update `tests/e2e-tests/extension.test.ts` — verify new commands are registered.

### Step 14: Build verification

- Run `npm run build` — verify esbuild bundles `yaml` correctly.
- Run `npm test` — all unit tests pass.
- Run `npm run test:integration` — all E2E tests pass.

---

## Phase 2 — Core Polish (multi-root, re-init, dot-folder toggle)

### Step 15: Multi-root workspace support

- Update `src/commands/initializeWorkspace.ts`:
  - If `vscode.workspace.workspaceFolders.length > 1`, show QuickPick for root selection before blueprint selection.
  - Store `rootUri` in manifest.
  - On re-init, reuse stored root; error if root no longer exists.
- Update `src/blueprints/types.ts` if needed for rootUri field.

### Step 16: Re-initialization — conflict resolution

- Create `src/blueprints/reinitConflictResolver.ts`:
  - Export `ReinitConflictResolver` class.
  - `resolveConflicts(workspaceRoot: vscode.Uri, currentManifest: BlueprintManifest, newDefinition: BlueprintDefinition): Promise<ReinitPlan>` — compares current state against new blueprint:
    - Identifies extra folders (present on disk, absent from blueprint).
    - For each file, compares current hash against stored hash to detect modifications.
    - Returns a `ReinitPlan` describing: folders to keep/cleanup, files to overwrite/skip.
  - `promptFolderCleanup(extraFolders: string[]): Promise<string[]>` — shows checklist QuickPick for extra folders.
  - `promptFileOverwrite(modifiedFile: string): Promise<OverwriteChoice>` — shows prompt per PRD spec with: Yes (file), Yes all (folder non-recursive), Yes all (folder recursive), No (skip).
- Update `src/blueprints/blueprintEngine.ts`:
  - Add `reinitialize(workspaceRoot: vscode.Uri, blueprintId: string, resolver: ReinitConflictResolver): Promise<void>`.
  - Move extra folders to `ReInitializationCleanup/`.
  - Overwrite or skip files per conflict resolution result.
  - Update manifest with new hashes.
- Update `src/commands/initializeWorkspace.ts`:
  - Detect re-init (manifest exists) → invoke reinitialize flow instead of initialize.
  - Handle different-blueprint re-init (old blueprint items cleaned up first).
  - Emit `blueprint.reinit` telemetry event.

### Step 17: Toggle dot-folders command

- Create `src/commands/toggleDotFolders.ts`:
  - Export `createToggleDotFoldersCommand(manifest: ManifestManager): (...args: any[]) => Promise<void>`.
  - Command only visible when `.memoria/` exists (via `when` clause in `package.json`).
  - **Tracking:** The command reads/writes `.memoria/dotfolders.json` to track which `files.exclude` entries it manages. It never touches `files.exclude` entries not listed in `managedEntries`.
  - Reads workspace-level `files.exclude` via `vscode.workspace.getConfiguration('files')`.
  - If all dot-folders visible → scans workspace root for dot-folders, adds them to `files.exclude`, and records them in `.memoria/dotfolders.json`.
  - If some hidden → shows multi-select QuickPick with pre-checked hidden folders → updates `files.exclude` and `.memoria/dotfolders.json`.
  - Only touches dot-folder entries that are tracked in `.memoria/dotfolders.json`.
  - Emit `dotfolders.toggle` telemetry event.
- Register the command in `extension.ts`.
- Update `package.json` contributes:
  - Add `memoria.toggleDotFolders` command.
  - Add `when: memoria.workspaceInitialized` context for menu visibility.
  - Set context key in extension activation based on `.memoria/` existence.

### Step 18: Unit + E2E tests (Phase 2)

- `tests/unit-tests/blueprints/reinitConflictResolver.test.ts` — test conflict detection (unmodified/modified files, extra folders), prompt result handling.
- `tests/unit-tests/commands/toggleDotFolders.test.ts` — test show/hide logic, QuickPick flow, files.exclude manipulation.
- Update `tests/unit-tests/blueprints/blueprintEngine.test.ts` — add reinitialize tests.
- Update `tests/unit-tests/commands/initializeWorkspace.test.ts` — add reinit detection tests.
- `tests/e2e-tests/blueprints/reinitializeWorkspace.test.ts` — E2E reinit flow with pre-seeded `.memoria/`.

---

## Phase 3 — Visual & UX (decorations, versioning)

### Step 19: File decoration provider

- Create `src/features/decorations/blueprintDecorationProvider.ts`:
  - Implement `vscode.FileDecorationProvider`.
  - Constructor receives workspace root Uri.
  - Reads decoration rules from `.memoria/decorations.json` (cached on activation, refreshed on re-init).
  - `provideFileDecoration(uri)` matches the workspace-relative path against rules in order; first matching `filter` wins. Returns `{ badge, color }` for the match, or `undefined` if no rule matches.
  - Fires `onDidChangeFileDecorations` event when decorations change (after init/reinit).
- Register provider in `extension.ts` via `vscode.window.registerFileDecorationProvider`.

### Step 20: Blueprint versioning UX

- On activation, compare stored `blueprintVersion` against bundled blueprint version.
- If bundled version is newer, show info message: "A newer version of blueprint X is available. Re-initialize?"
- On confirmation, trigger re-init flow.

### Step 21: Unit + E2E tests (Phase 3)

- `tests/unit-tests/features/decorations/blueprintDecorationProvider.test.ts` — test decoration resolution, caching, event firing.
- E2E test: verify decorations appear after init (may be limited by test host capabilities).

---

## Relevant Files

- `src/extension.ts` — update to wire all new components; use `createInitializeWorkspaceCommand()` factory pattern
- `src/telemetry.ts` — reference for telemetry event emission pattern
- `src/package.json` — add `yaml` dep, new commands, menu `when` clauses
- `src/esbuild.config.mjs` — verify `yaml` is NOT in `external` (should be bundled)
- `src/.vscodeignore` — verify `resources/` is not excluded
- `src/vitest.config.ts` — may need to exclude new non-testable files; enable coverage thresholds after Phase 1 modules exist
- `tests/unit-tests/extension.test.ts` — reference for mocking pattern, update for new commands
- `tests/e2e-tests/extension.test.ts` — update to verify new commands registered
- `tests/e2e-tests/helpers.ts` — extend with blueprint test utilities

## Verification

1. `cd src && npm run build` — esbuild bundles without errors, `yaml` is bundled into `dist/extension.js`
2. `cd src && npm test` — all unit tests pass (Vitest)
3. `cd src && npm run test:integration` — all E2E tests pass (Mocha + Extension Host)
4. `cd src && npm run test:coverage` — coverage does not regress
5. Manual verification: open the empty-workspace fixture, run `Memoria: Initialize workspace`, select "Individual Contributor Notebook", verify folder tree appears in Explorer
6. Manual verification: verify `.memoria/blueprint.json` contains correct manifest with SHA-256 hashes
7. `cd src && npm run package` — VSIX packages successfully, contains `resources/blueprints/` directory

## Decisions

- **`yaml` as dependency, bundled by esbuild**: Unlike `@vscode/extension-telemetry` (CJS issues, must be external), `yaml` is pure JS and bundles cleanly. It goes in `dependencies` and esbuild bundles it into `dist/extension.js`. No `external` entry needed.
- **`vscode.workspace.fs` exclusively**: No Node `fs` — ensures virtual filesystem compatibility per PRD.
- **SHA-256 via Node `crypto`**: Built-in, no extra dependency. Used only for blueprint-managed files per manifest. Output is `sha256:<lowercase hex>`.
- **Resources at `src/resources/blueprints/`**: Accessed via `context.extensionUri` at runtime. Included in VSIX by default (`.vscodeignore` doesn't exclude them).
- **Dependency injection throughout**: All classes accept collaborators via constructor (registry, manifest, scaffold). Follows existing telemetry factory pattern. Enables isolated unit testing with mocks.
- **Commands as factories**: `createInitializeWorkspaceCommand(...)` returns the handler function, matching the DIP pattern. Command handlers are thin UI layers; logic lives in engine/collaborators.
- **Phase 1 blocks re-init**: If workspace is already initialized, Phase 1 shows "already initialized" message. Re-init is Phase 2 only.
- **Comments policy**: Purpose comments on files/classes. "Why" comments on non-obvious decisions. No section-separator comments. No redundant what-comments.
- **Decorations split from workspace tree**: Workspace entries define structure only (`name`, `children`). Decoration rules live in a separate `decorations` section of `blueprint.yaml`, keyed by glob filter. Stored at runtime in `.memoria/decorations.json`.
- **Live decorations deferred to Phase 3**: Phase 1 persists `.memoria/decorations.json` at init time but does not register a `FileDecorationProvider`. The provider ships in Phase 3.
- **Dot-folder tracking in `.memoria/dotfolders.json`**: The toggle command tracks which `files.exclude` entries it manages, ensuring it never touches user-managed or other-extension-managed entries.
- **Path validation in scaffold**: All resolved paths are verified to start with the workspace root URI before any write operation. Entries containing `..` are rejected.
- **Path normalization**: Manifest paths always use forward slashes (`/`), regardless of OS.
- **Step ordering**: Blueprint YAML files (Step 10) must be created before unit/E2E tests (Steps 12–13), because they serve as test fixtures.
- **ManifestManager owns `.memoria/` directory**: All write methods on `ManifestManager` ensure `.memoria/` exists before writing. No other component creates this directory.
- **Telemetry: uniform `TelemetryLogger` interface**: Command factories accept `vscode.TelemetryLogger` (not the `TelemetryReporterLike | TelemetryLogger` union). `extension.ts` normalizes the `createTelemetry()` return value to a `TelemetryLogger` before passing it downstream. In the default dev path (no connection string), `createTelemetry()` already returns a `TelemetryLogger`. A proper adapter for the `TelemetryReporter` path will be added pre-publish.
- **Blueprint display names**: "Individual Contributor Notebook" and "People Manager Notebook". Folder ids remain `individual-worker` and `manager`.
- **E2E tests are non-interactive**: QuickPick selection logic is tested in unit tests. E2E tests verify outcomes (command registration, file tree after engine-driven init) without driving QuickPick UI.
- **Baseline verification as Step 0**: Before any feature work, run build + unit tests + E2E compilation to confirm the repo is green. This prevents working against a broken baseline.

---

## Deferred Items

The following items were identified during analysis but are intentionally deferred. They are not blocking for any phase and can be addressed as needed.

| Item | Reason for Deferral | Revisit When |
|------|--------------------|--------------|
| **Root removal detection on activation** | PRD requires detecting when a stored `rootUri` no longer exists in a multi-root workspace. This is Phase 2 scope (multi-root support). | Phase 2, Step 15 |
| **Coverage thresholds in vitest.config.ts** | Currently commented out. Enable once Phase 1 modules provide enough testable surface. | After Phase 1 Step 12 |
| **Concurrent init/re-init guard** | No locking mechanism prevents two init commands from running simultaneously. Extremely unlikely for a user-initiated command. | Phase 2, if reported |
| **Empty folder git-tracking** | Empty scaffolded folders are not committed by Git. If user clones workspace, empty dirs vanish. | Document in README; optionally add `.gitkeep` |
| **E2E publisher ID placeholder** | `tests/e2e-tests/extension.test.ts` uses `TODO_PUBLISHER_ID.memoria`. | Before first marketplace publish |
| **Blueprint versioning comparison logic** | SemVer comparison details (pre-release handling, build metadata). Phase 3 feature. | Phase 3, Step 20 |
| **Badge character encoding edge cases** | Whether badge length means JS string length or Unicode grapheme count. VS Code's `FileDecorationProvider` handles this at render time. | Phase 3, if reported |
| **Large manifest performance** | If a blueprint scaffolds thousands of files, SHA-256 hashing could be slow. Bundled blueprints create ~10 files each; not a concern at current scale. | If blueprint complexity grows |
| **ReInitializationCleanup/ collision** | If user already has a folder named `ReInitializationCleanup/`. | Phase 2, Step 16 — handle as error |
| **QuickPick interactive testing** | QuickPick selection is not programmatically testable in E2E. Unit tests verify selection logic; E2E tests verify non-interactive outcomes (command registration, file tree integrity). | Ongoing manual QA |
| **TelemetryReporter → TelemetryLogger adapter** | When a connection string is configured, `createTelemetry()` returns `TelemetryReporterLike` which lacks `logUsage()`. An adapter wrapping it in `vscode.env.createTelemetryLogger()` is needed. Phase 1 uses the dev path (no connection string) which already returns `TelemetryLogger`. | Before first marketplace publish |
