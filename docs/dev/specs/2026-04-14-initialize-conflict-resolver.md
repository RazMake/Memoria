# PRD: Updated Initialization Conflict Resolver

## 1. Executive Summary

**Problem Statement**: The current reinitialization conflict resolver has two UX flaws: (1) folder-cleanup semantics are inverted — "checked" means "remove" rather than the intuitive "keep" — and (2) modified files prompt the user one-by-one via modal dialogs, which is tedious and offers no way to visually compare old vs. new content side-by-side.

**Proposed Solution**: Replace the current per-file modal flow with a two-phase batch QuickPick approach (one for folders, one for files) and open VS Code diff editors in batches for files the user wants to merge manually. The new algorithm also explicitly handles user-created files (not from the previous blueprint) that collide with new blueprint files.

**Success Criteria**:

- **Fewer prompts**: At most 2 QuickPick dialogs per reinit (folders + files), down from N modal dialogs.
- **No data loss**: Every overwritten or removed file/folder is recoverable from `ReInitializationCleanup/`, preserving the original relative path.
- **Faster reinit**: Batch file hashing via `Promise.all()` (already in place); no sequential per-file modals blocking flow.
- **Clear UX**: Diff editors open in batches of 10 after reinit for all files the user marked for manual review.

---

## 2. User Experience & Functionality

**User Persona**: A VS Code user who previously initialized their workspace with a Memoria blueprint and is now reinitializing — either with a newer version of the same blueprint or a different blueprint entirely.

**User Stories**:

| # | Story | Acceptance Criteria |
|---|-------|---------------------|
| US-1 | As a user, I want extra folders (not in the new blueprint) to be kept by default, so I don't accidentally lose work. | Folder QuickPick shows all extra folders **checked** (keep). Folders the user **unchecks** are moved to `ReInitializationCleanup/`. |
| US-2 | As a user, I want to see all conflicting files in one list and choose which to review via diff. | A single multi-select QuickPick shows all conflicting files. **All conflicting files are overwritten.** Checked = additionally open a diff editor. Unchecked = override silently (backup remains in cleanup). |
| US-3 | As a user, I want a side-by-side diff of my old file vs. the new blueprint file so I can merge my changes back. | After reinit, VS Code diff editors open in batches of 10 for checked files. Left = backup in `ReInitializationCleanup/` (read-only). Right = new blueprint file in workspace (editable). |
| US-4 | As a user, I want my modifications to be recoverable even if I chose not to review them in diff. | All conflicting files (checked or unchecked) have their old version preserved in `ReInitializationCleanup/` at the same relative path before overwriting. |
| US-5 | As a user, if I created a file that collides with a new blueprint file, I want the same conflict treatment as modified blueprint files. | User-created files with different content from the new blueprint file are backed up to cleanup, added to `toMergeList`, and overwritten. User-created files with identical content are replaced silently and added to the manifest. |

**What "manual merge" means**: The user edits and saves the right-hand workspace file in the diff editor to incorporate changes from the backup on the left. Memoria does not track merge completion. After the user saves, those files will be "modified" relative to the manifest — this is expected and intentional.

**Non-Goals**:

- Automatic 3-way or semantic merge.
- Changes to the first-time (fresh) workspace initialization flow.
- Changes to the blueprint selection QuickPick or multi-root root picker.
- Automatic cleanup of `ReInitializationCleanup/` — the user manages this folder.

---

## 3. Technical Specifications

### 3.1 Resolution Algorithm

This replaces the logic in `resolveConflicts()` in `reinitConflictResolver.ts`.

#### Phase A — Categorize (no UI, parallel I/O)

All file hashing happens here. `currentFileHashes` is an internal local map — it is **not** part of `ReinitPlan`.

1. Walk the **new blueprint's** folder tree. For each blueprint folder:
   - If a matching folder exists on disk → scan its files (step 2).
   - If no matching folder on disk → will be created by scaffold (no conflict, no tracking needed).
2. For each **file in the new blueprint** within a matched folder:
   - If a matching file exists on disk:
     - **Was in previous blueprint** (exists in `fileManifest`):
       - Compute current on-disk hash. Compare to stored manifest hash.
       - **Hash changed** → copy to `ReInitializationCleanup/<relative-path>`, add to `toMergeList`.
       - **Hash unchanged** → no backup needed; will be overwritten silently.
     - **Not in previous blueprint** (user-created):
       - Compute on-disk hash. Compare to the **rendered seed content** for that blueprint file path (currently verbatim asset content).
       - **Different** → copy to `ReInitializationCleanup/<relative-path>`, add to `toMergeList`.
       - **Identical** → replace silently and add to manifest (no-op on disk).
   - If no matching file on disk → write new blueprint file (no conflict).
3. Walk **disk top-level folders** not present in the new blueprint and not in the protected list (`.memoria`, `ReInitializationCleanup`) → add to `extraFolders`.

> **`.memoria/` is excluded from conflict resolution entirely.** It is system-managed metadata written by `manifestManager`. Conflict resolution applies only to blueprint workspace content. The manifest, decorations, features, and default-files configs are handled separately by the engine after scaffold.

#### Phase B — Folder QuickPick (UI)

4. Show a multi-select QuickPick with all `extraFolders`. **All items checked by default** (keep in place).
   - Checked → kept where it is.
   - Unchecked → user wants it moved; captured as `foldersToCleanup`.
   - If user cancels → abort reinit. File backups already in `ReInitializationCleanup/` are left in place (non-destructive).

#### Phase C — File Merge QuickPick (UI)

5. Show a multi-select QuickPick with all `toMergeList` files (relative paths). **No items checked by default.**
   - Checked → file is overwritten **and** a diff editor will open afterward.
   - Unchecked → file is overwritten silently (backup already in cleanup).
   - If user cancels → abort reinit. Backups are left in place.

> Both QuickPicks complete before any folder moves or scaffold writes occur. If the user cancels at either QuickPick, the workspace folder structure is unchanged beyond the file backups already written to `ReInitializationCleanup/`.

#### Phase D — Execute

6. Move each folder in `foldersToCleanup` to `ReInitializationCleanup/<folder-name>/`.
7. Run `scaffoldTree()` — writes all new blueprint files unconditionally (conflicts already resolved).
8. Write updated `.memoria/blueprint.json` with hashes from the freshly written scaffold files.
9. Merge feature toggles (preserve user's enabled state); write `.memoria/features.json`, `decorations.json`, `default-files.json`.

#### Phase E — Diff Editors

10. For each file the user checked in step 5, open a VS Code diff editor:
    - **Left**: `ReInitializationCleanup/<relative-path>` (read-only, the user's old version)
    - **Right**: `<workspace-root>/<relative-path>` (editable, the new blueprint version)
    - Title: `"Merge: <filename> (old ↔ new)"`
    - Open in batches of 10: issue all 10 `vscode.diff` commands, await all promises in the batch, then proceed to the next 10 until exhausted.

#### Architecture Flow

```
User triggers reinit
  │
  ▼
Phase A: resolveConflicts()        ← parallel I/O, no UI
  │  internal: currentFileHashes (local only)
  │  output: extraFolders[], toMergeList[]
  │  side-effect: backups copied to ReInitializationCleanup/
  │
  ▼
Phase B: promptFolderCleanup()     ← multi-select, all checked by default
  │  output: foldersToCleanup[] (unchecked items)
  │  cancel → abort (backups remain)
  │
  ▼
Phase C: promptFileMerge()         ← multi-select, none checked by default
  │  output: filesToDiff[] (checked items)
  │  cancel → abort (backups remain)
  │
  ▼
Phase D: Execute
  ├─ Move foldersToCleanup → ReInitializationCleanup/
  ├─ scaffoldTree() — all blueprint files written unconditionally
  └─ Write .memoria/ (manifest, decorations, features, default-files)
  │
  ▼
Phase E: openDiffEditors()         ← batches of 10, all filesToDiff covered
```

---

### 3.2 Type Changes (`types.ts`)

**Remove**:

- `OverwriteChoice` (`"yes" | "yes-folder" | "yes-folder-recursive" | "no"`)
- `modifiedBlueprintFiles` (Set) from `ReinitPlan`
- `unmodifiedBlueprintFiles` from `ReinitPlan`
- `currentFileHashes` from `ReinitPlan` — now an internal local in `resolveConflicts()`

**Update `ReinitPlan`** to:

- `extraFolders: string[]` — all top-level disk folders not in new blueprint (input to folder picker)
- `foldersToCleanup: string[]` — subset of `extraFolders` the user unchecked (output of folder picker)
- `toMergeList: string[]` — relative paths of conflicting files (input to file picker)
- `filesToDiff: string[]` — subset of `toMergeList` the user checked (output of file picker)

**Remove from `ReinitPlan`**:

- `foldersToCreate` — scaffold creates missing folders implicitly; not needed on the plan

---

### 3.3 Resolver Interface Changes (`reinitConflictResolver.ts`)

- **Remove** `promptFileOverwrite()` (per-file modal)
- **Update** `promptFolderCleanup(extraFolders: string[]): Promise<string[] | undefined>` → all items checked by default; returns the **unchecked** folder names (to remove), or `undefined` on cancel
- **Add** `promptFileMerge(toMergeList: string[]): Promise<string[] | undefined>` → returns checked file paths (to diff), or `undefined` on cancel
- **Add** `openDiffEditors(workspaceRoot: Uri, cleanupRoot: Uri, filePaths: string[]): Promise<void>` → opens diffs in batches of 10 using `vscode.commands.executeCommand("vscode.diff", ...)`

---

### 3.4 Engine Changes (`blueprintEngine.ts`)

- `reinitialize()` no longer passes a per-file overwrite callback to `scaffoldTree()`. All blueprint files are written unconditionally.
- Remove folder-scoped "yes-all" decision tracking (`folderOverwriteDecisions` map).
- `backupFile()` is called during Phase A (categorization), not during scaffold.
- After scaffold + manifest write, call `resolver.openDiffEditors()` with the `filesToDiff` list from the plan.
- Abort reinit (return early) if either QuickPick returns `undefined` (user cancelled).

---

### 3.5 Scaffold Changes (`fileScaffold.ts`)

- `scaffoldTree()` no longer receives a `getSeedContent` callback that can return `SKIP_FILE`. All entries are written unconditionally.
- Remove `skippedPaths` from `ScaffoldResult`.

---

## 4. Risks

| Risk | Mitigation |
|------|------------|
| Many diff editors opened at once overwhelm the editor | Open in batches of 10: await all `vscode.diff` command promises per batch before starting the next. All files are covered; no cap. |
| User cancels after file backups are already written | Backups are left in `ReInitializationCleanup/` intentionally — non-destructive and potentially useful. No rollback. |
| Non-blueprint file comparison uses wrong hash baseline | Compare against rendered seed content (currently verbatim asset) for the target path, not a source asset hash. Explicitly tested. |
| `.memoria/` accidentally processed as blueprint content | Hardcoded exclusion in `findExtraFolders()` and Phase A categorization; covered by unit tests. |

---

## 5. Affected Files & Scope

**Modify**:

- `src/blueprints/types.ts` — update `ReinitPlan`, remove `OverwriteChoice`
- `src/blueprints/reinitConflictResolver.ts` — new algorithm, updated prompts, diff batch opener
- `src/blueprints/blueprintEngine.ts` — updated `reinitialize()`, remove per-file callback, add diff call
- `src/blueprints/fileScaffold.ts` — remove skip logic and `skippedPaths` from `ScaffoldResult`
- `tests/unit-tests/blueprints/reinitConflictResolver.test.ts` — rewrite for new algorithm
- `tests/unit-tests/blueprints/fileScaffold.test.ts` — remove skip-related tests
- `tests/e2e-tests/blueprints/reinitializeWorkspace.test.ts` — update for new flow
- `src/resources/docs/faq.md` — update reinit conflict section
- `src/resources/docs/commands/` — update reinit behavior description

**Reference** (no changes):

- `src/blueprints/hashUtils.ts` — reuse `computeFileHash()` unchanged
- `src/blueprints/manifestManager.ts` — manifest schema unchanged

---

## 6. Verification

1. **Unit — categorization**:
   - Blueprint file, hash unchanged → not backed up, not in `toMergeList`
   - Blueprint file, hash changed → backed up to `ReInitializationCleanup/` at same relative path, in `toMergeList`
   - User-created file, content differs from blueprint seed → backed up, in `toMergeList`
   - User-created file, content identical to blueprint seed → not backed up, not in `toMergeList`, added to manifest
   - Blueprint file not on disk → no conflict
   - `.memoria/` folder → excluded from `extraFolders` and Phase A categorization
   - `ReInitializationCleanup/` folder → excluded from `extraFolders`
2. **Unit — folder QuickPick**: all items checked by default; returns unchecked names; `undefined` on cancel
3. **Unit — file merge QuickPick**: no items checked by default; returns checked paths; `undefined` on cancel
4. **Unit — diff batching**: given 25 files, `openDiffEditors` calls `vscode.diff` in 3 batches (10, 10, 5); each batch awaited before the next
5. **Unit — cancellation**: cancel at folder picker → no scaffold, no folder moves; cancel at file picker → same
6. **Unit — `scaffoldTree()`**: no `SKIP_FILE` path, no `skippedPaths` in result
7. **Unit — engine**: `reinitialize()` calls `openDiffEditors` with `filesToDiff` after manifest write
8. **E2E**: full reinit with fixture workspace containing modified files; verify `ReInitializationCleanup/` mirrors relative paths; verify all blueprint files present in workspace after reinit
9. **Manual**: reinit with modified files; confirm diff editors open with correct left (old) / right (new) content
10. **Build & test**: `npm run build` → clean; `npm run test` → all pass; `npm run test:integration` → all pass

---

## 7. Decisions

- **Folder picker semantics**: checked = keep (inverted from current). This is the primary UX fix.
- **All conflicting files overwritten**: the file picker does not decide *whether* to overwrite — it only decides *which* files to additionally open in diff. Overwrite always happens.
- **`.memoria/` excluded from conflict resolution**: it is system-managed and handled separately by the engine after scaffold.
- **Cancellation**: backups in `ReInitializationCleanup/` survive cancellation. No rollback.
- **Post-merge manifest state**: after the user saves merged content, those files will show as "modified" relative to the manifest. This is correct and expected. Memoria takes no further action.
- **`currentFileHashes`**: internal to `resolveConflicts()`; not exposed on `ReinitPlan`.
- **`foldersToCreate`**: removed; scaffold creates missing folders implicitly.
- **Diff batching**: 10 per batch, await all in batch, proceed to next. No cap — all merge files get a diff editor.
- **Scope**: reinitialization only. First-time init is untouched.
