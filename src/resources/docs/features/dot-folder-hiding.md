# Folder/File Visibility

The **Toggle folders/files visibility** command hides or shows entries starting with `.` (like `.memoria/`, `.gitignore`) in the VS Code Explorer. This keeps configuration folders and files out of sight during normal use.

## How it works

- **First run** (nothing hidden): Scans for all dot-folders and dot-files at the workspace root and hides them all at once
- **Subsequent runs** (some already hidden): Opens a multi-select picker where you can control visibility per entry — checked items are hidden, unchecked items are visible

Memoria tracks which exclusions it owns in `.memoria/dotfolders.json`, so it never interferes with your own `files.exclude` entries.

## Adding custom entries

You can add **any file or folder at any path** to the managed list by editing `.memoria/dotfolders.json` directly. For example, to also hide a `build/` folder and `notes.txt`:

```json
{
  "managedEntries": [
    ".memoria",
    ".vscode",
    ".gitignore",
    "build",
    "notes.txt"
  ]
}
```

Once added, these entries will appear in the multi-select picker the next time you run the command.

## Usage

1. Open the Command Palette (`Ctrl+Shift+P`)
2. Run **Memoria: Toggle folders/files visibility**
3. On first run, all dot-entries are hidden. On subsequent runs, use the picker to choose which entries to hide or show

> This command is available after the workspace is initialized.

## Troubleshooting

- **Command not showing?** Make sure you've initialized the workspace first with **Memoria: Initialize workspace**
- **Some entries still visible?** Auto-discovery only finds dot-entries at the workspace root. To manage entries at deeper paths, add them manually to `.memoria/dotfolders.json`

---

[⬅️ **Back** to Features](index.md) 💠 [Getting Started](../getting-started.md) 💠 [FAQ](../faq.md)
