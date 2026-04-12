# The `.memoria/` Configuration Folder

When you initialize a workspace, Memoria creates a `.memoria/` folder at the workspace root. This folder stores all configuration files that drive the extension's behavior.

> **Tips:** You can hide this folder from the Explorer using [`Memoria: Toggle dot-folders`](../commands/toggle-dot-folders.md).

## Files

| File | Purpose |
|------|---------|
| [blueprint.json](blueprint-json.md) | Records which blueprint template was applied
| [features.json](features-json.md) | Stores feature toggle states |
| [default-files.json](default-files-json.md) | Stores the map between folders and their list of default files (_to open from right-click menu_) |
| [decorations.json](decorations-json.md) | Defines Explorer decoration rules (_setting colors and badges for folders/files_) |
| [dotfolders.json](dotfolders-json.md) | Tracks managed `files.exclude` entries |

---

[⬅️ **Back** to Getting Started](../getting-started.md) 💠 [Blueprints](../blueprints/index.md) 💠 [Commands](../commands/index.md) 💠 [Features](../features/index.md) 💠 [FAQ](../faq.md)
