---
name: publish
description: How to create VSIX publish artifacts. Packages the extension and manages artifact retention in the publish/ directory.
---

# Publish (Package)

Creates a `.vsix` package artifact in the `publish/` directory. This does **not** publish to the VS Code Marketplace — it only creates the installable artifact.

## Command

```bash
cd src
npm run package
```

This runs `vsce package --out ../publish/`, producing a file like `publish/<name>-<version>.vsix`.

## Prerequisites

- Build must succeed: `npm run build`
- `publish/` directory must exist (scaffolded with `.gitkeep`).

## Artifact Retention

After packaging, **keep only the 3 most recent VSIX files** in `publish/` (the new one + 2 previous versions). Delete all older artifacts.

To clean up manually:

```bash
# List VSIX files sorted by modification time (newest first)
ls -t publish/*.vsix

# Keep the 3 newest, delete the rest
ls -t publish/*.vsix | tail -n +4 | xargs rm -f
```

On Windows (PowerShell):

```powershell
Get-ChildItem publish\*.vsix | Sort-Object LastWriteTime -Descending | Select-Object -Skip 3 | Remove-Item
```

**AI-AGENT**: After running `npm run package`, automatically clean up old VSIX files in `publish/` to retain only the current build plus the 2 most recent previous versions. Delete all older `.vsix` files.

## VS Code Task

Use the **npm: package** task from the Command Palette (Tasks: Run Task → npm: package).

## Installing Locally

To install the packaged extension in VS Code:

```bash
code --install-extension publish/<name>-<version>.vsix
```
