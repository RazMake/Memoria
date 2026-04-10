# PRD: Blueprints — Workspace Scaffolding & Management

**Version**: 1.0  
**Date**: 2026-04-10  
**Status**: Draft  
**Author**: AI-assisted  

---

## 1. Executive Summary

### Problem Statement

Setting up a structured personal knowledge base workspace (notes, meetings, contacts, TODOs) is a repetitive, error-prone manual process. Users must create the same folder hierarchies, seed template files, and configure VS Code decorations every time they start a new workspace. There is no standardized way to re-initialize or upgrade an existing workspace when the desired structure evolves.

### Proposed Solution

Introduce **Blueprints** — versioned, YAML-defined workspace templates bundled with the Memoria extension. A blueprint declares the folder/file tree to scaffold, file decorations (color, badge), and seed file contents. The extension provides commands to initialize a workspace from a blueprint, re-initialize with safe conflict resolution, and toggle visibility of dot-folders.

### Success Criteria

| KPI | Target |
|-----|--------|
| Workspace setup time (first init) | ≤ 10 seconds from command invocation to fully scaffolded workspace |
| Re-init data loss incidents | 0 — user-modified files are never silently overwritten |
| Dot-folder toggle latency | < 500 ms from command invocation to Explorer refresh |
| Blueprint re-init correctness | 100% of blueprint-defined items are present after re-init |

---

## 2. User Experience & Functionality

### 2.1 User Personas

| Persona | Description |
|---------|-------------|
| **Individual Knowledge Worker** | A developer or PM who maintains a personal knowledge base of notes, TODOs, and reference material. Uses a single-root workspace. Wants a consistent structure across projects. |
| **Manager** | Manages meeting notes, 1:1 records, team contacts, and project status. May use multi-root workspaces to separate team-specific data. Needs a richer, pre-defined hierarchy. |

### 2.2 User Stories

#### US-1: Initialize a workspace from a blueprint

> As a **knowledge worker**, I want to run a single command to scaffold my workspace with a predefined folder/file structure so that I don't have to create folders and files manually every time.

**Acceptance Criteria:**

- The user invokes `Memoria: Initialize workspace` from the Command Palette.
- A QuickPick list shows all bundled blueprints with name and short description.
- After selection, the extension creates the folder/file tree defined in the blueprint's `workspace` section.
- Seed files are copied from the blueprint's asset folder into the workspace.
- A `.memoria/` folder is created at the workspace root containing:
  - `blueprint.json` — records the selected blueprint name, version, and a SHA-256 manifest of all created files.
- File decorations (color, badge) defined in the blueprint are applied to the Explorer immediately.
- An information message confirms successful initialization.

#### US-2: Initialize a multi-root workspace

> As a **manager**, I want to choose which workspace root to initialize so that each root can have its own blueprint.

**Acceptance Criteria:**

- If the workspace has multiple roots, a QuickPick prompts the user to select a root **before** the blueprint selection.
- The selected root is persisted in `.memoria/blueprint.json` under a `rootUri` field.
- On subsequent `Initialize workspace` invocations (re-init), the extension reuses the stored root without prompting again.
- If the stored root no longer exists in the workspace, the extension shows an error and does not proceed.

#### US-3: Re-initialize a workspace

> As a **knowledge worker**, I want to re-run initialization when my blueprint has been updated, keeping my modifications safe while applying the latest structure.

**Acceptance Criteria:**

- The extension detects re-init when `.memoria/blueprint.json` already exists.
- **Same blueprint re-init:**
  - **Folders:**
    - Folders that match the new blueprint → left in place.
    - Folders present on disk but absent from the new blueprint → the user is prompted with a checklist. Options per folder: "Keep (treat as part of workspace)" or "Clean up". Cleaned-up folders are moved to a top-level `ReInitializationCleanup/` folder (not deleted).
  - **Files:**
    - For each file in the blueprint, the extension compares the file's current SHA-256 hash against the hash stored in `.memoria/blueprint.json`.
    - **Unmodified files** (hash matches stored value) → silently overwritten with the latest blueprint version.
    - **Modified files** (hash differs) → the user is prompted: "This file was modified. Overwrite with blueprint version?" Options:
      - Yes (this file only)
      - Yes for all files in this folder (non-recursive)
      - Yes for all files in this folder (recursive)
      - No (skip this file)
- **Different blueprint re-init:** If the user selects a different blueprint than the one stored in `.memoria/blueprint.json`, the extension treats it as a re-init: all folders and files from the old blueprint are moved to `ReInitializationCleanup/` (following the same conflict-resolution flow above), then the new blueprint is scaffolded.
- After re-init, `.memoria/blueprint.json` is updated with the new blueprint name, version, and fresh SHA-256 manifest.
- Files and folders inside `ReInitializationCleanup/` are never processed by re-init.

#### US-4: Toggle dot-folder visibility

> As a **knowledge worker**, I want to quickly show or hide dot-folders (e.g., `.git`, `.vscode`, `.memoria`) so that my Explorer stays clean but I can access config folders when needed.

**Acceptance Criteria:**

- The command `Memoria: Toggle dot-folders` is registered.
- The command is only visible in the Command Palette when the workspace is initialized (`.memoria/` exists).
- The command operates on the initialized workspace root.
- **Behavior when all dot-folders are visible** (none appear in `files.exclude`):
  - All dot-folders are hidden by adding them to the workspace-level `files.exclude` in `.vscode/settings.json`.
- **Behavior when at least one dot-folder is hidden:**
  - A QuickPick (multi-select) is shown listing all dot-folders at the workspace root.
  - Each currently-hidden dot-folder is pre-checked.
  - On confirmation:
    - Checked items → hidden (added to `files.exclude`).
    - Unchecked items → visible (removed from `files.exclude`).
- The command never modifies `files.exclude` entries that are not dot-folders.
- The command tracks which `files.exclude` entries it manages in `.memoria/dotfolders.json`. It only adds/removes entries listed there, ensuring it never touches user-managed or other-extension-managed entries.

#### US-5: File and folder decorations

> As a **knowledge worker**, I want folders and files to be visually distinguished with colors and badges in the Explorer so I can orient myself quickly.

**Acceptance Criteria:**

- Decorations are defined in a separate `decorations` section of `blueprint.yaml`, keyed by glob filter (e.g., `"00-ToDo/"`, `"*.todo"`, `"03-MeetingNotes/**/"`).
- Each decoration rule specifies `color` (ThemeColor string) and/or `badge` (1–2 character string).
- The extension registers a `FileDecorationProvider` that reads decoration rules from `.memoria/decorations.json`.
- Decorations are applied immediately after init and persist across VS Code restarts.
- If the blueprint defines no `decorations` section, no decorations are applied.
- Decoration rules are evaluated in order; the first matching rule wins.

### 2.3 Non-Goals

- **Font-size customization** in Explorer — VS Code does not expose per-item font-size APIs. Deferred.
- **Remote/URL-based blueprint distribution** — out of scope for this release; blueprints are bundled only.
- **Blueprint authoring UI** — users do not create blueprints through the extension. Blueprints are authored externally and bundled.
- **Changing the workspace root after first init** — the selected root is locked after initialization.
- **Syncing workspace state across machines** — out of scope.
- **Custom icon themes** — out of scope; decorations use the built-in `FileDecorationProvider`.

---

## 3. Technical Specifications

### 3.1 Blueprint Format

Each blueprint is a folder inside the extension's `blueprints/` directory:

```
blueprints/
  individual-worker/
    blueprint.yaml
    files/
      File1.md
      Subfolder1.1/
        File1.1.1.md
  manager/
    blueprint.yaml
    files/
      ...
```

#### `blueprint.yaml` Schema

```yaml
name: "Individual Contributor Notebook"
description: "A personal knowledge base for developers and PMs."
version: "1.0.0"                    # SemVer — used to detect blueprint updates

workspace:                           # Tree structure to scaffold
  - name: "Folder1/"
    children:
      - name: "Subfolder1.1/"
        children:
          - name: "File1.1.1.md"
  - name: "File2.todo"

decorations:                         # Separate section — keyed by glob filter
  - filter: "Folder1/"              # Matches the folder itself
    color: "charts.green"
    badge: "📁"
  - filter: "*.todo"                # Matches all .todo files
    color: "charts.yellow"
    badge: "✏️"
```

**Workspace rules:**

- Each entry has a `name` field. Names ending in `/` are folders; all others are files.
- Folders may have a `children` array containing nested entries.
- Files cannot have `children`.
- File contents are resolved from the `files/` sibling directory, mirroring the tree path. If no matching file exists in `files/`, an empty file is created.
- `version` follows SemVer. The extension compares the stored version in `.memoria/blueprint.json` to detect updates.

**Decoration rules:**

- Each rule has a `filter` (glob pattern matched against workspace-relative paths), and optional `color` (ThemeColor string) and `badge` (1–2 character string).
- Filters ending in `/` match folders; all others match files.
- Rules are evaluated in order; the first matching rule wins.
- Badge must be ≤2 characters. Color must be a non-empty ThemeColor string.

### 3.2 `.memoria/` Metadata

Created at the workspace root on init.

#### `.memoria/blueprint.json`

```jsonc
{
  "blueprintName": "individual-worker",
  "blueprintVersion": "1.0.0",
  "rootUri": "file:///path/to/root",      // only for multi-root
  "initializedAt": "2026-04-10T12:00:00Z",
  "lastReinitAt": null,
  "fileManifest": {
    "Folder1/Subfolder1.1/File1.1.1.md": "sha256:abc123...",
    "File2.todo": "sha256:def456..."
  }
}
```

#### `.memoria/decorations.json`

Stored at init time from the blueprint's `decorations` section. Read by `FileDecorationProvider` at runtime.

```jsonc
{
  "rules": [
    { "filter": "Folder1/", "color": "charts.green", "badge": "📁" },
    { "filter": "*.todo", "color": "charts.yellow", "badge": "TD" }
  ]
}
```

#### `.memoria/dotfolders.json`

Tracks which dot-folder `files.exclude` entries are managed by Memoria. The toggle command reads this file to know which entries it owns, ensuring it never touches user-managed or other-extension-managed `files.exclude` entries.

```jsonc
{
  "managedEntries": [
    ".git",
    ".vscode",
    ".memoria"
  ]
}
```

### 3.3 Architecture Overview

```
┌──────────────────────────────────────────────────────┐
│                    VS Code Extension Host              │
│                                                        │
│  ┌──────────────┐   ┌───────────────┐   ┌───────────┐│
│  │ Command:      │   │ Command:      │   │ FileDecor-││
│  │ Initialize    │──▶│ Toggle Dot-   │   │ ation     ││
│  │ Workspace     │   │ Folders       │   │ Provider  ││
│  └──────┬───────┘   └──────┬────────┘   └─────┬─────┘│
│         │                  │                   │       │
│  ┌──────▼──────────────────▼───────────────────▼─────┐│
│  │              Blueprint Engine                      ││
│  │  ┌─────────┐  ┌──────────┐  ┌──────────────────┐  ││
│  │  │ YAML    │  │ File     │  │ Hash / Manifest  │  ││
│  │  │ Parser  │  │ Scaffold │  │ Manager          │  ││
│  │  └─────────┘  └──────────┘  └──────────────────┘  ││
│  └────────────────────────────────────────────────────┘│
│                          │                             │
│  ┌───────────────────────▼────────────────────────────┐│
│  │               VS Code APIs                         ││
│  │  workspace.fs · FileDecorationProvider ·           ││
│  │  window.showQuickPick · workspace.getConfiguration ││
│  └────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────┘
```

**Key components:**

| Component | Responsibility |
|-----------|---------------|
| **Blueprint Engine** | Parses blueprint YAML, resolves file contents from asset folder, diff against existing workspace. |
| **YAML Parser** | Reads `blueprint.yaml` and validates structure. Dependency: a lightweight YAML library (e.g., `yaml` npm package). |
| **File Scaffold** | Creates folders and copies seed files using `vscode.workspace.fs`. |
| **Hash / Manifest Manager** | Computes SHA-256 hashes of files, reads/writes `.memoria/blueprint.json`. |
| **FileDecorationProvider** | Implements `vscode.FileDecorationProvider`; reads decoration rules from `.memoria/decorations.json`. |
| **Toggle Dot-Folders** | Reads/writes `files.exclude` in workspace-level `.vscode/settings.json`. Tracks managed entries in `.memoria/dotfolders.json`. |

### 3.4 Integration Points

| System | Integration |
|--------|-------------|
| **VS Code Workspace FS** | All file/folder creation and reading goes through `vscode.workspace.fs` for virtual filesystem compatibility. |
| **VS Code Settings** | Dot-folder toggle reads/writes `files.exclude` via `vscode.workspace.getConfiguration('files').update()`. |
| **Telemetry** | All commands emit telemetry events via the existing `@vscode/extension-telemetry` integration. Events: `blueprint.init`, `blueprint.reinit`, `dotfolders.toggle`. |

### 3.5 Security & Privacy

- **No network access** — blueprints are bundled; no data leaves the user's machine.
- **No secrets** — the extension stores no credentials or tokens.
- **File-system scope** — the extension only writes inside the user-selected workspace root. It never writes outside the workspace. All resolved paths are validated to ensure they do not escape the workspace root (e.g., via `../` in blueprint entries).
- **SHA-256 hashes** — stored hashes are of file content only; no PII is hashed.
- **Telemetry** — follows VS Code's `telemetry.telemetryLevel` setting; no file content or names are sent.
- **Path normalization** — manifest paths always use forward slashes (`/`), regardless of OS. SHA-256 hashes use lowercase hex.

---

## 4. Risks & Roadmap

### 4.1 Phased Rollout

#### Phase 1 — MVP

| Feature | Scope |
|---------|-------|
| `Initialize workspace` command | Single-root only. QuickPick blueprint selection. Scaffold folder/file tree. Create `.memoria/`. |
| Bundled blueprints | Two blueprints: "Individual Contributor Notebook" and "People Manager Notebook". |
| Blueprint YAML parsing | `workspace` section only. |
| File manifest (SHA-256) | Compute and store hashes at init time. |

#### Phase 2 — Core Polish

| Feature | Scope |
|---------|-------|
| Multi-root workspace support | Root selection QuickPick, root persistence in `.memoria/blueprint.json`. |
| Re-initialization | Folder conflict resolution, file change detection, `ReInitializationCleanup/` folder. |
| Toggle dot-folders command | Full show/hide behavior with `files.exclude`. |

#### Phase 3 — Visual & UX

| Feature | Scope |
|---------|-------|
| File decorations | `FileDecorationProvider` driven by blueprint `decorations` section. Rules stored in `.memoria/decorations.json`. |
| Blueprint versioning UX | Notify user when a bundled blueprint version is newer than the workspace's stored version; prompt to re-init. |

### 4.2 Technical Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| **YAML parsing edge cases** | Malformed blueprint could crash init | Validate YAML against a JSON Schema before processing; surface clear error messages. |
| **Large workspaces** | SHA-256 hashing many files on re-init could be slow | Hash only blueprint-managed files (listed in manifest), not the entire workspace. |
| **`files.exclude` conflicts** | Other extensions or user may also manage `files.exclude` | Track Memoria-managed entries in `.memoria/dotfolders.json`. The toggle command only adds/removes entries listed in this file, never touching other `files.exclude` entries. |
| **Multi-root root removal** | User removes the initialized root from the workspace | Detect on activation; show warning. Do not auto-migrate. |
| **Blueprint asset files missing** | A `workspace` entry references a file not present in `files/` | Create an empty file and log a warning; do not fail the entire init. |
| **FileDecorationProvider limitations** | Badge is limited to 2 characters; color must be a valid ThemeColor | Validate in blueprint parsing; warn on invalid values. |

---

## 5. Resolved Questions

| # | Question | Decision |
|---|----------|----------|
| 1 | Should the extension auto-detect an un-initialized workspace and prompt the user? | **No.** The user explicitly triggers initialization via the command. No automatic prompts. |
| 2 | Should `ReInitializationCleanup/` be timestamped? | **No.** A single, non-timestamped `ReInitializationCleanup/` folder is used. |
| 3 | Should decorations be defined per-file in the `workspace` tree, or via glob patterns in a separate section? | **Separate `decorations` section with glob filters.** Workspace entries define structure only; decoration rules are keyed by filter pattern in a dedicated section. This keeps the tree clean and allows glob-based matching (e.g., `"*.todo"`). |
| 4 | What should happen when the user runs init on an already-initialized workspace but picks a **different** blueprint? | **Treat as re-init.** Old blueprint items are moved to `ReInitializationCleanup/` via the standard conflict-resolution flow, then the new blueprint is scaffolded. |
