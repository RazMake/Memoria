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
- **Test coverage**: 976 unit tests passing (66 test files), 7 E2E tests passing. Includes 25 unit tests for `BlueprintDecorationProvider` and 3 contract tests for `package.json` command declarations.
- **Context key**: `memoria.workspaceInitialized` checks all workspace roots (not just first)
- **Structural/perf improvements**: Cached reinit hashes, multi-root file watchers, parallel hash reads, extracted activate() helpers, removed dead ManifestManager.computeFileHash wrapper
- **Task Collector feature**: Two-way sync of Markdown tasks (`- [ ]`/`- [x]`) between source files and a blueprint-defined collector file. Save-triggered sync via `SyncQueue`, self-write suppression via `PendingWrites`, Myers-style alignment for rename-safe task identity, relative path rewriting for images/links, completed-task aging and pruning, manual (collector-only) tasks, `Memoria: Sync Tasks` command. Documented in user guide.
- **Custom Todo Editor**: `CustomTextEditorProvider` for `*.todo.md` files — visual task board with drag-and-drop reordering, checkbox completion/un-completion (optimistic UI), add/edit task popups, source file navigation, and collapsible completed section. Feature-gated via `taskCollector` toggle. Webview powered by `markdown-it` for task body rendering. Source file write-back for collected tasks. Documented in user guide.
- **Contacts feature**: Activity Bar sidebar for browsing, searching, adding, editing, deleting, and moving contacts stored in blueprint-owned Markdown group files. Includes reference-data loading, code-only `unknown` fallbacks, canonical title generation, custom group creation, debounced file watching, and integrity rewrites. Documented in the user guide.
- **Snippets feature**: Inline autocomplete via `{trigger}` patterns, compiled from TypeScript snippet files. Built-in `date-time.ts` with parameterized prompts. Auto-generated contact snippets. Hover provider with `Ctrl+Shift+H` keybinding. Snippet file reset command. Documented in user guide.
- **Full telemetry coverage**: All features and commands emit `logUsage()`/`logError()` events via DI-injected `TelemetryEmitter`. `ManifestManager` logs `manifest.parseFailed` for JSON parse errors.
- **Code quality pass**: Shared utilities extracted (`utils/webview.ts`, `utils/markdownCheckbox.ts`, `utils/jsonCompletionHelpers.ts`). Large files decomposed into focused modules (`extension.ts` 570→232, `taskCollectorFeature` 769→655, etc.). Magic numbers replaced with named constants. File-watcher pattern differences documented.

## What's Left (Not Implemented)
- **`.vscodeignore`**: Created at `src/.vscodeignore` (excludes test files, TypeScript sources, node_modules, coverage)
- **Publishing**: `publisher` field set to `RazMake`

## Current Status
Version 0.0.1, not publicly released. All features implemented. Full telemetry coverage. `ReporterTelemetrySender` adapter enables production AppInsights telemetry. Istanbul patch persisted via `patch-package`. 1028 unit tests passing.

## Known Issues
- `blueprintEngine.ts` branch coverage at 90% (the `buildSeedCallback` inner function has complex branching)
- E2E tests depend on real Extension Host — can be slow on CI
- Istanbul crash in `@vitest/coverage-istanbul@4.1.4` — patched via `patch-package` (null-check in `getCoverageMapForUncoveredFiles`)
- The full `npm run test:integration` suite still has unrelated existing failures in Todo Editor / Task Collector tests; the Contacts-only filtered E2E run passes.
- Global unit test coverage is below 85% threshold due to untested webview files (browser-side code, ~2800 lines at 0%) — consider excluding from threshold or adding JSDOM tests

## Evolution of Decisions
1. **Vitest for unit tests** (ADR-0001): Chosen over Mocha for better ESM support, built-in mocking, and faster execution.
2. **@vscode/test-cli for E2E** (ADR-0002): Official VS Code test runner, runs in real Extension Host.
3. **Factory functions over classes** for command handlers: Commands are single-operation callbacks, not stateful objects.
4. **Single-root `.memoria` enforcement**: Added in Phase 2 to prevent extension confusion in multi-root workspaces. Old root's `.memoria/` is deleted (not moved) when initializing a different root.
5. **Cleanup timing**: Deletion of old `.memoria/` happens after blueprint selection (not after root selection) to avoid deleting metadata if the user cancels the blueprint QuickPick.
