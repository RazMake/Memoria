# Toggle dot-folders

**Command:** `Memoria: Toggle dot-folders`  
**Available:** After workspace is initialized

Hides or shows dot-folders (directories starting with `.`) in the VS Code Explorer. This is useful for keeping configuration folders like `.memoria/` out of sight during normal use.

- **First run** (no dot-folders hidden): Scans for all dot-folders at the workspace root and hides them all at once
- **Subsequent runs** (some already hidden): Opens a multi-select picker where you can control visibility per folder — checked items are hidden, unchecked items are visible

Memoria tracks which exclusions it owns in `.memoria/dotfolders.json`, so it never interferes with your own `files.exclude` entries.

---

[⬅️ **Back** to Commands](index.md) 💠 [Getting Started](../getting-started.md) 💠 [FAQ](../faq.md)
