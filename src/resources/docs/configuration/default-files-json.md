# default-files.json

Maps folder paths to lists of default files that open when you use the **Open default file(s)** context menu.

## Location

`.memoria/default-files.json`

## Structure

```json
{
  "defaultFiles": {
    "00-ToDo/": ["Main.todo"],
    "ProjectA/00-ToDo/": ["Main.todo", "notes.md"]
  }
}
```

## Keys

Folder paths can be either:

- **Relative** (e.g., `"00-ToDo/"`) — matches the folder in any workspace root
- **Root-prefixed** (e.g., `"ProjectA/00-ToDo/"`) — matches only in the named workspace root. Takes priority over relative keys for the same folder

## Values

Each value is an array of file names relative to the matched folder (not the workspace root).

## When is it updated?

- **Created** during initialization based on the blueprint's folder definitions
- **Updated** when you accept a blueprint update that changes default file mappings

---

[⬅️ **Back** to Configuration](index.md) 💠 [Getting Started](../getting-started.md) 💠 [FAQ](../faq.md)
