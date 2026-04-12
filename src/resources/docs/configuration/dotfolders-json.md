# dotfolders.json

Tracks which `files.exclude` entries Memoria manages, so it can cleanly toggle dot-folder visibility without interfering with your own exclusions.

## Location

`.memoria/dotfolders.json`

## Structure

```json
{
  "managedEntries": [
    ".memoria",
    ".vscode"
  ]
}
```

## Fields

| Field | Description |
|-------|-------------|
| `managedEntries` | Array of dot-folder names that Memoria added to `files.exclude` |

## How it works

When you run **Toggle dot-folders**:

- **Hiding:** Memoria scans the workspace root for directories starting with `.`, adds them to the workspace `files.exclude` setting, and records their names here
- **Showing:** Memoria removes only the entries listed in `managedEntries` from `files.exclude`, leaving your own exclusions untouched

## When is it updated?

- **Created** the first time you run **Toggle dot-folders** to hide folders
- **Updated** each time you toggle visibility

---

[← All configuration files](index.md)
