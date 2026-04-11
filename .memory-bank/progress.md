# Progress — Memoria

## What Works (Implemented)
- **Phase 1 (MVP)**: Full blueprint scaffolding pipeline — YAML parsing, blueprint discovery, folder/file creation, manifest writing, decoration rules
- **Phase 2 (Core Polish)**: Re-initialization with conflict resolution (folder cleanup, per-file overwrite prompts), dot-folder toggling, multi-root workspace support, single-root `.memoria` enforcement
- **Telemetry**: Production-ready pattern with `ConsoleTelemetrySender` + lazy factory for `@vscode/extension-telemetry`
- **Two bundled blueprints**: Individual Contributor (5 folders) and People Manager (6 folders with nested meeting types)
- **Test coverage**: 146 unit tests passing, all files ≥ 85% coverage. E2E tests for activation, init, and reinit flows.
- **Context key**: `memoria.workspaceInitialized` checks all workspace roots (not just first)

## What's Left (Not Implemented)
- **Phase 3**: File decoration provider (colors/badges in Explorer)
- **Phase 3**: Blueprint versioning UX
- **`.vscodeignore`**: Not yet created (needed for publishing)
- **Publishing**: `publisher` field in package.json is still `TODO_PUBLISHER_ID`

## Current Status
Version 0.0.1, not publicly released. Phase 1 + Phase 2 complete. Phase 3 remaining.

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
