# Active Context — Memoria

## Current Work Focus
Contacts feature implemented. Memoria now ships a dedicated Contacts sidebar (`WebviewViewProvider`) for browsing, searching, and managing blueprint-owned contact groups plus editable reference data.

## Recent Changes
1. **Contacts data layer**: Added pure parser/serializer helpers for contact group files and reference-data dictionaries, code-only `unknown` defaults, title generation, and integrity-correction helpers.
2. **Blueprint plumbing**: Added `contacts` feature parsing/persistence to blueprint types/parser/engine, and both bundled blueprints now declare a contacts feature with a people folder and group list.
3. **Contacts runtime**: Added `ContactsFeature` with manifest-driven startup, custom-group discovery, debounced folder watching, integrity rewrites, context-key updates, and mutation APIs for add/edit/delete/move/create-group.
4. **Sidebar UI**: Added `ContactsViewProvider` plus a dedicated webview bundle (`dist/contacts-webview.js`) for the persistent Activity Bar contacts panel.
5. **Commands**: Added eager `add/edit/delete/move person` commands wired through the feature and sidebar form-open requests.
6. **Docs and tests**: Added contacts user-guide pages, unit tests for the new data/runtime/command layers, and a focused Contacts E2E suite.

Build clean. Unit tests pass (622). Focused Contacts E2E suite passes (3). The full integration suite still has unrelated existing failures in Todo Editor and Task Collector.

## Active Decisions
- `.memoria/` deletion is automatic (no confirmation prompt) when switching roots
- Cleanup timing: after blueprint selection, before init — to avoid unnecessary deletion on cancel
- `refresh()` discovers initialized root itself — callers do not pass the root URI

## Next Steps
- Decide whether to stabilize the existing Todo Editor / Task Collector E2E failures before release
- Create `.vscodeignore` for publishing
- Add `patch-package` to persist the Istanbul crash fix across `npm install`
