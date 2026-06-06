# Toggle folders/files visibility

**Command:** `Memoria: Toggle folders/files visibility`  
**Available:** After workspace is initialized

Hides or shows dot-folders and dot-files (entries starting with `.`) in the VS Code Explorer. This is useful for keeping configuration folders like `.memoria/` and files like `.gitignore` out of sight during normal use.

- **First run** (nothing hidden): Scans for all dot-entries at the workspace root and hides them all at once
- **Subsequent runs** (some already hidden): Opens a multi-select picker where you can control visibility per entry — checked items are hidden, unchecked items are visible

You can also add any file or folder at any path to the managed list by editing `.memoria/dotfolders.json` directly — see [Folder/File Visibility](../features/dot-folder-hiding.md) for details.

Memoria tracks which exclusions it owns in `.memoria/dotfolders.json`, so it never interferes with your own `files.exclude` entries.

---

[⬅️ **Back** to Commands](index.md) 💠 [Getting Started](../getting-started.md) 💠 [FAQ](../faq.md)
