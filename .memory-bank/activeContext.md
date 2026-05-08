# Active Context — Memoria

## Current Work Focus
Stability and polish pass — performance optimizations, module decomposition for maintainability, and recording demo media for the User Guide.

## Recent Changes

### Module Decomposition Refactoring (dbad1cc)
Major refactoring across all features to enforce SRP and reduce module sizes:
- **TodoEditor**: Extracted `todoEditorMessageHandler.ts` (386 lines of message dispatch) from `todoEditorProvider.ts`, reducing provider to ~290 lines of lifecycle/caching logic.
- **TaskCollector**: Extracted `taskCollectorPathResolver.ts` (URI classification) and `taskCollectorTransformer.ts` (pure index↔snapshot conversions) from `taskCollectorFeature.ts`.
- **Contacts webview**: Decomposed monolithic `main.ts` (~1466 lines) into focused modules: `contactListComponents.ts`, `formPane.ts`, `formFields.ts`, `titleField.ts`, `datePickerField.ts`, `domUtils.ts`, `uiHelpers.ts`.
- **Contacts extension-side**: Extracted `contactFileLoader.ts`, `contactMutations.ts`, `contactTooltip.ts`, `contactsViewMapping.ts`, `contactsViewHtml.ts` from provider.
- **Navigator**: Extracted `defaultFileJsonHelpers.ts` from `defaultFileCompletionProvider.ts`.
- **Shared utilities**: Extracted `src/utils/dateUtils.ts`, `src/utils/encoding.ts`, `src/utils/filesystem.ts`, `src/utils/markdown.ts`, `src/utils/regex.ts` from feature-specific code.
- **Extension entry**: Extracted `featureSetup.ts` with `createToggle()` utility and `registerFeatureHandlers()`.

### TodoEditor Performance Optimizations (19139fa, 96acae9)
- External CSS bundle (separate esbuild entry) with skeleton placeholder HTML
- Lazy MarkdownIt initialization, markdown render caching, fingerprint-based update skipping
- Incremental DOM reconciliation in webview (both active and completed lists)
- Cached workspace root and source-by-body map across tab switches
- Optimistic checkbox UI with CSS transitions
- Completed section: cards removed from DOM when collapsed (not hidden)

### Other Recent Changes
- Extension renamed for uniqueness (e04a4b6)
- Added extension icon (5cb68e5)
- Keyboard shortcuts for todo editing: bold, italic, link (ac0e74a)
- Link autocompletion for local files (ac0e74a)
- Re-initialization UX improvements for version upgrades (a0a990f)

## Active Decisions
- `.memoria/` deletion is automatic (no confirmation prompt) when switching roots
- Cleanup timing: after blueprint selection, before init — to avoid unnecessary deletion on cancel
- Telemetry is injected via DI (`TelemetryEmitter` interface), not global — every consumer receives it explicitly
- Watcher patterns differ by feature: TaskCollector uses workspace-level events (configurable include/exclude), Contacts/Snippets use scoped FileSystemWatchers (single folder)

## Next Steps
- Consider JSDOM-based tests for webview files or exclude from coverage threshold
- Publish extension to marketplace
