# Active Context — Memoria

## Current Work Focus
Shared seed files across blueprints — deduplicated seed content via `seedSource` field and `_shared/` directory.

## Recent Changes (Shared Seed Sources)
1. **`seedSource` field**: Added optional `seedSource` property to `WorkspaceEntry` in `types.ts`. When set on a file entry, scaffold resolves seed content from `resources/blueprints/_shared/` instead of the blueprint's own `files/` directory.
2. **Parser validation**: `blueprintParser.ts` validates `seedSource` — must be a non-empty relative path, no traversal segments, files only.
3. **Registry**: `BlueprintRegistry` gained `getSharedSeedContent(seedSource)` method. `listBlueprints()` now skips `_`-prefixed directories (e.g. `_shared`).
4. **Engine**: `BlueprintEngine` builds a `seedSourceMap` from the workspace tree and routes seed callbacks through `getSharedSeedContent` when `seedSource` is present, falling back to `getSeedFileContent` otherwise.
5. **Shared directory**: Created `resources/blueprints/_shared/` with 7 seed files (workstreams, snippets, contacts DataTypes). Deleted duplicate `files/` directories from both blueprints.
6. **Blueprint YAMLs**: Both `individual-contributor` and `people-manager` now use `seedSource` references for all 7 shared files.
7. **JSON schema**: Added `seedSource` property to `workspaceEntry` in `blueprint.schema.json`.
8. **Tests**: 17 new tests — parser (8), registry (3), engine (6). Schema test updated to skip non-blueprint directories.

Build clean. 1142 unit tests pass. 72 test files.

## Active Decisions
- `.memoria/` deletion is automatic (no confirmation prompt) when switching roots
- Cleanup timing: after blueprint selection, before init — to avoid unnecessary deletion on cancel
- Telemetry is injected via DI (`TelemetryEmitter` interface), not global — every consumer receives it explicitly
- Watcher patterns differ by feature: TaskCollector uses workspace-level events (configurable include/exclude), Contacts/Snippets use scoped FileSystemWatchers (single folder)

## Next Steps
- Consider JSDOM-based tests for webview files or exclude from coverage threshold
