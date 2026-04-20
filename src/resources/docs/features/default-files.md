# Default Files

Default files are pre-configured files that open when you use the **Open default file(s)** Explorer context-menu entry. They provide quick access to the files you use most in each folder.

## How it works

Each blueprint defines which folders have default files. When you right-click a folder in the Explorer and select **Open default file(s)**, the configured files for that folder open in the editor.

1. **Right-click** a folder in the Explorer
2. Select **Open default file(s)**
3. The default files open according to the folder's configuration

> The context menu item only appears on folders that have default files configured.

## Configuration

Default files are set up by the blueprint during initialization and stored in `.memoria/default-files.json`. Each folder maps to a configuration object:

```json
{
  "defaultFiles": {
    "00-ToDo/": {
      "filesToOpen": ["Main.todo"],
      "closeCurrentlyOpenedFilesFirst": true,
      "openSideBySide": true
    }
  }
}
```

### Entry properties

| Property | Type | Default | Description |
|---|---|---|---|
| `filesToOpen` | `string[]` | _(required)_ | File paths to open |
| `closeCurrentlyOpenedFilesFirst` | `boolean` | `true` | Close all open editors before opening the files. Set to `false` to add the files alongside existing editors |
| `openSideBySide` | `boolean` | `true` | Open each file in its own editor column. Set to `false` to open all files as tabs in the active group |

When editing this file, Memoria provides **auto-completion** for folder paths, entry property keys, and file names within those folders.

Changes to `default-files.json` are picked up **live** — the context menu updates without reloading VS Code.

### Opening files from another root

In a multi-root workspace, you can open files from a **different root** by prefixing the file path with the target root's folder name:

```json
{
  "defaultFiles": {
    "00-ToDo/": {
      "filesToOpen": [
        "Main.todo",
        "ProjectB/00-Notes/Index.md"
      ]
    }
  }
}
```

Here, `Main.todo` is resolved relative to the right-clicked folder as usual, while `ProjectB/00-Notes/Index.md` is resolved from the `ProjectB` workspace root — regardless of which folder was clicked. Auto-completion in `default-files.json` suggests root names as a prefix to help you discover and build these paths.

> **Note:** When `closeCurrentlyOpenedFilesFirst` is `true` (the default), this command closes all currently open editors before opening the files. You will be prompted to save any unsaved work first. Set it to `false` to keep existing editors open.

## Troubleshooting

- **"Open default file(s)" missing from context menu?** The menu item only appears when you right-click a **folder** (not a file) that has default files configured, and at least one of those files exists on disk
- **Files not opening?** Check that the files listed in `.memoria/default-files.json` actually exist in the folder

---

[⬅️ **Back** to Features](index.md) 💠 [Getting Started](../getting-started.md) 💠 [FAQ](../faq.md)
