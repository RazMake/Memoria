# default-files.json

Maps folder paths to default file configurations that control what opens when you use the **Open default file(s)** context menu.

## Location

`.memoria/default-files.json`

## Structure

```json
{
  "defaultFiles": {
    "00-ToDo/": {
      "filesToOpen": ["Main.todo"],
      "closeCurrentlyOpenedFilesFirst": true,
      "openSideBySide": true
    },
    "ProjectA/00-ToDo/": {
      "filesToOpen": ["Main.todo", "notes.md"]
    }
  }
}
```

## Keys

Folder paths can be either:

- **Relative** (e.g., `"00-ToDo/"`) — matches the folder in any workspace root
- **Root-prefixed** (e.g., `"ProjectA/00-ToDo/"`) — matches only in the named workspace root. Takes priority over relative keys for the same folder

## Values

Each value is an object with the following properties:

| Property | Type | Default | Description |
|---|---|---|---|
| `filesToOpen` | `string[]` | _(required)_ | Array of file paths to open |
| `closeCurrentlyOpenedFilesFirst` | `boolean` | `true` | Close all open editors before opening the files |
| `openSideBySide` | `boolean` | `true` | Open each file in its own editor column (side by side) |

### File paths

Paths in `filesToOpen` can be either:

- **Folder-relative** (e.g., `"Main.todo"`, `"sub/notes.md"`) — resolved relative to the matched folder (the default)
- **Workspace-absolute** (e.g., `"ProjectB/00-Notes/Index.md"`) — when the first segment matches a workspace root name, the file is resolved from that root, regardless of which folder triggered the command. This lets you open files from any root in a multi-root workspace.

```json
{
  "defaultFiles": {
    "00-ToDo/": {
      "filesToOpen": [
        "Main.todo",
        "ProjectB/00-Notes/Index.md"
      ],
      "closeCurrentlyOpenedFilesFirst": false,
      "openSideBySide": false
    }
  }
}
```

In the example above, right-clicking `00-ToDo/` in any root opens `Main.todo` from that folder, plus `Index.md` from `ProjectB`'s `00-Notes/` folder — without closing existing editors, and as tabs in the current group.

## When is it updated?

- **Created** during initialization based on the blueprint's folder definitions
- **Updated** when you accept a blueprint update that changes default file mappings

---

[⬅️ **Back** to Configuration](index.md) 💠 [Getting Started](../getting-started.md) 💠 [FAQ](../faq.md)
