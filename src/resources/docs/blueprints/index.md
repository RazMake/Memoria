# Blueprints

**Memoria** extension is shipping with a number of packages (_called **blueprints**_). Each blueprint encapsulates content helpful for a specific type of notebook (or user scenario).

When the user '_initializes_' a workspace (_by running [`Memoria: Initialize workspace`](../commands/initialize-workspace.md) command_), the folder structure is adjusted to match the blueprint and additional content gets deployed in the workspace (_like sample files, specialized features, etc._)

## Available Blueprints
In version `0.0.1` of Memoria, the following blueprints are available:

| Blueprint | Description |
|-----------|-------------|
| [Individual Contributor Notebook](individual-contributor.md) | A notebook/personal knowledge base for developers and PMs |
| [People Manager Notebook](people-manager.md) | For managers: meeting notes, 1:1s, team contacts, planning tools, and a personal knowledge base |

## How Blueprints Work

When you initialize a workspace with a blueprint:

1. **Folders** are created in your workspace root
2. **Default files** are copied from the blueprint template into the respective folders
3. **Features** are enabled according to the blueprint
4. **Configuration** is saved to [`.memoria`](configuration/index.md)  folder: files that drive the extension's behavior (_blueprint info, feature toggles, decoration rules, and more_), which is interesting for users that want to _**further customize**_ their notebook

## Blueprint Updates

**Memoria** checks for blueprint version updates when VS Code starts. If a newer version of your blueprint is available, you'll be prompted to reinitialize. During reinitalization:

- New folders and files from the updated blueprint are added
- Existing files you've modified are preserved (_conflicts are resolved interactively_)
- Configuration files are updated to the new version

---

[⬅️ **Back** to Getting Started](../getting-started.md) 💠 [Commands](../commands/index.md) 💠 [Features](../features/index.md) 💠 [FAQ](../faq.md)
