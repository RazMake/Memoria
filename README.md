# Memoria

Scaffold a personal knowledge base in a workspace — organize notes, meetings, contacts, and TODOs into a structured folder layout using customizable blueprint templates.

## Features

- **Blueprint templates** — Choose a template that matches your role (Individual Contributor, People Manager) and get a ready-made folder structure
- **Explorer decorations** — Color-coded badges and labels on folders for quick visual navigation
- **Default files** — Right-click folders to open pre-configured files side by side
- **Dot-folder toggling** — Hide/show configuration folders like `.memoria/` with one command
- **Blueprint updates** — Get notified when a newer version of your blueprint is available

![Initialize workspace](src/resources/docs/media/initialize-workspace.gif)

## Commands

| Command | Description | Availability |
|---------|-------------|-------------|
| `Memoria: Initialize workspace` | Scaffolds the workspace with a structure based on the selected template | Always |
| `Memoria: Toggle dot-folders` | Hide/show dot-folders in the Explorer | After initialization |
| `Memoria: Manage features` | Enable/disable optional blueprint features | After initialization |
| `Memoria: Open default file(s)` | Open pre-configured files for a folder side by side | Folder context menu |
| `Memoria: Open User Guide` | Browse the built-in documentation | Always |

## Getting Started

1. Install Memoria from the VS Code Marketplace
2. Open the Command Palette (`Ctrl+Shift+P`) and run **Memoria: Initialize workspace**
3. Pick a blueprint template
4. Start organizing your knowledge base

## User Guide

The full documentation is bundled with the extension. Run **Memoria: Open User Guide** from the Command Palette to browse it inside VS Code.

Topics covered:
- [Getting Started](src/resources/docs/getting-started.md) — Installation and first steps
- [Commands](src/resources/docs/commands/index.md) — Detailed command reference
- [Blueprints](src/resources/docs/blueprints/index.md) — Template descriptions and folder structures
- [Explorer Decorations](src/resources/docs/features/decorations.md) — Color-coded badges and labels
- [Default Files](src/resources/docs/features/default-files.md) — Quick-open pre-configured files
- [Dot-Folder Hiding](src/resources/docs/features/dot-folder-hiding.md) — Hide configuration folders
- [Configuration Reference](src/resources/docs/configuration/index.md) — The `.memoria/` folder and its files
- [FAQ & Troubleshooting](src/resources/docs/faq.md) — Common questions and fixes
