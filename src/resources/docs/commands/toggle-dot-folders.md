# Toggle dot-folders

**Command:** `Memoria: Toggle dot-folders`
**Available:** After workspace is initialized

Hides or shows dot-folders (directories starting with `.`) in the VS Code Explorer. This is useful for keeping configuration folders like `.memoria/` out of sight during normal use.

- **Hide:** Adds dot-folders to the workspace `files.exclude` setting
- **Show:** Removes only the entries that Memoria previously added

Memoria tracks which exclusions it owns in `.memoria/dotfolders.json`, so it never interferes with your own `files.exclude` entries.

![Toggle dot-folders](../media/toggle-dot-folders.gif)

---

[← Back to All Commands](index.md) · [Getting Started](../getting-started.md)
