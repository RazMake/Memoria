# PRD: Custom Todo Editor for *.todo.md

**Date**: 2026-04-17
**Status**: Draft

## 1. TL;DR

Add a **custom visual editor** (`CustomTextEditorProvider`) for `*.todo.md` files in initialized Memoria workspaces. When a user opens a `.todo.md` file, instead of raw markdown they see a beautiful, snappy task board powered by a webview. Active tasks are displayed as draggable cards; completed tasks are grouped under a collapsible section (closed by default). All task bodies are rendered as full markdown via `markdown-it`. The editor supports drag-and-drop reordering, one-click task completion/un-completion, adding new tasks via a popup, editing existing task bodies (with source file write-back for collected tasks), and opening the originating source file in a side editor.

The design philosophy is **speed-first**: optimistic UI for checkboxes and reordering (instant visual feedback, no round-trip wait), keyboard shortcuts for adding tasks, zero-delay popup transitions, and a clean layout that keeps the most important tasks visible at the top.

---

## 2. Goals / Non-goals

**Goals**
- Provide a polished visual editor for `.todo.md` files that feels native to VS Code.
- Render task bodies with full markdown fidelity (bold, italic, code, links, lists).
- Enable drag-and-drop reordering of active tasks with zero-latency optimistic UI.
- Enable one-click completion (active → completed with date) and un-completion (completed → active) with optimistic visual feedback.
- Provide an "Add task" popup (single-line and multi-line) opened via toolbar button or keyboard shortcut.
- Provide an "Edit task" popup (double-click) that updates the `.todo.md` file and, for collected tasks, propagates the change back to the source file.
- Show a discrete source-link icon per task that opens the originating file in a side editor.
- Group completed tasks under a collapsible "Completed" section (collapsed by default) showing completion dates.
- Provide a discrete "Sync" button to trigger `memoria.syncTasks`.
- Keep the task index (`.memoria/tasks-index.json`) consistent by triggering a sync after every mutation.
- Only activate for `*.todo.md` within initialized Memoria workspaces.
- **Integrate with the Task Collector feature**: the custom editor is available if and only if the `taskCollector` feature is enabled. When the feature is disabled, `*.todo.md` files open as plain text.

**Non-goals**
- Inline text editing within cards (editing uses a popup).
- Keyboard shortcuts beyond `a`/`n` (add task) and Enter/Shift+Enter/Escape in the popup.
- Multi-select or bulk operations on tasks.
- In-webview undo/redo (VS Code handles this natively at the document level — each mutation is a single `WorkspaceEdit`).
- Syncing or rendering non-markdown content.
- Custom themes or user-configurable visual settings for the editor.

---

## 3. User-visible behavior

### 3.1 Activation & Registration

- The editor is registered as a `customEditor` contribution in `package.json`:
  - `viewType`: `"memoria.todoEditor"`
  - `selector`: `[{ filenamePattern: "*.todo.md" }]`
  - `priority`: `"default"` — VS Code will use this editor by default for matching files.
- No new `activationEvents` are needed — the extension already activates via `workspaceContains:.memoria/blueprint.json`.
- **Feature gate**: The `TodoEditorProvider` is registered/disposed **dynamically** based on the `taskCollector` feature state, using the existing `FeatureManager` callback pattern:
  - When `taskCollector` is **enabled** → the provider is registered → `*.todo.md` files open in the custom editor.
  - When `taskCollector` is **disabled** → the provider is disposed → `*.todo.md` files fall back to the plain text editor.
  - If the feature is toggled off while a custom editor panel is open, the provider **automatically reopens the document with the built-in text editor** (`vscode.openWith` → `'default'`) and disposes the webview panel. The user sees a seamless transition from the custom editor to the plain text view with no manual action required.
- When a `*.todo.md` file is opened outside an initialized Memoria workspace, the extension does not activate and the file opens as plain text.
- At resolve time, if the extension is active but the document is not within the initialized root, a "Not a Memoria workspace" fallback message is shown.

### 3.2 Editor Layout

The editor consists of:

1. **Top toolbar** — always visible, pinned above the task list.
   - Left: `"+ Add task"` button (opens the add/edit popup).
   - Right: `"Sync"` button (triggers `memoria.syncTasks`).

2. **Active task list** — the main scrollable area. Each task is a card.

3. **Completed section** — below the active list, separated by a thin line. A collapsible header ("COMPLETED (N)") that starts collapsed.

4. **Add/Edit popup** — a modal overlay shared by both "add" and "edit" workflows.

### 3.3 Task Card Anatomy

Each active task card, left to right:
```
[ drag-handle ]  [ checkbox ]  [ task body (markdown) ]  [ source icon ]
```

- **Drag handle**: grip icon (`⠿`), visible on card hover.
- **Checkbox**: custom SVG circle. Clicking completes the task.
- **Task body**: markdown-rendered content (`markdown-it`), full fidelity.
- **Source icon**: codicon `$(link-external)`, appears on card hover for tasks with a source file. Clicking opens the source beside the editor.

Completed task cards are identical except: no drag handle, checkbox is filled/checked, first line is struck through, opacity is reduced, and a completion date badge ("Apr 14") appears before the task body.

### 3.4 Interactions

#### Check / Uncheck (Optimistic UI)
- Clicking a checkbox on an **active** task instantly applies the visual completion state (fill checkbox, strike-through, dim) and sends `{ type:'complete', id }` to the extension. The extension writes the `.todo.md` and triggers a sync. The canonical update arrives asynchronously and silently reconciles the DOM.
- Clicking a checkbox on a **completed** task instantly applies the visual un-completion state and sends `{ type:'uncomplete', id }`.
- Rationale: optimistic UI eliminates the 100–300ms round-trip latency, making checkbox interactions feel instantaneous.

#### Drag and Drop (Optimistic UI)
- Active cards are `draggable="true"`. During drag, the card lifts (`scale(1.02)`, elevated `box-shadow`, reduced opacity).
- A 2px accent-colored drop indicator line tracks the pointer position between cards.
- On drop, the DOM nodes are **immediately reparented** to the new order (optimistic), and `{ type:'reorder', ids:[...] }` is sent to the extension.
- Completed tasks are not draggable.

#### Add Task (Popup)
- Triggered by clicking `"+ Add task"` in the toolbar **or pressing `a` or `n`** on the keyboard when no input is focused.
- A modal popup appears at `top: 15%`, centered, with a backdrop overlay.
- **Single-line mode** (default): `<input>` field. Press **Enter** to confirm. Press **Shift+Enter** to switch to multi-line mode.
- **Multi-line mode**: `<textarea>` that auto-grows. Press **Enter** for newlines. Press **Shift+Enter** to confirm.
- Hint text below the input shows the current mode's key bindings.
- Bottom row: `"Cancel"` text button + `"Add"` primary button.
- **Escape** or backdrop click cancels.
- On confirm: sends `{ type:'addTask', text }`. The new task is prepended to the active section.

#### Edit Task (Popup)
- Triggered by **double-clicking** anywhere on a task card body (active or completed).
- The clicked card receives a focus-ring highlight (`outline: 2px solid var(--vscode-focusBorder)`).
- The same popup opens with title `"Edit task"`, pre-filled with the task's `bodyMarkdown` (suffix line excluded for completed tasks).
- Single-line tasks open in single-line mode; multi-line tasks open in textarea mode, auto-sized.
- On confirm: sends `{ type:'editTask', id, newBody }`.
- For collected tasks (those with a `sourceRelativePath`), the edit is also propagated to the source file:
  - The source file is opened, parsed, and the matching task block (by body content) is replaced.
  - If the source file is missing or the task cannot be located in it, the `.todo.md` is updated and a warning notification is shown: *"Memoria: Could not find task in source file — .todo.md updated only."*
- For completed tasks, the suffix line (date/source metadata) is preserved untouched.

#### Open Source File
- Clicking the `$(link-external)` codicon on a task card sends `{ type:'openSource', id }`.
- The extension resolves the `sourceRelativePath` against the initialized workspace root and opens the file in a side editor (`ViewColumn.Beside`, `preserveFocus: true`).

#### Sync
- Clicking the `"Sync"` button sends `{ type:'scan' }`, which executes `memoria.syncTasks`.
- The Sync button is always available, even when the popup is open.

### 3.5 Empty State

When the active task list is empty:
- Centered message: **"All clear."** (primary) + *"Add a task with the '+ Add task' button above."* (secondary, muted).
- The toolbar remains functional.

### 3.6 External Edits

When the `.todo.md` file is modified outside the custom editor (e.g. via the text editor, a sync operation, or git), the editor re-parses and re-renders automatically via `onDidChangeTextDocument`.

---

## 4. Visual Design Specification

All styling uses VS Code CSS variables to automatically match the user's theme (light, dark, high contrast).

### 4.1 Layout & Spacing
| Property | Value |
|---|---|
| Outer container | `max-width: 740px`, centered, `padding: 24px 32px` |
| Card spacing | `margin-bottom: 8px` |
| Card padding | `10px 12px` |
| Card border-radius | `6px` |
| Card border | `1px solid var(--vscode-widget-border)` |
| Card background (rest) | `var(--vscode-editor-background)` |
| Card background (hover) | `var(--vscode-list-hoverBackground)` |
| Section gap | `margin-top: 24px` above completed section |

### 4.2 Toolbar
| Property | Value |
|---|---|
| Button background | `transparent` |
| Button border | `1px solid var(--vscode-widget-border)` |
| Button border-radius | `4px` |
| Button padding | `3px 8px` |
| Button font-size | `12px` |
| Button opacity (rest) | `0.5` |
| Button opacity (hover) | `0.85` |
| Button color | `var(--vscode-foreground)` |

### 4.3 Drag Handle
| Property | Value |
|---|---|
| Glyph | `⠿` |
| Color | `var(--vscode-foreground)` |
| Opacity (rest) | `0.25` |
| Opacity (card hover) | `0.6` |
| Cursor | `grab` |
| Font-size | `14px` |
| Width | `16px` |

### 4.4 Checkbox (Custom SVG)
| State | Visual |
|---|---|
| Unchecked | 16×16 circle, `stroke: var(--vscode-foreground)` at `opacity: 0.4` |
| Checked | Filled circle `fill: var(--vscode-button-background)` + checkmark stroke (animated 150ms on user action, instant on initial render) |
| Cursor | `pointer` |

### 4.5 Task Body Typography
| Property | Value |
|---|---|
| Font-size | `var(--vscode-editor-font-size)` |
| Line-height | `1.6` |
| Inline code background | `var(--vscode-textCodeBlock-background)` |
| Inline code border-radius | `3px` |
| Inline code padding | `1px 4px` |
| Links | `color: var(--vscode-textLink-foreground)` |

### 4.6 Source Link Icon
| Property | Value |
|---|---|
| Icon | Codicon `$(link-external)` |
| Font-size | `13px` |
| Opacity (rest) | `0.0` |
| Opacity (card hover) | `0.5` |
| Opacity (self hover) | `1.0` |
| Tooltip | `"Open source: {filename}"` |

### 4.7 Completed Section Header
| Property | Value |
|---|---|
| Label | `"COMPLETED"`, uppercase, `font-size: 12px`, `font-weight: 600`, `letter-spacing: 0.06em` |
| Label color | `var(--vscode-descriptionForeground)` |
| Chevron | SVG `▸`→`▾`, `transition: transform 0.15s` |
| Count pill | `background: var(--vscode-badge-background)`, `color: var(--vscode-badge-foreground)`, `border-radius: 10px`, `padding: 1px 7px`, `font-size: 11px` |
| Separator | `border-top: 1px solid var(--vscode-widget-border)`, `margin-top: 8px` |
| Default state | **Collapsed** |

### 4.8 Completed Task Cards
| Property | Value |
|---|---|
| Opacity | `0.6` |
| First-line text | `text-decoration: line-through` |
| Drag handle | Hidden |
| Checkbox | Checked (filled), no hover effect |
| Date badge | Same pill style as count badge, positioned before body, abbreviated format ("Apr 14") |

### 4.9 Drag Visual Feedback
| Property | Value |
|---|---|
| Dragged card opacity | `0.4` |
| Dragged card box-shadow | `0 4px 12px rgba(0,0,0,0.2)` |
| Dragged card transform | `scale(1.02)` |
| Drop indicator | `2px` horizontal line, `background: var(--vscode-focusBorder)`, absolutely positioned between cards |

### 4.10 Add/Edit Popup
| Property | Value |
|---|---|
| Position | `fixed`, `top: 15%`, centered horizontally |
| Width | `min(560px, 90vw)` |
| Background | `var(--vscode-editorWidget-background)` |
| Border | `1px solid var(--vscode-focusBorder)` |
| Border-radius | `8px` |
| Box-shadow | `0 8px 32px rgba(0,0,0,0.3)` |
| Padding | `16px` |
| Backdrop | `rgba(0,0,0,0.25)` full-screen overlay |
| Title | `font-size: 11px`, `font-weight: 600`, `text-transform: uppercase`, `letter-spacing: 0.06em`, `color: var(--vscode-descriptionForeground)` |
| Input | `background: var(--vscode-input-background)`, `border: 1px solid var(--vscode-input-border)`, `border-radius: 4px`, `padding: 6px 8px` |
| Textarea min-height | `80px`, auto-grows with content |
| Hint text | Muted, below input; changes per mode |
| Primary button | `var(--vscode-button-background)` / `var(--vscode-button-foreground)` |
| Transition | `none` (instant open/close — no animation) |
| Focus | Trapped inside popup; autofocus on input field |

### 4.11 Scrollbar
Custom `::-webkit-scrollbar` styling:
- Track: `transparent`
- Thumb: `var(--vscode-scrollbarSlider-background)`, `border-radius: 4px`
- Thumb hover: `var(--vscode-scrollbarSlider-hoverBackground)`
- Width: `8px`

---

## 5. Technical Design

### 5.1 Dependencies & Build Pipeline

**New dependencies** (`src/package.json`):
- `dependencies`: `"markdown-it": "^14.x"`, `"@vscode/codicons": "^0.x"`
- `devDependencies`: `"@types/markdown-it": "^14.x"`

`markdown-it` is used by the extension host (in `todoEditorProvider.ts`) to pre-render task bodies into HTML before sending them to the webview. It is bundled into `dist/extension.js` by the existing esbuild pass. `@vscode/codicons` is a production dependency because the font files must be available at runtime to serve to the webview via `localResourceRoots`.

**Webview bundle** (`src/esbuild.config.mjs`):
A second `build()` call runs in parallel with the existing extension bundle:
- Entry: `features/todoEditor/webview/main.ts`
- Output: `dist/webview.js`
- Format: `iife`
- Platform: `browser`
- Externals: none
- Same dev/prod logic (sourcemap in dev, minify in prod)

### 5.2 Message Protocol

**Extension → Webview** (`ToWebviewMessage`):
```typescript
{ type: 'update'; active: UITask[]; completed: UITask[] }
```

**Webview → Extension** (`ToExtensionMessage`):
```typescript
{ type: 'reorder';    ids: string[] }
{ type: 'complete';   id: string }
{ type: 'uncomplete'; id: string }
{ type: 'addTask';    text: string }
{ type: 'editTask';   id: string; newBody: string }
{ type: 'openSource'; id: string }
{ type: 'scan' }
```

**UITask** (sent to webview):
```typescript
{
  id: string;                        // Per-render UUID (not array index)
  bodyHtml: string;                  // Pre-rendered markdown HTML
  bodyMarkdown: string;              // Raw markdown body (for edit pre-fill)
  completedDate: string | null;      // ISO date or null
  sourceRelativePath: string | null; // Relative path to source file or null
}
```
- `rawLines` is intentionally excluded from the webview payload — it is only needed on the extension side.
- `id` is a per-render UUID assigned by the provider to ensure stability. See §5.4.

### 5.3 Document Serializer (`documentSerializer.ts`)

Pure functions for parsing and mutating the `.todo.md` document structure:

- `parseTodoDocument(text)` — Splits on `# To do` / `# Completed` headings (same regex as existing `taskParser`). Returns `{ preamble, active: ParsedCollectorTask[], completed: ParsedCollectorTask[], epilogue }`. Delegates task block parsing to `parseCollectorDocument()` from `taskParser.ts`.
- `completedTask(task, date)` — Returns new `rawLines` with `[x]` checkbox + appended suffix line with completion date.
- `uncompleteTask(task)` — Returns `rawLines` with `[ ]` checkbox, suffix line stripped.
- `addTaskRawLines(text, indentText?)` — Handles single-line and multi-line (splits on `\n`; first line gets `- [ ] `, continuations get hanging indent).
- `updateTaskBody(task, newBody)` — Rebuilds `rawLines` from new body text, preserving `indentText` and keeping the suffix line intact.
- `serializeDocument(doc)` — Reconstructs the full file text from preamble + task rawLines + epilogue.

### 5.4 Provider (`todoEditorProvider.ts`)

`class TodoEditorProvider implements vscode.CustomTextEditorProvider`

**Task ID stability**: The provider holds a `private taskMap = new Map<string, ParsedCollectorTask>()` keyed by UUID. On every `pushUpdate`, the map is replaced with freshly assigned UUIDs for the current parse result. Incoming messages resolve `id` via `taskMap.get(id)` — if not found (stale render), the message is silently dropped.

**Dynamic registration**: The provider is not registered at startup. Instead, the `FeatureManager` callback for `taskCollector` controls the provider's lifecycle:
- On `(root, enabled=true)`: call `TodoEditorProvider.register(context, todoEditorProvider)` → store the returned `Disposable`.
- On `(root, enabled=false)`: for any open editor panels, reopen the document with the built-in text editor (`vscode.commands.executeCommand('vscode.openWith', document.uri, 'default')`) and dispose the panel; then dispose the stored registration `Disposable` → VS Code falls back to the text editor for `*.todo.md` files.
- This reuses the same `FeatureManager.register()` callback pattern used by `BlueprintDecorationProvider` and `TaskCollectorFeature`.

**Lifecycle** (per panel, inside `resolveCustomTextEditor`):
1. Checks for initialized workspace via `ManifestManager`.
2. Configures webview: `enableScripts: true`, `localResourceRoots` includes `dist/` and the `@vscode/codicons` font path.
3. Sets HTML with CSP nonce; loads `dist/webview.js` and codicon CSS via `webview.asWebviewUri()`.
4. Calls `pushUpdate` (initial render).
5. Registers `onDidReceiveMessage` → dispatches to message handlers.
6. Registers `onDidChangeTextDocument` → calls `pushUpdate` for external edits.
7. **All disposables are collected and disposed via `webviewPanel.onDidDispose`** to prevent listener leaks.

**`pushUpdate`**:
- Loads the task index (`manifest.readTaskIndex`) to resolve `sourceRelativePath` for active tasks (from `TaskIndexEntry.source`). For completed tasks, uses `ParsedCollectorSuffix.source` directly.
- Parses document, assigns UUIDs, renders markdown HTML, posts `update` message.

**Task index consistency**: Every mutation (`reorder`, `complete`, `uncomplete`, `addTask`, `editTask`) applies a `WorkspaceEdit` to the `.todo.md` and then triggers `vscode.commands.executeCommand('memoria.syncTasks')` to keep `.memoria/tasks-index.json` consistent.

**Source file write-back** (for `editTask` on collected tasks):
1. Resolve `sourceRelativePath` → URI against initialized root.
2. Read source file, `parseTaskBlocks()`, find block matching `body === task.bodyWithoutSuffix`.
3. If found: apply `replaceLineRange()` → `WorkspaceEdit` → save.
4. If not found: skip source update, show `showWarningMessage("Memoria: Could not find task in source file — .todo.md updated only.")`.

### 5.5 Webview (`webview/main.ts`)

- Initialization: `acquireVsCodeApi()`.
- Listens for `message` events → re-renders on `update`. Task bodies arrive as pre-rendered HTML (`bodyHtml`) from the extension host; the webview does not perform markdown rendering.
- **Optimistic UI**: checkbox clicks and drag-end immediately mutate the DOM before sending the message to the extension. The canonical `update` from the extension silently reconciles.
- **Keyboard shortcuts**: When no input is focused, pressing `a` or `n` opens the add-task popup.
- **Popup**: instant open (no transition animation); `<input>` receives `.focus()` synchronously on open.
- **Custom scrollbar**: `::-webkit-scrollbar` styled with VS Code CSS variables.

### 5.6 Registration

**`package.json` contribution** (`contributes.customEditors`):
```json
[{
  "viewType": "memoria.todoEditor",
  "displayName": "Memoria Todo Editor",
  "selector": [{ "filenamePattern": "*.todo.md" }],
  "priority": "default"
}]
```

**`extension.ts`**: Instantiate `TodoEditorProvider(manifest, context.extensionUri)` in `activate()`. Do **not** register it eagerly. Instead, **extend the existing** `featureManager.register("taskCollector", ...)` callback to also manage the editor provider lifecycle. Do not add a second `register` call — `FeatureManager` uses `Map.set()`, so a second call would silently replace the existing `taskCollectorFeature.refresh()` callback.
```typescript
const todoEditorProvider = new TodoEditorProvider(manifest, context.extensionUri);
let editorDisposable: vscode.Disposable | undefined;
featureManager.register("taskCollector", async (root, enabled) => {
    await taskCollectorFeature.refresh(root, enabled, getWorkspaceRoots());
    if (enabled && !editorDisposable) {
        editorDisposable = TodoEditorProvider.register(context, todoEditorProvider);
    } else if (!enabled && editorDisposable) {
        editorDisposable.dispose();
        editorDisposable = undefined;
    }
});
```

---

## 6. New & Modified Files

| File | Action |
|---|---|
| `src/features/todoEditor/types.ts` | **New** |
| `src/features/todoEditor/documentSerializer.ts` | **New** |
| `src/features/todoEditor/todoEditorProvider.ts` | **New** |
| `src/features/todoEditor/webview/main.ts` | **New** |
| `tests/unit-tests/features/todoEditor/documentSerializer.test.ts` | **New** |
| `tests/e2e-tests/features/todoEditor/todoEditor.test.ts` | **New** |
| `src/package.json` | Add `contributes.customEditors`; add `markdown-it` + `@vscode/codicons` to `dependencies` |
| `src/esbuild.config.mjs` | Add second build pass for `dist/webview.js` |
| `src/extension.ts` | Register `TodoEditorProvider` |
| `src/features/taskCollector/taskParser.ts` | **Reused (read-only)** |
| `src/features/taskCollector/taskWriter.ts` | **Reused (read-only)** — `replaceLineRange()` |
| `src/features/taskCollector/types.ts` | **Reused (read-only)** |
| `src/resources/docs/features/task-collector.md` | **Update** — document the custom Todo Editor (activation, interactions, keyboard shortcuts) |
| `.memory-bank/activeContext.md` | **Update** — reflect current work focus |
| `.memory-bank/progress.md` | **Update** — mark Todo Editor as implemented |
| `.memory-bank/systemPatterns.md` | **Update** — add `TodoEditorProvider` to architecture and component relationships |

---

## 7. Unit Tests

`tests/unit-tests/features/todoEditor/documentSerializer.test.ts`:

- **Round-trip**: `parseTodoDocument(text)` → `serializeDocument(parsed)` → identical text.
- **Complete a task**: suffix added, rawLines reflect `[x]` and date suffix.
- **Uncomplete a task**: suffix stripped, checkbox reset to `[ ]`.
- **`addTaskRawLines`**: single-line → one rawLine; multi-line (with `\n`) → first line + hanging-indented continuations.
- **`updateTaskBody`**: single→single, single→multi, multi→single, multi→multi; suffix line preserved; `indentText` preserved.
- **Edge cases**: empty active section, empty completed section, tasks with multi-line bodies, tasks with no suffix, tasks with fenced code blocks in body.

---

## 8. E2E Tests

`tests/e2e-tests/features/todoEditor/todoEditor.test.ts`:

These tests run in the VS Code extension host and exercise the full provider lifecycle against real files on disk. Webview-internal behavior (DOM manipulation, drag visuals, popup interactions, keyboard shortcuts) **cannot** be tested via the extension host API and remains covered by the manual verification checklist (§9).

- **Feature gate — enabled**: Initialize workspace with `individual-contributor` blueprint → verify `taskCollector` is enabled → open a `*.todo.md` file → assert the active editor's `viewType` is `"memoria.todoEditor"`.
- **Feature gate — disabled**: Initialize workspace → disable `taskCollector` in `features.json` → trigger feature refresh → open a `*.todo.md` file → assert the active editor is the **default text editor** (no custom `viewType`).
- **Feature gate — toggle off while open**: Open `*.todo.md` in the custom editor → disable `taskCollector` → assert the document is reopened with the default text editor (the custom editor panel is disposed).
- **Task index consistency after sync**: Write a source file containing `// TODO: something` → run `memoria.syncTasks` → open the collector `*.todo.md` → verify `tasks-index.json` contains an entry for the collected task with the correct `source` path.
- **External edit reconciliation**: Open `*.todo.md` in the custom editor → apply a `WorkspaceEdit` that appends a new task to the file → wait for `onDidChangeTextDocument` to fire → read the document text to confirm the edit is reflected (the provider re-parses without error).
- **Source file write-back**: Seed a `*.todo.md` with a collected task whose `sourceRelativePath` points to a real file → trigger an `editTask` message via the provider's public test helper (or simulate by editing the `.todo.md` body + syncing) → assert the source file on disk contains the updated task body.
- **Source file missing — graceful degradation**: Seed a `*.todo.md` with a collected task whose source file does not exist → trigger an edit → assert the `.todo.md` is updated and no unhandled error is thrown.

---

## 9. Verification Checklist

1. `npm run build` → both `dist/extension.js` and `dist/webview.js` emit with no errors.
2. Open `*.todo.md` in initialized Memoria workspace → custom editor opens; codicons render correctly.
3. Open `*.todo.md` in a non-Memoria workspace → extension does not activate, file opens as plain text.
4. Disable `taskCollector` feature via `Memoria: Manage Features` → `*.todo.md` opens as plain text; re-enable → custom editor is used again.
5. Drag an active task to a new position → file on disk updates; order persists after closing and reopening.
6. Click checkbox on active task → instant visual completion; task moves to Completed section with today's date; task index stays consistent.
7. Expand Completed section → click checkbox on completed task → instant visual un-completion; task moves back to active.
8. `"+ Add task"` button → popup opens instantly; type single-line task → Enter → task prepended in active; file updated.
9. Press `a` or `n` with no input focused → popup opens.
10. `"+ Add task"` → type text → Shift+Enter → switches to textarea; Enter adds newlines; Shift+Enter confirms → file has correct hanging-indented body.
11. Double-click an active task → popup opens pre-filled; edit text → Save → `.todo.md` updated; for collected tasks, source file also updated.
12. Double-click a collected task whose source has been deleted → `.todo.md` updated, warning notification shown.
13. Double-click a completed task → popup opens pre-filled; suffix line (date/source) untouched after save.
14. Source link `$(link-external)` appears on hover for tasks with a source; click → source file opens beside editor.
15. `$(refresh) Sync` button → triggers `memoria.syncTasks`.
16. External edit to `.todo.md` (via text editor) → custom editor re-renders correctly.
17. Close and reopen editor panel → no stale `taskMap` entries, correct state.
18. Markdown formatting (bold, italic, inline code, links, lists) renders correctly in task bodies.
19. Scrollbar matches VS Code theme styling.
20. `npm test` → all unit tests pass including new `documentSerializer.test.ts`.
21. `npm run test:integration` → all E2E tests pass including new `todoEditor.test.ts`.

---

## 10. Documentation Updates

### 9.1 User Guide

Update `src/resources/docs/features/task-collector.md` to document the custom Todo Editor:

- **What it is**: When the `taskCollector` feature is enabled, `*.todo.md` files open in a visual task board instead of raw markdown.
- **Card layout**: Explain the card anatomy (drag handle, checkbox, rendered markdown body, source link icon).
- **Interactions**: Check/uncheck tasks, drag-and-drop reordering, add task (`+ Add task` button or `a`/`n` keyboard shortcut), edit task (double-click), open source file (link icon).
- **Completed section**: Collapsible section at the bottom; tasks show completion date; can be un-completed.
- **Sync button**: Triggers manual sync of the task index.
- **Fallback**: When `taskCollector` is disabled, `*.todo.md` files open as plain text.

### 9.2 Memory Bank

Update the project memory bank (`f:\Memoria\.memory-bank\`) after implementation:

- **`activeContext.md`**: Reflect the Todo Editor as the current work focus.
- **`progress.md`**: Mark the custom Todo Editor feature as implemented; note the `documentSerializer`, `todoEditorProvider`, webview bundle, and E2E tests.
- **`systemPatterns.md`**: Add `TodoEditorProvider` (`CustomTextEditorProvider`) to the architecture diagram and document its relationship to `FeatureManager`, `ManifestManager`, `taskParser`, and the webview message protocol.

---

## 11. Out of Scope

- Inline text editing within cards (editing is via popup only).
- Keyboard shortcuts beyond `a`/`n` (open add popup) and Enter/Shift+Enter/Escape in the popup.
- Multi-select or bulk operations on tasks.
- In-webview undo/redo (VS Code handles this natively at the document level).
- Custom user themes or visual configuration for the editor.
- Syncing or rendering non-markdown content.
