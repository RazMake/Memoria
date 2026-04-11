# Active Context — Memoria

## Current Work Focus
All three phases complete. No active work item. Next logical steps are publishing prep.

## Recent Changes (Phase 3)
1. **`BlueprintDecorationProvider`** (`src/features/decorations/blueprintDecorationProvider.ts`):
   - Implements `vscode.FileDecorationProvider`; registered via `vscode.window.registerFileDecorationProvider`
   - `refresh()` auto-discovers initialized root via `ManifestManager.findInitializedRoot()`, reads `.memoria/decorations.json`, fires `onDidChangeFileDecorations(undefined)`
   - `matchesFilter()` exported — handles `FolderName/` (last-segment), `*.ext` (wildcard), and exact-path filters
2. **Blueprint versioning UX** in `extension.ts`:
   - `checkForBlueprintUpdates()` — on activation, compares stored vs bundled SemVer; shows info message if bundle is newer; triggers reinit on confirmation
   - `isNewerVersion(bundled, stored)` — exported pure utility
   - `decorationProvider.refresh()` called on activation (load existing rules) and in `onWorkspaceInitialized` callback
3. **Updated `extension.ts` unit test mock**: Added `EventEmitter`, `ThemeColor`, `FileDecoration`, `window.registerFileDecorationProvider` (required because `BlueprintDecorationProvider` is instantiated at activate time)
4. **25 unit tests** in `tests/unit-tests/features/decorations/blueprintDecorationProvider.test.ts`

## Active Decisions
- `.memoria/` deletion is automatic (no confirmation prompt) when switching roots
- Cleanup timing: after blueprint selection, before init — to avoid unnecessary deletion on cancel
- `refresh()` discovers initialized root itself — callers do not pass the root URI

## Next Steps
- Create `.vscodeignore` for publishing
- Set `publisher` in package.json
- Add `patch-package` to persist the Istanbul crash fix across `npm install`
