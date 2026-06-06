# Scheduled Workspace Backup

| Field     | Value                  |
| --------- | ---------------------- |
| Date      | 2026-06-06             |
| Status    | Draft                  |

---

## §1 TL;DR

A new **Scheduled Backup** feature lets users define one or more backup profiles, each specifying workspace files/folders to compress into a dated zip file on a recurring schedule. Backups are incremental — only files whose content has changed (SHA-256) since the last backup are included. Each profile controls which days of the week the backup runs, the time of day, the target folder (an absolute path outside the workspace), and how many historical backups to retain. Backup file names encode the profile name, computer name, date, and time (e.g., `docs_DESKTOP-ABC_2026-06-06_14-30-00.zip`).

Key deliverables:
- **Backup profiles** defined in `.memoria/backup-config.json` with JSON Schema for IntelliSense.
- **Scheduler** that runs while VS Code is open, with an opt-in setting to catch up missed backups on activation.
- **Retention enforcement** — old backups are pruned *before* each new backup is created.
- **Manual trigger** via command palette (`Memoria: Run Backup`).
- **Status bar** indicator during backup activity and notifications on completion/failure.
- **Command palette wizard** (`Memoria: Create Backup Profile`) for guided initial setup.

---

## §2 Terminology

| Term              | Definition                                                                                         |
| ----------------- | -------------------------------------------------------------------------------------------------- |
| **Profile**       | A named backup configuration specifying sources, target, schedule, and retention.                   |
| **Source**         | A workspace-relative glob pattern or path identifying files/folders to include in the backup.       |
| **Target folder** | An absolute filesystem path where backup zips are written.                                          |
| **Retention**     | The maximum number of previous backup zips to keep per profile in the target folder.                |
| **Hash manifest** | A per-profile map of `{ relativePath → SHA-256 }` stored inside the config file, used to detect changes. |
| **Catch-up**      | Running a missed backup on VS Code activation if the scheduled time passed while VS Code was closed.|

---

## §3 Goals / Non-goals

### Goals

1. Let users back up important workspace files on a predictable schedule without leaving VS Code.
2. Support multiple independent backup profiles (e.g., "daily notes" vs. "weekly config").
3. Only include files that actually changed since the last successful backup (content-hash based).
4. Provide clear feedback: status bar indicator, completion/failure notifications, output channel logging.
5. Allow manual backup triggers outside the schedule.
6. Enforce retention limits automatically, pruning old backups *before* creating new ones.
7. Provide a command palette wizard for quick profile creation.

### Non-goals

- **Restore / unzip** — this feature creates backups; restoring is a manual operation.
- **Syncing to cloud** — no integration with OneDrive, Google Drive, S3, etc.
- **Backing up files outside the workspace** — sources must be workspace-relative.
- **Differential / incremental archive format** — each backup zip is self-contained (contains all changed files, not deltas).
- **File size limits** — no per-file size cap; users are responsible for their source selections.
- **Encryption** — zip files are unencrypted.
- **Real-time / continuous backup** — backups run on a schedule or manually, not on every save.

---

## §4 Data Model

### §4.1 Configuration file: `.memoria/backup-config.json`

```jsonc
{
  "$schema": "./backup-config.schema.json",
  "profiles": {
    "daily-notes": {
      "sources": [
        "Notes/**/*.md",
        "Journal/"
      ],
      "exclude": [
        "**/node_modules/**",
        "**/.git/**",
        "**/.*"
      ],
      "targetFolder": "D:\\Backups\\Memoria",
      "schedule": {
        "time": "18:00",
        "days": ["mon", "tue", "wed", "thu", "fri"]
      },
      "retention": 7
    },
    "weekly-config": {
      "sources": [
        ".memoria/",
        ".vscode/"
      ],
      "exclude": [],
      "targetFolder": "D:\\Backups\\Memoria",
      "schedule": {
        "time": "09:00",
        "days": ["sun"]
      },
      "retention": 4
    }
  },
  "_state": {
    "daily-notes": {
      "lastBackupTime": "2026-06-05T18:00:12.345Z",
      "hashes": {
        "Notes/meeting-notes.md": "a1b2c3d4...",
        "Journal/2026-06-05.md": "e5f6a7b8..."
      }
    },
    "weekly-config": {
      "lastBackupTime": "2026-06-01T09:00:05.678Z",
      "hashes": {
        ".memoria/blueprint.json": "c9d0e1f2..."
      }
    }
  }
}
```

### §4.2 TypeScript types

```typescript
interface BackupConfig {
  profiles: Record<string, BackupProfile>;
  _state: Record<string, BackupProfileState>;
}

interface BackupProfile {
  /** Workspace-relative glob patterns or folder paths to include. */
  sources: string[];
  /** Glob patterns to exclude from sources. */
  exclude: string[];
  /** Absolute path to the folder where zip files are written. */
  targetFolder: string;
  /** Schedule definition. */
  schedule: BackupSchedule;
  /** Max number of old backups to keep. Oldest are deleted first. */
  retention: number;
}

interface BackupSchedule {
  /** Time of day in HH:MM (24-hour) format. */
  time: string;
  /** Days of the week the backup runs. */
  days: DayOfWeek[];
}

type DayOfWeek = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

interface BackupProfileState {
  /** ISO 8601 timestamp of last successful backup. */
  lastBackupTime: string | null;
  /** Map of workspace-relative path → SHA-256 hex digest from last backup. */
  hashes: Record<string, string>;
}
```

### §4.3 Backup zip file name

Format: `{profileName}_{computerName}_{date}_{time}.zip`

Example: `daily-notes_DESKTOP-ABC_2026-06-06_18-00-00.zip`

- **profileName**: sanitized (alphanumeric + hyphens) from the profile key.
- **computerName**: `os.hostname()`.
- **date**: `YYYY-MM-DD`.
- **time**: `HH-MM-SS`.

### §4.4 Zip internal structure

Files preserve their workspace-relative paths inside the zip:

```
daily-notes_DESKTOP-ABC_2026-06-06_18-00-00.zip
├── Notes/
│   └── meeting-notes.md
└── Journal/
    └── 2026-06-05.md
```

---

## §5 User-Visible Behavior

### §5.1 Feature registration

The backup feature registers with `FeatureManager` under the ID `"backup"`. It is toggled via `.memoria/features.json` like all other features.

When enabled:
- The scheduler starts, computing the next backup time for each profile.
- The status bar item appears (idle state).

When disabled:
- All timers are cancelled.
- The status bar item is removed.

### §5.2 Configuration editing

The config file `.memoria/backup-config.json` ships with a JSON Schema (`backup-config.schema.json`) embedded in the extension's resources. The schema is associated via the `$schema` property, providing:
- IntelliSense for all fields.
- Validation for `time` format, `days` values, positive `retention`, etc.

### §5.3 Command palette wizard

**Command: `Memoria: Create Backup Profile`**
- Prompts sequentially via `vscode.window` quick picks and input boxes:
  1. **Profile name** — text input, validated for uniqueness and filename-safe characters.
  2. **Source paths** — multi-select quick pick of workspace folders + option to type custom globs.
  3. **Exclusion patterns** — multi-select from common presets (`node_modules`, `.git`, etc.) + custom entry.
  4. **Target folder** — folder picker dialog (`vscode.window.showOpenDialog`).
  5. **Schedule time** — text input in `HH:MM` format.
  6. **Schedule days** — multi-select quick pick of weekdays.
  7. **Retention count** — text input, validated as positive integer.
- Writes the profile to `.memoria/backup-config.json`, creating the file if absent.

### §5.4 Manual backup

**Command: `Memoria: Run Backup`**
- If one profile exists, runs it immediately.
- If multiple profiles exist, shows a quick pick to select one (or "All profiles").
- Runs sequentially if multiple profiles are selected.
- Shows progress notification with cancel support.

### §5.5 Status bar

| State       | Icon                | Text                          | Tooltip                                  |
| ----------- | ------------------- | ----------------------------- | ---------------------------------------- |
| Idle        | `$(file-zip)`       | `Backup: Idle`                | `Next: daily-notes at 18:00`             |
| In progress | `$(sync~spin)`      | `Backup: Running…`           | `Backing up daily-notes (3/12 files)`    |
| Completed   | `$(check)`          | `Backup: Done`                | `daily-notes completed (12 files, 1.2 MB)` — reverts to Idle after 10s |
| Skipped     | `$(dash)`           | `Backup: No changes`         | `daily-notes: no files changed` — reverts to Idle after 10s |
| Failed      | `$(error)`          | `Backup: Failed`             | `daily-notes failed: target folder not found` |

### §5.6 Notifications

- **On success**: Information notification: *"Backup 'daily-notes' completed: 12 files (1.2 MB)"*
- **On skip**: Information notification: *"Backup 'daily-notes' skipped: no files changed since last backup"*
- **On failure**: Error notification: *"Backup 'daily-notes' failed: {reason}"* with a "Show Output" action button.

### §5.7 Output channel

A dedicated `Memoria: Backup` output channel logs detailed information:
```
[2026-06-06 18:00:00] Starting backup: daily-notes
[2026-06-06 18:00:00] Scanning sources: Notes/**/*.md, Journal/
[2026-06-06 18:00:01] Found 45 files, 12 changed since last backup
[2026-06-06 18:00:01] Pruning old backups: removing 1 of 8 (retention=7)
[2026-06-06 18:00:01]   Deleted: daily-notes_DESKTOP-ABC_2026-05-28_18-00-00.zip
[2026-06-06 18:00:02] Created: D:\Backups\Memoria\daily-notes_DESKTOP-ABC_2026-06-06_18-00-00.zip (1.2 MB)
[2026-06-06 18:00:02] Hash manifest updated for 12 files
[2026-06-06 18:00:02] Backup complete: daily-notes
```

### §5.8 Catch-up on activation

A setting `memoria.backup.catchUpOnStart` (default: `false`) controls whether missed backups run on VS Code activation:

- On activation, the scheduler checks each profile's `lastBackupTime` and schedule.
- If a scheduled backup was missed (the most recent scheduled time is in the past and after `lastBackupTime`), it queues the profile for immediate execution.
- Multiple catch-up backups run sequentially.
- Only the most recent missed occurrence runs — not all missed occurrences.

---

## §6 Architecture & Implementation

### §6.1 File layout

```
src/features/backup/
├── backupFeature.ts           ← Main orchestrator (implements vscode.Disposable)
├── backupScheduler.ts         ← Timer management, next-run calculation
├── backupExecutor.ts          ← Core logic: scan → hash → zip → prune
├── backupConfigManager.ts     ← Read/write backup-config.json, schema validation
├── hashManager.ts             ← SHA-256 computation, manifest comparison
├── zipCreator.ts              ← Zip file creation (using yazl or archiver)
├── retentionManager.ts        ← Old backup pruning logic
├── types.ts                   ← Type definitions
└── backupStatusBar.ts         ← Status bar item management

src/commands/
└── backupCommands.ts          ← createBackupProfile + runBackup + backupHistory command creators

src/resources/
└── schemas/
    └── backup-config.schema.json
```

### §6.2 Scheduler logic

```
┌─────────────────────────────────────────────────────────────┐
│                     BackupScheduler                         │
│                                                             │
│  For each profile:                                          │
│    1. Compute next occurrence from schedule + lastBackupTime│
│    2. Set setTimeout for (nextOccurrence - now)             │
│    3. On trigger:                                           │
│       a. Queue execution in sequential queue                │
│       b. Recompute next occurrence after execution          │
│       c. Set next setTimeout                                │
│                                                             │
│  Handles:                                                   │
│    - Config file changes (re-read, re-schedule)             │
│    - Feature disable (cancel all timers)                    │
│    - VS Code sleep/wake (recalculate on resume)             │
└─────────────────────────────────────────────────────────────┘
```

**Timer precision**: `setTimeout` is adequate for this use case. On system wake from sleep, timers fire immediately if their deadline has passed. The scheduler should also listen to config changes and re-evaluate timers.

**Day-of-week + time calculation**:
1. Start from `now`.
2. Find the next day in `schedule.days` that is >= today.
3. If today is a scheduled day and `time` hasn't passed yet, schedule for today at `time`.
4. Otherwise advance to the next matching day.
5. Result is an absolute `Date` object.

### §6.3 Backup execution flow

```
┌──────────────────────────────────────────────────────────────────┐
│                      Backup Execution                            │
│                                                                  │
│  1. Read config for profile                                      │
│  2. Resolve source globs → file list (workspace.findFiles)       │
│  3. Apply exclusion patterns                                     │
│  4. For each file:                                               │
│     a. Compute SHA-256 of file content                           │
│     b. Compare against stored hash in _state                     │
│     c. Mark as changed / unchanged                               │
│  5. If no files changed → skip, notify, return                   │
│  6. Prune old backups (enforce retention BEFORE writing new one)  │
│  7. Create zip from changed files, preserving relative paths     │
│  8. Write zip to targetFolder with formatted name                │
│  9. Update _state.hashes with new hashes for ALL source files    │
│ 10. Update _state.lastBackupTime                                 │
│ 11. Write updated config back to disk                            │
│ 12. Notify user, update status bar                               │
└──────────────────────────────────────────────────────────────────┘
```

**Important**: Step 9 stores hashes for *all* current source files, not just the changed ones. This ensures that if a file is unchanged across multiple backups, it is correctly excluded each time.

### §6.4 Hash computation

```typescript
async function computeFileHash(uri: vscode.Uri): Promise<string> {
  const content = await vscode.workspace.fs.readFile(uri);
  const hash = crypto.createHash("sha256");
  hash.update(content);
  return hash.digest("hex");
}
```

For performance, files are hashed sequentially to avoid excessive memory pressure. The hash manifest is a flat `Record<string, string>` keyed by workspace-relative POSIX paths.

### §6.5 Retention management

Before creating a new backup:
1. List all `.zip` files in `targetFolder` matching the pattern `{profileName}_*.zip`.
2. Sort by filename (which is chronologically sortable due to the date-time format).
3. If `count >= retention`, delete the oldest `count - retention + 1` files.
4. Then write the new backup.

This ensures the new backup + existing backups ≤ `retention`.

### §6.6 Zip library

Use **`yazl`** (v3.3.x). It has 1 dependency (`buffer-crc32`), streams output without buffering entire files in RAM, and adds ~40 KB to the bundle.

`archiver` was considered but rejected: it pulls in 9 dependencies (~200+ KB), includes TAR support we don't need, and its high-level helpers (`directory()`, `glob()`) are redundant since we already resolve files via `workspace.findFiles()` and read content via `vscode.workspace.fs.readFile()`. Its built-in `progress` and `warning` events are trivially replicated with per-file try/catch and manual counting.

**Install**: `npm install yazl` + `npm install -D @types/yazl`.

Usage pattern:
```typescript
const zipfile = new yazl.ZipFile();
for (const file of changedFiles) {
  zipfile.addBuffer(content, file.relativePosixPath);
}
zipfile.end();
zipfile.outputStream.pipe(fs.createWriteStream(targetPath));
```

### §6.7 Error handling

| Error                              | Handling                                                        |
| ---------------------------------- | --------------------------------------------------------------- |
| Target folder doesn't exist        | Attempt `mkdir -p`. If that fails, show error notification.     |
| Target folder not writable         | Error notification + log.                                       |
| Source glob matches no files       | Treat as "no changes" → skip.                                   |
| File read error during hash/zip    | Log warning, skip the file, continue with remaining files.      |
| Config file corrupt/invalid        | Error notification with "Open Config" action. Don't schedule.   |
| Zip write fails                    | Error notification + log. Don't update hashes or lastBackupTime.|
| Retention delete fails             | Log warning, continue with backup creation.                     |

### §6.8 Telemetry events

| Event                              | Properties                                                 |
| ---------------------------------- | ---------------------------------------------------------- |
| `backup/executed`                  | `profileCount`, `changedFiles`, `totalFiles`, `zipSizeBytes`, `durationMs` |
| `backup/skipped`                   | `profileName`, `reason: "noChanges"` |
| `backup/failed`                    | `profileName`, `errorType`                                 |
| `backup/profileCreated`            | `sourceCount`, `dayCount`, `retention`                     |
| `backup/catchUpTriggered`          | `profileCount`                                             |

---

## §7 Blueprint integration

### §7.1 Feature entry

Add a new variant to the `BlueprintFeature` discriminated union:

```typescript
interface BackupFeatureEntry extends FeatureEntry {
  id: "backup";
}
```

The backup feature has no blueprint-level configuration — all settings live in `backup-config.json`. The blueprint entry merely controls whether the feature is available in the workspace.

### §7.2 Feature registration

In `featureSetup.ts`:

```typescript
featureManager.register("backup", async (root, enabled) => {
  await backupFeature.refresh(root, enabled);
});
```

No toggle needed (no providers to register/unregister). The feature manages its own status bar item internally.

---

## §8 Settings

| Setting                           | Type      | Default | Description                                               |
| --------------------------------- | --------- | ------- | --------------------------------------------------------- |
| `memoria.backup.catchUpOnStart`   | `boolean` | `false` | Run missed backups when VS Code starts.                   |

This is the only VS Code setting. All profile configuration lives in the dedicated config file.

---

## §9 Commands

| Command ID                        | Title                           | When                              |
| --------------------------------- | ------------------------------- | --------------------------------- |
| `memoria.createBackupProfile`     | Memoria: Create Backup Profile  | `memoria.workspaceInitialized`    |
| `memoria.runBackup`               | Memoria: Run Backup             | `memoria.backupActive`            |
| `memoria.backupHistory`           | Memoria: Backup History         | `memoria.backupActive`            |

**Context key**: `memoria.backupActive` — set to `true` when the backup feature is enabled and has at least one valid profile.

### §9.1 Backup History command

**Command: `Memoria: Backup History`**
- If multiple profiles exist, prompts to select one.
- Lists all `.zip` files in the profile's `targetFolder` matching `{profileName}_*.zip`.
- Shows a quick pick sorted newest-first, with each item displaying:
  - **Label**: filename (e.g., `daily-notes_DESKTOP-ABC_2026-06-06_18-00-00.zip`)
  - **Description**: file size (human-readable, e.g., `1.2 MB`)
  - **Detail**: last modified date from filesystem
- On selection, offers actions: **Reveal in Explorer** (`revealFileInOS`) or **Delete** (with confirmation).
- If no backups found, shows information message: *"No backups found for profile 'daily-notes'."*

---

## §10 Edge cases

1. **VS Code window reload**: Timers are re-created on activation. The scheduler reads `lastBackupTime` to avoid double-backing-up.
2. **Multiple VS Code windows on the same workspace**: Only one window should run backups. Use a lockfile (`targetFolder/.memoria-backup.lock`) with the PID. If the lock is stale (PID not running), take it.
3. **Clock changes / DST**: The scheduler recalculates the next run from `Date.now()` after each backup, so DST shifts self-correct.
4. **Config edited while timer is pending**: Watch `backup-config.json` for changes. On change, cancel all timers and re-schedule from the updated config.
5. **Profile renamed**: Old profile's state (hashes, lastBackupTime) is orphaned in `_state`. Acceptable — won't be read, and the next config write can prune unknown keys.
6. **Target folder on a network drive**: No special handling. If the folder is unreachable, the zip write fails and the error handler reports it.
7. **Very large number of files**: Hash computation is sequential and I/O-bound. For workspaces with thousands of files, the scan phase may take seconds. Progress reporting via `withProgress` is essential.
8. **Backup config file doesn't exist yet**: Feature activates in a dormant state (no profiles → no timers). The wizard command creates the file.

---

## §11 Testing strategy

### Unit tests (Vitest)

| Module                | Key scenarios                                                          |
| --------------------- | ---------------------------------------------------------------------- |
| `backupScheduler`     | Next occurrence calculation across day boundaries, DST, all-days, single-day |
| `hashManager`         | Hash comparison: new file, changed file, unchanged file, deleted file  |
| `retentionManager`    | Pruning with 0/1/N existing, count at/above/below retention           |
| `backupConfigManager` | Parse valid config, reject invalid, handle missing `_state`            |
| `zipCreator`          | Correct directory structure, empty file list rejected                  |
| Backup name formatter | Profile name sanitization, hostname, date/time formatting             |

### Integration tests (Mocha + @vscode/test-cli)

| Scenario                                        | Verification                                              |
| ----------------------------------------------- | --------------------------------------------------------- |
| Manual backup end-to-end                        | Zip created in target, correct contents, state updated    |
| Incremental backup (only changed files included)| Second backup after modifying one file → zip has one file  |
| Retention enforcement                           | Create N+1 backups → only N remain                        |
| Config wizard creates valid config              | Profile written, scheduler starts                         |
| Feature disable/enable                          | Timers cancelled/restarted, status bar removed/shown      |

---

## §12 Implementation phases

| Phase | Scope                                                        | Effort |
| ----- | ------------------------------------------------------------ | ------ |
| **1** | Config types, schema, config reader/writer, hash manager     | Small  |
| **2** | Zip creation, retention manager, backup executor             | Medium |
| **3** | Scheduler, feature class, feature registration               | Medium |
| **4** | Commands (manual run + wizard), status bar                   | Medium |
| **5** | Catch-up on start, lockfile, edge cases                      | Small  |
| **6** | Unit tests, integration tests                                | Medium |
| **7** | JSON schema for IntelliSense, documentation                  | Small  |

---

## §13 Resolved questions

1. **Dependency choice**: `yazl` — lighter, sufficient API, no unused features. See §6.6.
2. **Wizard scope**: Create-only. Editing existing profiles is done directly in the JSON config file (with schema IntelliSense).
3. **Backup history command**: Included as `memoria.backupHistory`. See §9.1.
