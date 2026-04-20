# Default Files

Default files are pre-configured files that open when you use the **Open default file(s)** Explorer context-menu entry. They provide quick access to the files you use most in each folder.

## How it works

Each blueprint defines which folders have default files. When you right-click a folder in the Explorer and select **Open default file(s)**, all configured files for that folder open side by side in the editor.

1. **Right-click** a folder in the Explorer
2. Select **Open default file(s)**
3. All current editors are closed and the default files open side by side

> The context menu item only appears on folders that have default files configured.

## Configuration

Default files are set up by the blueprint during initialization and stored in `.memoria/default-files.json`. The format maps folder paths to arrays of file paths:

```json
{
  "00-ToDo/": ["Main.todo"]
}
```

When editing this file, Memoria provides **auto-completion** for folder paths (relative and root-prefixed) and file names within those folders.

Changes to `default-files.json` are picked up **live** — the context menu updates without reloading VS Code.

### Opening files from another root

In a multi-root workspace, you can open files from a **different root** by prefixing the file path with the target root's folder name:

```json
{
  "00-ToDo/": [
    "Main.todo",
    "ProjectB/00-Notes/Index.md"
  ]
}
```

Here, `Main.todo` is resolved relative to the right-clicked folder as usual, while `ProjectB/00-Notes/Index.md` is resolved from the `ProjectB` workspace root — regardless of which folder was clicked. Auto-completion in `default-files.json` suggests root names as a prefix to help you discover and build these paths.

> **Warning:** Using this command closes all currently open editors before opening the default files side by side. Make sure to save any unsaved work first.

## Troubleshooting

- **"Open default file(s)" missing from context menu?** The menu item only appears when you right-click a **folder** (not a file) that has default files configured, and at least one of those files exists on disk
- **Files not opening?** Check that the files listed in `.memoria/default-files.json` actually exist in the folder

---

[⬅️ **Back** to Features](index.md) 💠 [Getting Started](../getting-started.md) 💠 [FAQ](../faq.md)
