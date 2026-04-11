# Product Context — Memoria

## Problem Statement
Developers and managers often lack a structured, persistent personal workspace for notes, TODOs, meeting minutes, and contacts. Existing solutions are either too heavyweight (Notion, OneNote) or unstructured (loose .md files).

## Solution
Memoria provides opinionated workspace scaffolding via **blueprints** — predefined folder/file templates that create a ready-to-use knowledge base inside any VS Code workspace. The `.memoria/` metadata directory tracks which blueprint was applied and file hashes for safe re-initialization.

## How It Works
1. User runs `Memoria: Initialize workspace` from the Command Palette.
2. In multi-root workspaces, a QuickPick asks which root to initialize.
3. User selects a blueprint (Individual Contributor or People Manager).
4. The extension scaffolds folders, seed files (e.g., `Main.todo`), and writes metadata to `.memoria/`.
5. Re-running the command on the same root triggers re-initialization with conflict resolution.
6. Re-running on a *different* root in a multi-root workspace automatically deletes `.memoria/` from the old root first.

## UX Goals
- **Zero-config**: Works immediately after install; no settings required.
- **Non-destructive**: Modified files are never silently overwritten; user gets per-file overwrite prompts.
- **Discoverable**: Commands appear in the Command Palette; `toggleDotFolders` only shows when workspace is initialized.
