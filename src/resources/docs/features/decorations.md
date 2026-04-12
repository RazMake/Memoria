# Explorer Decorations

Adds color-coded badges and labels to folders in the VS Code file explorer. These visual cues help you quickly identify folder purposes at a glance.

## How it works

Each blueprint defines decoration rules that map folders to colors, badges, and tooltips. The rules use VS Code theme colors (e.g., `charts.yellow`, `charts.blue`) so they adapt to your current theme.

Some decorations **propagate** to child items — for example, a decoration on `00-ToDo/` applies to all files and subfolders inside it.

## Toggling

1. Open the Command Palette (`Ctrl+Shift+P`)
2. Run **Memoria: Manage features**
3. Check or uncheck **Explorer Decorations**

Changes take effect immediately — no restart required.

## Troubleshooting

- **Badges/colors not showing?** Make sure the feature is enabled via **Memoria: Manage features**
- **Wrong colors?** Decoration rules come from the blueprint — they cannot be customized outside of blueprint definitions
- **Still not working?** Try reloading VS Code (`Ctrl+Shift+P` → **Developer: Reload Window**)

---

[← Back to Getting Started](../getting-started.md) · [Commands](../commands/index.md) · [All Blueprints](../blueprints/index.md)
