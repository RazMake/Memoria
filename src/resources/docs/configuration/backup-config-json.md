# backup-config.json

Stores the profiles for the [Scheduled Backup](../features/backup.md) feature.

## Location

`.memoria/backup-config.json`

## Structure

```json
{
  "profiles": {
    "notebook": {
      "sources": ["**"],
      "exclude": ["**/node_modules/**", "**/.git/**"],
      "targetFolder": "C:/Users/you/OneDrive/Memoria Backups",
      "schedule": {
        "time": "18:00",
        "days": ["mon", "tue", "wed", "thu", "fri"]
      },
      "retention": 7
    }
  }
}
```

## Profile fields

| Field | Default | Description |
|-------|---------|-------------|
| `sources` | — | Workspace-relative glob patterns or folder paths to include. At least one is required. |
| `exclude` | `[]` | Glob patterns to exclude from `sources`. |
| `targetFolder` | — | Absolute filesystem path where zip archives are written. Use a cloud-synced folder (e.g. OneDrive) for off-machine durability. |
| `schedule.time` | — | Time of day in `HH:MM` (24-hour) format. |
| `schedule.days` | — | Days of the week to run: `mon`, `tue`, `wed`, `thu`, `fri`, `sat`, `sun`. |
| `retention` | `7` | Maximum number of archives to keep per profile. Oldest are deleted first. |

> A hidden `_state` object tracks the last backup time and per-file hashes used for incremental diffing. **Do not edit it manually** — it is managed by the extension.

## How it is updated

- **Created/updated** by the **Memoria: Create Backup Profile** wizard.
- **Editable by hand** — changes are picked up automatically by the scheduler via a file watcher.

The file is validated against a bundled JSON schema, so you get completions and inline errors while editing it in VS Code.

---

[⬅️ **Back** to Configuration](index.md) 💠 [Getting Started](../getting-started.md) 💠 [FAQ](../faq.md)
