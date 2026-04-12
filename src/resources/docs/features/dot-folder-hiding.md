# Dot-Folder Hiding

The **Toggle dot-folders** command hides or shows directories starting with `.` (like `.memoria/`) in the VS Code Explorer. This keeps configuration folders out of sight during normal use.

## How it works

- **First run** (no dot-folders hidden): Scans for all dot-folders at the workspace root and hides them all at once
- **Subsequent runs** (some already hidden): Opens a multi-select picker where you can control visibility per folder — checked items are hidden, unchecked items are visible

Memoria tracks which exclusions it owns in `.memoria/dotfolders.json`, so it never interferes with your own `files.exclude` entries.

## Usage

1. Open the Command Palette (`Ctrl+Shift+P`)
2. Run **Memoria: Toggle dot-folders**
3. On first run, all dot-folders are hidden. On subsequent runs, use the picker to choose which folders to hide or show

> This command is available after the workspace is initialized.

## Troubleshooting

- **Command not showing?** Make sure you've initialized the workspace first with **Memoria: Initialize workspace**
- **Some dot-folders still visible?** Only dot-folders at the workspace root are toggled

---

[⬅️ **Back** to Features](index.md) 💠 [Getting Started](../getting-started.md) 💠 [FAQ](../faq.md)
