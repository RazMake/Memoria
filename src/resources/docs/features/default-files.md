# Default Files

Default files are pre-configured files that open when you use the **Memoria: Open default file(s)** context menu. They provide quick access to the files you use most in each folder.

## How it works

Each blueprint defines which folders have default files. When you right-click a folder in the Explorer and select **Open default file(s)**, all configured files for that folder open side by side in the editor.

1. **Right-click** a folder in the Explorer
2. Select **Memoria: Open default file(s)**
3. All current editors are closed and the default files open side by side

> The context menu item only appears on folders that have default files configured.

## Configuration

Default files are set up by the blueprint during initialization and stored in `.memoria/default-files.json`. The format maps folder paths to arrays of file names:

```json
{
  "00-ToDo/": ["Main.todo"]
}
```

## Troubleshooting

- **"Open default file(s)" missing from context menu?** The menu item only appears when you right-click a **folder** (not a file) that has default files configured, and at least one of those files exists on disk
- **Files not opening?** Check that the files listed in `.memoria/default-files.json` actually exist in the folder

---

[← Back to Getting Started](../getting-started.md) · [Commands](../commands/index.md) · [All Blueprints](../blueprints/index.md)
