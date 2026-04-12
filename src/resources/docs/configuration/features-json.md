# features.json

Stores which optional features are enabled or disabled for this workspace.

## Location

`.memoria/features.json`

## Structure

```json
{
  "features": [
    {
      "id": "decorations",
      "name": "Explorer Decorations",
      "description": "Badges and colors in the VS Code Explorer",
      "enabled": true
    }
  ]
}
```

## Fields

| Field | Description |
|-------|-------------|
| `features[].id` | Unique identifier for the feature |
| `features[].name` | Display name shown in the Manage features picker |
| `features[].description` | Short description shown in the picker |
| `features[].enabled` | Whether the feature is currently active |

## When is it updated?

- **Created** during initialization with defaults from the blueprint
- **Updated** when you toggle features via **Memoria: Manage features**

---

[⬅️ **Back** to Configuration](index.md) 💠 [Getting Started](../getting-started.md) 💠 [FAQ](../faq.md)
