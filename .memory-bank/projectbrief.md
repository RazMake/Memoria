# Project Brief — Memoria

## What
A VS Code extension that scaffolds a **personal knowledge base** inside a workspace — organizing notes, meetings, contacts, and TODOs with optional Copilot integration.

## Core Requirements
1. **Blueprint-driven scaffolding** — Users select a blueprint (template) that defines the folder/file structure and decoration rules.
2. **Two bundled blueprints** — "Individual Contributor" (5 folders) and "People Manager" (6 folders with nested meeting note categories).
3. **Re-initialization** — Users can switch blueprints or re-apply the same blueprint with conflict resolution (folder cleanup, per-file overwrite prompts).
4. **Single-root enforcement** — In multi-root workspaces, only one root may have `.memoria/` at a time; initializing a different root deletes the old root's `.memoria/`.
5. **Dot-folder toggling** — Hide/show dot-prefixed folders in the Explorer via `files.exclude`.
6. **Telemetry** — Events for `blueprint.init`, `blueprint.reinit`, `dotfolders.toggle`.

## Non-Goals (current scope)
- No custom user-authored blueprints (only bundled ones)
- No cloud sync or multi-device support
- No integration with external tools or APIs

## Target Users
- **Individual contributors** (developers, PMs) — structured personal notebook
- **People managers** — 1:1 meeting notes, team contacts, status tracking
