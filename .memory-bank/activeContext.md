# Active Context — Memoria

## Current Work Focus
Full code quality pass complete. Telemetry expanded to all features/commands, large files decomposed, shared utilities extracted, documentation gaps fixed, and test coverage significantly improved.

## Recent Changes (Code Quality Pass)
1. **Telemetry expansion**: Added `TelemetryEmitter` DI to all features and commands. `ManifestManager` now receives optional telemetry and logs `manifest.parseFailed` for JSON parse errors (distinct from file-not-found).
2. **P2 decomposition**: Split 6 large files into 15 focused modules — `extension.ts` (570→232), `taskCollectorFeature` (769→655), `contactsFeature` (636→504), `todoEditorProvider` (612→469), `contactsViewProvider` (517→313), `defaultFileCompletionProvider` (511→323).
3. **P3 code quality**: Extracted shared `utils/webview.ts` (getNonce + escapeAttribute), `utils/markdownCheckbox.ts` (task regex patterns), `utils/jsonCompletionHelpers.ts` (JSON cursor helpers). Added `MAX_AGING_SKIP_COUNT` constant. Documented watcher pattern differences across features.
4. **Documentation fixes**: Created `features/snippets.md`, fixed blueprint folder structures in docs, updated commands index and README.
5. **Test coverage**: 1075 unit tests (up from 622), 71 test files. 22 E2E tests all passing (up from 10 with 12 failures). Added tests for todoEditorProvider, contactsViewProvider (message handling), taskCollectorFeature (save/rename/delete handlers, aging, sync).
6. **Publishing prep**: Created `ReporterTelemetrySender` adapter so `createTelemetry()` always returns `vscode.TelemetryLogger`. Persisted Istanbul null-check patch via `patch-package` (`patches/@vitest+coverage-istanbul+4.1.4.patch`).
7. **E2E test fixes**: Fixed stale folder paths (`00-Tasks/All-Tasks.md` → `00-Workstreams/All.todo.md`, `05-Contacts/` → `05-Autocomplete/Contacts/`). Fixed test assertions for seed task content. Excluded fixture `.ts` files from E2E tsconfig.

Build clean. 1075 unit tests pass. 22 E2E tests pass.

## Active Decisions
- `.memoria/` deletion is automatic (no confirmation prompt) when switching roots
- Cleanup timing: after blueprint selection, before init — to avoid unnecessary deletion on cancel
- Telemetry is injected via DI (`TelemetryEmitter` interface), not global — every consumer receives it explicitly
- Watcher patterns differ by feature: TaskCollector uses workspace-level events (configurable include/exclude), Contacts/Snippets use scoped FileSystemWatchers (single folder)

## Next Steps
- Consider JSDOM-based tests for webview files or exclude from coverage threshold
