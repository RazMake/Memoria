# Sync Tasks

**Command:** `Memoria: Sync Tasks`  
**Available:** After workspace is initialized (requires Task Collector feature to be enabled)

Triggers a full workspace sync of the [Task Collector](../features/task-collector.md) feature — scanning all included Markdown files and reconciling their tasks with the collector file.

## When to use

Sync runs automatically on every file **save**, so manual triggering is rarely needed. Use this command when:

- You want to force an immediate sync without saving a file.
- You disabled sync-on-startup and want to refresh after opening VS Code.
- You suspect the collector is out of date (e.g. after a large batch of changes).

## Usage

1. Open the Command Palette (`Ctrl+Shift+P`)
2. Run **Memoria: Sync Tasks**

A progress indication is shown while the sync runs. If the Task Collector is not enabled for the current workspace, an error message is shown instead.

---

[⬅️ **Back** to Commands](index.md) 💠 [Getting Started](../getting-started.md) 💠 [Task Collector](../features/task-collector.md) 💠 [FAQ](../faq.md)
