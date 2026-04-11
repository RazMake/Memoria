# Active Context — Memoria

## Current Work Focus
Phase 2 is complete. No active work item. Next logical step is Phase 3 (file decorations, blueprint versioning UX).

## Recent Changes (This Session)
1. **Single-root `.memoria` enforcement**: Added `ManifestManager.findInitializedRoot()` and `deleteMemoriaDir()`. Updated `initializeWorkspace` command to delete `.memoria/` from old root when initializing a different root in multi-root workspaces.
2. **Fixed `updateWorkspaceInitializedContext()`**: Now checks all workspace roots via `findInitializedRoot()` instead of only `folders[0]`.
3. **Improved test coverage**: Added tests for `yes-folder`, `yes-folder-recursive`, SKIP_FILE, and deleted-file manifest handling in `blueprintEngine.test.ts`. All files now ≥ 85%.
4. **Memory bank initialized**: Created all 6 core memory bank files.

## Active Decisions
- `.memoria/` deletion is automatic (no confirmation prompt) when switching roots
- Cleanup timing: after blueprint selection, before init — to avoid unnecessary deletion on cancel

## Next Steps
- Phase 3: File decoration provider
- Phase 3: Blueprint versioning UX
- Create `.vscodeignore` for publishing
- Set up `publisher` in package.json
