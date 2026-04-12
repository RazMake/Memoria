# decorations.json

Defines the Explorer decoration rules — badges, colors, and tooltips applied to folders in the VS Code file explorer.

## Location

`.memoria/decorations.json`

## Structure

```json
{
  "rules": [
    {
      "filter": "00-ToDo/",
      "color": "charts.yellow",
      "badge": "TD",
      "tooltip": "Active tasks",
      "propagate": true
    },
    {
      "filter": "04-Archive/",
      "color": "charts.grey",
      "tooltip": "Archived items"
    }
  ]
}
```

## Fields

| Field | Description |
|-------|-------------|
| `rules[].filter` | Folder path pattern to match |
| `rules[].color` | VS Code theme color ID (e.g., `charts.yellow`, `charts.blue`) |
| `rules[].badge` | Short text badge shown next to the folder name (max 2 characters) |
| `rules[].tooltip` | Hover tooltip text |
| `rules[].propagate` | If `true`, the decoration applies to all children of the matched folder |

## When is it updated?

- **Created** during initialization based on the blueprint's feature rules
- **Updated** when you accept a blueprint update that changes decoration rules

---

[← All configuration files](index.md)
