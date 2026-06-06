# dotfolders.json

Tracks which `files.exclude` entries Memoria manages, so it can cleanly toggle folder and file visibility without interfering with your own exclusions.

## Location

`.memoria/dotfolders.json`

## Structure

```json
{
  "managedEntries": [
    ".memoria",
    ".vscode",
    ".gitignore"
  ]
}
```

## Fields

| Field | Description |
|-------|-------------|
| `managedEntries` | Array of folder/file names (or paths) that Memoria manages in `files.exclude`. You can add any file or folder at any path — not just dot-entries at the root. |

## How it works

When you run **Toggle folders/files visibility**:

- **Hiding:** Memoria scans the workspace root for entries starting with `.` (both folders and files), adds them to the workspace `files.exclude` setting, and records their names here
- **Showing:** Memoria removes only the entries listed in `managedEntries` from `files.exclude`, leaving your own exclusions untouched
- **Custom entries:** You can manually add any path (e.g. `build`, `temp/scratch.txt`) to `managedEntries` — they will appear in the picker on the next run

## When is it updated?

- **Created** the first time you run **Toggle folders/files visibility** to hide entries
- **Updated** each time you toggle visibility

---

[⬅️ **Back** to Configuration](index.md) 💠 [Getting Started](../getting-started.md) 💠 [FAQ](../faq.md)
