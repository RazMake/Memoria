# task-collector.json

Runtime configuration for the [Task Collector](../features/task-collector.md) feature.

## Location

`.memoria/task-collector.json`

## Structure

```json
{
  "completedRetentionDays": 7,
  "syncOnStartup": true,
  "include": ["**/*.md"],
  "exclude": ["**/node_modules/**", "**/.git/**", "**/.memoria/**"],
  "debounceMs": 300
}
```

## Fields

| Field | Default | Description |
|-------|---------|-------------|
| `completedRetentionDays` | `7` | Number of days to keep a completed task in the collector before pruning it. When pruned, the source line is rewritten to `- **Done**: <body>` so it is never re-ingested. |
| `syncOnStartup` | `true` | If `true`, a full workspace sync runs in the background when VS Code starts. |
| `include` | `["**/*.md"]` | Glob patterns for Markdown files to scan. |
| `exclude` | `["**/node_modules/**", "**/.git/**", "**/.memoria/**"]` | Glob patterns for files to skip. |
| `debounceMs` | `300` | Debounce window in milliseconds applied to rapid consecutive saves before enqueueing a sync job. |

> **Note:** The collector file itself and `WorkspaceInitializationBackups/` are always excluded by the engine, regardless of the `include`/`exclude` patterns above.

## When is it updated?

- **Created** during initialization if the blueprint includes a `taskCollector` feature entry.
- **Edited by you** to adjust retention or scan patterns — changes are applied on the next sync.

The **collector file path** is not stored here. It is managed by the blueprint manifest (`.memoria/blueprint.json`) and cannot be changed without re-initializing with a different blueprint.

---

[⬅️ **Back** to Configuration](index.md) 💠 [Getting Started](../getting-started.md) 💠 [FAQ](../faq.md)
