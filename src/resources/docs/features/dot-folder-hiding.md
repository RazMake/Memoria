# Dot-Folder Hiding

The **Toggle dot-folders** command hides or shows directories starting with `.` (like `.memoria/`) in the VS Code Explorer. This keeps configuration folders out of sight during normal use.

## How it works

- **Hide:** Adds dot-folders to the workspace `files.exclude` setting
- **Show:** Removes only the entries that Memoria previously added

Memoria tracks which exclusions it owns in `.memoria/dotfolders.json`, so it never interferes with your own `files.exclude` entries.

## Usage

1. Open the Command Palette (`Ctrl+Shift+P`)
2. Run **Memoria: Toggle dot-folders**
3. Run the command again to show the folders

> This command is available after the workspace is initialized.

## Troubleshooting

- **Command not showing?** Make sure you've initialized the workspace first with **Memoria: Initialize workspace**
- **Some dot-folders still visible?** Only dot-folders at the workspace root are toggled

---

[← Back to Getting Started](../getting-started.md) · [Commands](../commands/index.md) · [All Blueprints](../blueprints/index.md)
