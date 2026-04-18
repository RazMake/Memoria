# Active Context — Memoria

## Current Work Focus
Custom Todo Editor (`CustomTextEditorProvider`) for `*.todo.md` files implemented. The editor provides a visual task board with drag-and-drop reordering, one-click completion, add/edit popups, and source file navigation. Feature-gated behind the `taskCollector` feature toggle.

## Recent Changes
1. **Todo Editor implementation**: New `CustomTextEditorProvider` registered dynamically via `FeatureManager` callback for `taskCollector`.
2. **Document serializer**: Pure functions for parsing and mutating `.todo.md` documents (`parseTodoDocument`, `completeTask`, `uncompleteTask`, `addTaskRawLines`, `updateTaskBody`, `serializeDocument`).
3. **Webview bundle**: Separate esbuild pass produces `dist/webview.js` (IIFE, browser platform) alongside `dist/extension.js`.
4. **markdown-it integration**: Task bodies pre-rendered to HTML on the extension host side before posting to webview.
5. **Source file write-back**: Editing a collected task in the editor propagates changes back to the originating source file.
6. **Dependencies added**: `markdown-it`, `@vscode/codicons`, `@types/markdown-it`.
7. **27 unit tests** for `documentSerializer`, **E2E tests** for feature gating and editor lifecycle.

All unit tests passing (541 total). Build clean.

## Active Decisions
- `.memoria/` deletion is automatic (no confirmation prompt) when switching roots
- Cleanup timing: after blueprint selection, before init — to avoid unnecessary deletion on cancel
- `refresh()` discovers initialized root itself — callers do not pass the root URI

## Next Steps
- Create `.vscodeignore` for publishing
- Set `publisher` in package.json
- Add `patch-package` to persist the Istanbul crash fix across `npm install`
