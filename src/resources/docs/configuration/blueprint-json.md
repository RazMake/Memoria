# blueprint.json

Records which blueprint template was applied to this workspace and tracks file content for conflict detection during updates.

## Location

`.memoria/blueprint.json`

## Structure

```json
{
  "blueprintId": "individual-contributor",
  "blueprintVersion": "1.0.0",
  "initializedAt": "2026-04-11T10:00:00.000Z",
  "lastReinitAt": null,
  "fileManifest": {
    "00-ToDo/Main.todo": "a1b2c3..."
  }
}
```

## Fields

| Field | Description |
|-------|-------------|
| `blueprintId` | ID of the blueprint template that was used |
| `blueprintVersion` | Version of the blueprint at the time of initialization |
| `initializedAt` | ISO timestamp of when the workspace was first initialized |
| `lastReinitAt` | ISO timestamp of the last reinitalization, or `null` if never reinitalized |
| `fileManifest` | Map of file paths to their SHA-256 content hashes — used to detect conflicts when a blueprint update is applied |

## When is it updated?

- **Created** when you run **Initialize workspace**
- **Updated** when you accept a blueprint update (version and hashes change)

---

[⬅️ **Back** to Configuration](index.md) 💠 [Getting Started](../getting-started.md) 💠 [FAQ](../faq.md)
