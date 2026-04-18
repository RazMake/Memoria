# Progress — Memoria

## What Works (Implemented)
- **Phase 1 (MVP)**: Full blueprint scaffolding pipeline — YAML parsing, blueprint discovery, folder/file creation, manifest writing, decoration rules
- **Phase 2 (Core Polish)**: Re-initialization with conflict resolution (folder cleanup, per-file overwrite prompts), dot-folder toggling, multi-root workspace support, single-root `.memoria` enforcement
- **Phase 3 (Visual & UX)**:
  - `BlueprintDecorationProvider` — `vscode.FileDecorationProvider` reading rules from `.memoria/decorations.json`; registered at activation; refreshed after every init/reinit
  - Blueprint versioning UX — on activation, compares stored vs bundled SemVer; prompts user to re-initialize if the bundle is newer
  - `isNewerVersion(bundled, stored)` — exported pure utility for major.minor.patch SemVer comparison
- **Telemetry**: Production-ready pattern with `ConsoleTelemetrySender` + lazy factory for `@vscode/extension-telemetry`
- **Two bundled blueprints**: Individual Contributor (5 folders) and People Manager (6 folders with nested meeting types)
- **Test coverage**: 263 unit tests passing, 7 E2E tests passing. All covered files ≥ 85%. Includes 25 unit tests for `BlueprintDecorationProvider` and 3 contract tests for `package.json` command declarations.
- **Context key**: `memoria.workspaceInitialized` checks all workspace roots (not just first)
- **Structural/perf improvements**: Cached reinit hashes, multi-root file watchers, parallel hash reads, extracted activate() helpers, removed dead ManifestManager.computeFileHash wrapper
- **Task Collector feature**: Two-way sync of Markdown tasks (`- [ ]`/`- [x]`) between source files and a blueprint-defined collector file. Save-triggered sync via `SyncQueue`, self-write suppression via `PendingWrites`, Myers-style alignment for rename-safe task identity, relative path rewriting for images/links, completed-task aging and pruning, manual (collector-only) tasks, `Memoria: Sync Tasks` command. Documented in user guide.
- **Custom Todo Editor**: `CustomTextEditorProvider` for `*.todo.md` files — visual task board with drag-and-drop reordering, checkbox completion/un-completion (optimistic UI), add/edit task popups, source file navigation, and collapsible completed section. Feature-gated via `taskCollector` toggle. Webview powered by `markdown-it` for task body rendering. Source file write-back for collected tasks. Documented in user guide.

## What's Left (Not Implemented)
- **`.vscodeignore`**: Not yet created (needed for publishing)
- **Publishing**: `publisher` field set to `RazMake`
- **TelemetryReporter → TelemetryLogger adapter**: Needed when a connection string is configured pre-publish
- **`patch-package`**: Istanbul crash patch not persisted across `npm install`

## Current Status
Version 0.0.1, not publicly released. All three phases complete and verified.

## Known Issues
- `blueprintEngine.ts` branch coverage at 90% (the `buildSeedCallback` inner function has complex branching)
- E2E tests depend on real Extension Host — can be slow on CI
- Istanbul crash patch in `node_modules` is not persisted across `npm install`—needs `patch-package` or upstream fix

## Evolution of Decisions
1. **Vitest for unit tests** (ADR-0001): Chosen over Mocha for better ESM support, built-in mocking, and faster execution.
2. **@vscode/test-cli for E2E** (ADR-0002): Official VS Code test runner, runs in real Extension Host.
3. **Factory functions over classes** for command handlers: Commands are single-operation callbacks, not stateful objects.
4. **Single-root `.memoria` enforcement**: Added in Phase 2 to prevent extension confusion in multi-root workspaces. Old root's `.memoria/` is deleted (not moved) when initializing a different root.
5. **Cleanup timing**: Deletion of old `.memoria/` happens after blueprint selection (not after root selection) to avoid deleting metadata if the user cancels the blueprint QuickPick.
