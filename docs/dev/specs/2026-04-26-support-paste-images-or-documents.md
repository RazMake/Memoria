# PRD: Paste Images — Automatic Image Capture for Markdown

**Date**: 2026-04-26
**Status**: Draft

## 1. TL;DR

Add a new Memoria **built-in feature** — **Image Paste** — that intercepts clipboard paste operations containing images inside Markdown files, saves the image binary to a configurable folder in the workspace, and inserts standard Markdown image syntax (`![](relative-path)`) at the cursor. The feature uses VS Code's `DocumentPasteEditProvider` API. Unlike blueprint-defined features, Image Paste is a **built-in feature**: it is always present in the feature manager regardless of which blueprint is active, it is enabled by default, and it survives blueprint changes. This requires introducing a new "built-in features" infrastructure layer in the feature system. Configuration (target image folder) is stored in `.memoria/image-paste.json`.

---

## 2. Goals / Non-goals

**Goals**

- Intercept paste operations that contain image data (PNG, JPEG, GIF, WebP, BMP, SVG) in Markdown files within initialized Memoria workspaces.
- Save the pasted image binary to a workspace folder configured via `.memoria/image-paste.json`, defaulting to `images/` at the workspace root.
- Insert standard Markdown image syntax at the cursor position with a relative path from the Markdown file's directory to the saved image.
- Name saved images using a timestamp pattern (`image-YYYY-MM-DD-HHmmss.{ext}`) to avoid collisions.
- Handle filename collisions by appending a numeric suffix (`image-2026-04-26-143052-1.png`).
- Introduce the concept of **built-in features** — features that exist regardless of the active blueprint, appear in `Memoria: Manage Features`, and default to enabled even when absent from `features.json`.
- Allow users to disable the feature via `Memoria: Manage Features`.
- Preserve the user's enable/disable toggle across blueprint re-initialization.

**Non-goals**

- Drag-and-drop image support (only clipboard paste).
- Image compression, resizing, or format conversion.
- Pasting non-image files (PDFs, Office documents, etc.) — title says "or documents" but scope is images only for MVP.
- Working in uninitialized workspaces (no `.memoria/` folder).
- Supporting non-Markdown file types.
- Supporting untitled or remote-scheme files.
- Blueprint templates for the image-paste configuration.
- Image gallery or management UI.
- Clipboard history or multi-image paste.

---

## 3. User-visible behavior

### 3.1 Feature registration

- Feature ID: `imagePaste`. Appears in `Memoria: Manage Features` alongside blueprint-defined features.
- **Built-in feature**: Not defined in any blueprint YAML. Instead, declared in a new `builtInFeatures.ts` module that the feature system always includes.
- `enabledByDefault: true` — the feature is enabled on first workspace initialization without user action.
- The feature respects the same enable/disable toggle as all other features. Disabling it via "Manage Features" persists to `.memoria/features.json` and stops the paste interception.
- No new activation events needed — the extension already activates via `workspaceContains:.memoria/blueprint.json`.

### 3.2 Paste interaction flow

1. User copies an image to the clipboard (screenshot, image from browser, file explorer, etc.).
2. User opens a Markdown file (`.md`) in an initialized Memoria workspace.
3. User pastes (`Ctrl+V` / `Cmd+V`).
4. The extension detects image MIME types in the clipboard data transfer.
5. The extension:
   - Reads the image folder path from `.memoria/image-paste.json` (or uses default `images`).
   - Generates a filename: `image-YYYY-MM-DD-HHmmss.{ext}` where `{ext}` is derived from the MIME type.
   - Checks if the file already exists; if so, appends `-1`, `-2`, etc.
   - Creates the target directory if it doesn't exist.
   - Saves the image binary via a `WorkspaceEdit.createFile()` operation.
   - Computes the relative path from the Markdown file's directory to the saved image.
   - Inserts `![](relative/path/to/image.png)` at the cursor position.
6. The cursor is placed between the `[]` brackets so the user can immediately type alt text.

**When the feature is disabled**: paste operations behave as standard VS Code paste — no interception, no image saving.

**When no image data is in the clipboard**: the provider returns no edits, and VS Code falls back to its default paste behavior (inserting text, etc.).

### 3.3 Configuration

Configuration is stored in `.memoria/image-paste.json`:

```json
{
    "imageFolder": "assets/images"
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `imageFolder` | `string` | `"images"` | Path relative to the workspace root where pasted images are saved. Created automatically if it doesn't exist. |

When the config file is missing, the default image folder `images` is used. When the config file changes on disk, the feature re-reads it without requiring a restart.

### 3.4 MIME type to file extension mapping

| MIME Type | Extension |
|-----------|-----------|
| `image/png` | `.png` |
| `image/jpeg` | `.jpg` |
| `image/gif` | `.gif` |
| `image/webp` | `.webp` |
| `image/bmp` | `.bmp` |
| `image/svg+xml` | `.svg` |

If the clipboard contains multiple image MIME types, the provider selects the first match by the order above (PNG preferred).

### 3.5 Filename generation

Format: `image-YYYY-MM-DD-HHmmss.{ext}`

Example: `image-2026-04-26-143052.png`

**Collision handling**: If the file already exists, a numeric suffix is appended:
- `image-2026-04-26-143052-1.png`
- `image-2026-04-26-143052-2.png`
- ...up to 99 attempts, then fail with an error notification.

### 3.6 Relative path computation

The inserted Markdown path is always **relative from the Markdown file's directory** to the saved image file.

Examples:
- Markdown at `docs/notes.md`, image saved to `images/image-2026-04-26-143052.png` → `![](../images/image-2026-04-26-143052.png)`
- Markdown at `README.md`, image saved to `images/image-2026-04-26-143052.png` → `![](images/image-2026-04-26-143052.png)`
- Markdown at `docs/sub/page.md`, image saved to `docs/images/shot.png` → `![](../images/shot.png)`

Path separators are always POSIX forward slashes (`/`), even on Windows.

---

## 4. Built-in Feature Infrastructure

This feature introduces a new architectural concept: **built-in features**. These differ from blueprint features:

| Aspect | Blueprint Features | Built-in Features |
|--------|-------------------|-------------------|
| Defined in | Blueprint YAML files | `builtInFeatures.ts` constant |
| Present in features.json | Only after init with that blueprint | Injected into every features.json on init/re-init |
| Survives blueprint change | Removed if new blueprint doesn't define them | Always preserved |
| Default when missing from features.json | Disabled (`false`) | Uses `enabledByDefault` value |

### 4.1 `builtInFeatures.ts`

A new module exporting a constant array of feature definitions:

```typescript
export const builtInFeatures: BuiltInFeature[] = [
    {
        id: "imagePaste",
        name: "Paste Images",
        description: "Save clipboard images to a folder and insert Markdown references",
        enabledByDefault: true,
    },
];
```

### 4.2 Integration with `buildFeaturesConfig()`

When creating `features.json` during first-time initialization, built-in features are appended after blueprint-defined features. Their `enabled` state is set to `enabledByDefault`.

### 4.3 Integration with `mergeFeaturesConfig()`

During re-initialization (blueprint change), built-in features are included in the merge:
- If the user previously toggled a built-in feature, their choice is preserved.
- New built-in features (added in a future extension update) are added with `enabledByDefault`.
- Built-in features are never removed during re-initialization.

### 4.4 FeatureManager fallback

When `FeatureManager.refresh()` encounters a registered feature that is absent from `features.json`, it currently defaults to `false` (disabled). For built-in features, it must default to the feature's `enabledByDefault` value instead. This ensures that built-in features work even in edge cases where `features.json` was manually edited or created before the built-in was added.

---

## 5. Technical Specifications

### 5.1 Architecture overview

```
┌─────────────────────────────────────────────────┐
│  extension.ts (activation)                       │
│                                                   │
│  ┌───────────────┐   ┌────────────────────────┐  │
│  │FeatureManager │──▶│ imagePaste callback     │  │
│  │  .register()  │   │  enable → register      │  │
│  │  .refresh()   │   │           provider      │  │
│  └───────────────┘   │  disable → dispose      │  │
│                      │           provider      │  │
│                      └──────────┬─────────────┘  │
│                                 │                 │
│  ┌──────────────────────────────▼──────────────┐ │
│  │ ImagePasteFeature                            │ │
│  │  - reads .memoria/image-paste.json           │ │
│  │  - exposes imageFolder to provider           │ │
│  └──────────────────────────────┬──────────────┘ │
│                                 │                 │
│  ┌──────────────────────────────▼──────────────┐ │
│  │ ImagePasteProvider                           │ │
│  │  (DocumentPasteEditProvider)                 │ │
│  │  - pasteMimeTypes: image/*                   │ │
│  │  - provideDocumentPasteEdits():              │ │
│  │    1. Extract image data from DataTransfer   │ │
│  │    2. Generate timestamp filename            │ │
│  │    3. Resolve target URI (root + folder)     │ │
│  │    4. De-duplicate filename                  │ │
│  │    5. Return DocumentPasteEdit:              │ │
│  │       - insertText: ![](relative-path)       │ │
│  │       - additionalEdit: createFile(image)    │ │
│  └──────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────┘
```

### 5.2 New files

| File | Purpose |
|------|---------|
| `src/features/builtInFeatures.ts` | Constant array of built-in feature definitions |
| `src/features/imagePaste/imagePasteFeature.ts` | Feature lifecycle: refresh/start/stop, config reading |
| `src/features/imagePaste/imagePasteProvider.ts` | `DocumentPasteEditProvider` implementation |

### 5.3 Modified files

| File | Change |
|------|--------|
| `src/blueprints/blueprintEngine.ts` | `buildFeaturesConfig()` and `mergeFeaturesConfig()` append built-in features |
| `src/features/featureManager.ts` | `refresh()` uses built-in defaults as fallback for missing features |
| `src/blueprints/manifestManager.ts` | Add `readImagePaste()` method for `.memoria/image-paste.json` |
| `src/extension.ts` | Instantiate feature, register with FeatureManager, lazy-register/dispose paste provider on toggle |
| `src/fileWatchers.ts` | Watch `.memoria/image-paste.json` for config changes |

### 5.4 DocumentPasteEditProvider registration

```typescript
vscode.languages.registerDocumentPasteEditProvider(
    { language: "markdown", scheme: "file" },
    provider,
    {
        pasteMimeTypes: [
            "image/png", "image/jpeg", "image/gif",
            "image/webp", "image/bmp", "image/svg+xml",
        ],
        providedPasteEditKinds: [
            new vscode.DocumentDropOrPasteEditKind("memoria.pasteImage"),
        ],
    },
);
```

### 5.5 Integration points

- **ManifestManager**: reads `.memoria/image-paste.json` config (image folder path).
- **VS Code FileSystem API** (`workspace.fs`): used for `stat()` checks during filename de-duplication and directory creation.
- **WorkspaceEdit API**: `createFile()` for writing image bytes to disk as part of the paste edit.
- **VS Code DataTransfer API**: `DataTransferItem.asFile().data()` for reading image bytes from clipboard.

### 5.6 Security & privacy

- Image data never leaves the local filesystem — no network calls.
- Images are written only to folders within the workspace root. The `imageFolder` path is validated to ensure it resolves within the workspace root (no `../../../` escape).
- No sensitive metadata stripping is performed on images (EXIF data is preserved as-is from the clipboard).

---

## 6. Risks & Rollout

### 6.1 Phased rollout

**Phase 1 — MVP (this PRD)**
- Built-in feature infrastructure (`builtInFeatures.ts`, engine/manager changes).
- Image paste provider for Markdown files.
- Configurable image folder via `.memoria/image-paste.json`.
- Timestamp-based filenames with collision handling.
- Standard Markdown image syntax insertion.

**Phase 2 — Enhancements (future)**
- Drag-and-drop image support (register `DocumentDropEditProvider` alongside paste).
- Image folder path relative to the Markdown file's directory (alternative to workspace-root-relative).
- User-prompted image naming (input box on paste).
- Image paste in non-Markdown file types.

**Phase 3 — Extended media (future)**
- Paste support for non-image files (PDFs, documents) with download-link syntax.
- Image compression/resize options in config.
- Clipboard history integration.

### 6.2 Technical risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| `DocumentPasteEditProvider` API changes in future VS Code versions | Low | High | Pin minimum VS Code engine version; monitor VS Code release notes |
| Clipboard doesn't expose raw image data on some platforms | Medium | Medium | Gracefully return no edits; user falls back to manual save + reference |
| Large images (screenshots of 4K displays) cause slow paste | Low | Low | Image is written via `createFile()` in the WorkspaceEdit — VS Code handles the I/O asynchronously |
| Conflicting paste providers from other extensions | Medium | Low | Use `yieldTo` on the `DocumentPasteEdit` to defer to other providers when appropriate; use a unique `DocumentDropOrPasteEditKind` |
| Built-in feature infrastructure breaks existing tests | Low | Medium | Existing `buildFeaturesConfig` / `mergeFeaturesConfig` tests are updated to account for built-in features being appended |

### 6.3 Dependencies

- VS Code engine version must support `DocumentPasteEditProvider` (stable since VS Code 1.82+).
- No external npm dependencies required — all APIs are from `vscode` namespace.
- Depends on existing `ManifestManager`, `FeatureManager`, and file watcher infrastructure.

---

## 7. Testing Strategy

### 7.1 Unit tests

- `buildFeaturesConfig()` includes built-in features alongside blueprint features.
- `mergeFeaturesConfig()` preserves user's toggle state for built-in features across re-initialization.
- `mergeFeaturesConfig()` adds new built-in features with `enabledByDefault` when they appear in an extension update.
- `mergeFeaturesConfig()` never removes built-in features during re-initialization.
- `FeatureManager.refresh()` defaults built-in features to enabled when absent from `features.json`.
- `FeatureManager.refresh()` respects explicit `enabled: false` in `features.json` for built-in features.
- Image filename generation produces correct timestamp format.
- Filename de-duplication appends correct numeric suffixes.
- Relative path computation from Markdown file directory to image folder (same dir, parent dir, sibling dir).
- MIME type to extension mapping returns correct extensions.
- Image folder path validation rejects paths that escape workspace root.

### 7.2 Integration tests

- Paste image in Markdown file → image file created in configured folder, Markdown reference inserted at cursor.
- Paste image with default config (no `.memoria/image-paste.json`) → image saved to `images/` folder.
- Paste non-image content → no interception, standard paste behavior.
- Feature disabled via Manage Features → paste does not intercept images.
- Re-initialize workspace with different blueprint → imagePaste feature toggle state preserved.

### 7.3 Manual validation

- Paste screenshot from Windows Snipping Tool.
- Paste image copied from web browser.
- Paste image copied from file explorer.
- Verify inserted path renders correctly in Markdown preview.
- Verify Manage Features shows "Paste Images" with correct toggle state.
