# FAQ & Troubleshooting

## General

### Where does Memoria store its configuration?

All configuration lives in the `.memoria/` folder at your workspace root. See the [Configuration reference](configuration/index.md) for a detailed description of each file.

### Can I use Memoria in a multi-root workspace?

Yes. Memoria supports multi-root workspaces. The `.memoria/` configuration folder lives in one root, and the scaffolded folders are created across your workspace roots as defined by the blueprint.

### Will Memoria modify files I've already created?

No. During initialization, Memoria only creates folders and files that don't already exist. During reinitialization (blueprint update), all blueprint files are written fresh, but your modified versions are always backed up to `WorkspaceInitializationBackups/` first — and you can open a diff editor for any file you want to merge manually.

---

## Commands Not Showing

### "Toggle dot-folders" and "Manage features" are missing from the Command Palette

These commands only appear after you've initialized the workspace. Run **Memoria: Initialize workspace** first.

### "Open default file(s)" doesn't appear in the right-click menu

This menu item only appears when:
1. You right-click a **folder** (not a file)
2. The folder has default files configured in `.memoria/default-files.json`
3. At least one of the configured default files exists on disk

---

## Decorations

### Folder colors/badges are not showing

1. Make sure the workspace is initialized (`.memoria/` folder exists)
2. Run **Memoria: Manage features** and ensure **Explorer Decorations** is checked
3. Try reloading VS Code (`Ctrl+Shift+P` → **Developer: Reload Window**)

### Can I customize the decoration colors?

Decoration colors are defined in the blueprint template and use VS Code theme colors (e.g., `charts.yellow`, `charts.blue`). Custom decoration rules are not currently supported outside of blueprint definitions. See [Explorer Decorations](features/decorations.md) for details.

---

## Blueprint Updates

### Memoria says a blueprint update is available — what happens if I accept?

Memoria compares your installed blueprint version with the latest one bundled in the extension. If you accept the update, Memoria guides you through two quick steps:

1. **Extra folders** — A checklist shows folders that the new blueprint doesn't include. All are kept by default; uncheck any you want moved to `WorkspaceInitializationBackups/`.
2. **Modified files** — A checklist shows all files with conflicts (ones you edited, or new blueprint files that clash with files you created). All are overwritten — check any you want to review in a diff editor after reinit.

Every conflicting file is backed up to `WorkspaceInitializationBackups/` before being overwritten, so nothing is lost. Your configuration is updated to the new version.

### Can I skip a blueprint update?

Yes. When prompted, you can dismiss the notification. Memoria will ask again the next time VS Code starts.

---

[← Back to Getting Started](getting-started.md) · [Commands](commands/index.md) · [Blueprints](blueprints/index.md)
