# Features

**Memoria** includes features that enhance the workspace experience. Some are toggleable via [`Memoria: Manage features`](../commands/manage-features.md), while others are always on.

## Toggleable Features

Use the **Manage features** command to enable or disable these. Which features are enabled by default depends on the blueprint you chose — see the individual [blueprint](../blueprints/index.md) pages for details.

| Feature | Description |
|---------|-------------|
| [Explorer decorations](decorations.md) | Provides customization for the folder/file colors and badges in the Explorer panel |
| [Contacts](contacts.md) | Adds a sidebar for browsing, searching, and managing contacts stored in the blueprint-owned people folder |
| [Task Collector](task-collector.md) | Aggregates all Markdown tasks across workspace files into a single collector file and keeps them in two-way sync |

## Built-in (Always On)

These features are always active once the workspace is initialized. They do not appear in `features.json` and cannot be disabled.

| Feature | Description |
|---------|-------------|
| [Open default file(s)](default-files.md) | Adds a custom entry in the right-click menu of the Explorer panel, which will open multiple files at once side by side |
| [Dot-Folder hiding](dot-folder-hiding.md) | Hide `.memoria/` and other dot-folders from the Explorer |

## Packaged AI Instructions

Both blueprints deploy a set of AI instruction files (an agent and several prompts) to `.github/` in your workspace. These leverage the WorkIQ MCP server to help you initialize and maintain your notebook with real organization data.

| File | Type | Description |
|------|------|-------------|
| [WorkIQ agent](ai-instructions.md#agent-workiq) | Agent | Custom AI agent for querying organization data via WorkIQ |
| [Install WorkIQ MCP Server](ai-instructions.md#prompt-install-workiq-mcp-server) | Prompt | Sets up the WorkIQ MCP server at workspace level |
| [Initialize Contacts](ai-instructions.md#prompt-initialize-contacts) | Prompt | Populates contact files with real org members |
| [Initialize Career Data Types](ai-instructions.md#prompt-initialize-career-data-types) | Prompt | Syncs career levels and paths from org data |

See [Packaged AI Instructions](ai-instructions.md) for full details.

---

[⬅️ **Back** to Getting Started](../getting-started.md) 💠 [Blueprints](../blueprints/index.md) 💠 [Commands](../commands/index.md) 💠 [FAQ](../faq.md)
