# Active Context — Memoria

## Current Work Focus
Structural and performance improvements completed. No active work item. Next logical steps are publishing prep.

## Recent Changes (Structural & Performance Improvements)
1. **Cached hashes in `ReinitPlan`**: Added `currentFileHashes` field to `ReinitPlan`. `resolveConflicts()` caches hashes during conflict analysis; `BlueprintEngine.reinitialize()` uses the cache instead of re-reading files, halving I/O during reinit.
2. **Multi-root file watcher**: `extension.ts` now creates a watcher per workspace root instead of only `roots[0]`.
3. **Extracted `activate()` helpers**: `registerFileWatchers()` and `registerCommands()` extracted from monolithic `activate()` function.
4. **Removed `ManifestManager.computeFileHash()` wrapper**: Dead delegation method removed; unused import cleaned up. Tests updated to import `hashUtils` directly.
5. **Deduplicated `split("/")` in `backupFile()`**: Path segments computed once and reused across 3 URI constructions.
6. **Short-circuit `recheckInitialization()`**: Caches last-known root string; skips `updateWorkspaceInitializedContext()` and `featureManager.refresh()` when state unchanged.
7. **Parallel hash reads in `resolveConflicts()`**: Sequential `for` loop replaced with `Promise.all()` for independent file hash reads.

All 263 unit tests passing. Build clean.

## Active Decisions
- `.memoria/` deletion is automatic (no confirmation prompt) when switching roots
- Cleanup timing: after blueprint selection, before init — to avoid unnecessary deletion on cancel
- `refresh()` discovers initialized root itself — callers do not pass the root URI

## Next Steps
- Create `.vscodeignore` for publishing
- Set `publisher` in package.json
- Add `patch-package` to persist the Istanbul crash fix across `npm install`
