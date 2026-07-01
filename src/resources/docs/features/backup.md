# Scheduled Backup

Automatically zips selected workspace files to a target folder on a recurring schedule. Backups are **incremental** (only files changed since the last run are captured), and every archive is stamped with the **machine name** it was created on — so you always know where each backup came from.

In a **git** workspace, backups are also **remote-aware**: files that are already committed **and** pushed to the remote are skipped, because they're already safely stored off-machine. Only your at-risk work — uncommitted edits, staged changes, and commits you haven't pushed yet — is captured.

## Why use it

Knowledge bases are often worked on from more than one place. The Scheduled Backup feature gives you an off-machine copy of your notes without thinking about it.

### Example: the hybrid worker who forgets to check in

Imagine you split your week between the office and home, and you keep your notebook under source control.

1. On **Tuesday at the office**, you spend the day editing notes, meeting minutes, and TODOs — but at the end of the day you **forget to commit and push** your changes.
2. Your work machine has a backup profile that runs every weekday at `18:00` and writes its zips to a **OneDrive** folder.
3. At 18:00 the scheduler quietly captures everything you changed but **haven't pushed** that day into `notebook_WORK-PC_2026-06-09_1800.zip` and OneDrive syncs it to the cloud. (Anything you *did* push is skipped — it's already safe on the remote.)
4. **Wednesday from home**, you realize the work changes were never pushed. Instead of being blocked, you open the synced OneDrive backup folder, spot the `..._WORK-PC_...` archive (the machine name tells you it's from the office), and extract the files you need to keep working.

Because the backup is keyed by machine name and lands in a cloud-synced folder, the unpushed work is never trapped on the office computer.

## How it works

When a profile is due (or you run it manually), Memoria:

1. **Scans** the profile's source folders/globs, applying the exclusion patterns.
2. **Filters out** any file that is already committed and pushed to the git remote (see [Git awareness](#git-awareness) below). In a non-git workspace this step does nothing.
3. **Hashes** every remaining file (SHA-256) and **diffs** against the hashes from the previous backup.
4. **Skips** the run entirely if nothing changed.
5. **Prunes** old archives down to the retention limit (oldest deleted first).
6. **Zips** only the changed files and writes the archive to the target folder.
7. **Records** the new hashes so the next run is incremental again.

> Because each archive only contains files that changed since the previous run, backups stay small. To reconstruct a full snapshot, combine the archives in chronological order.

## Git awareness

When the workspace is a git repository, a file is considered **safely stored** — and therefore excluded from the backup — only when **all** of the following are true:

- it is **tracked** by git,
- it has **no uncommitted changes** (nothing modified or staged), and
- **no unpushed commit** touches it (its latest content is already on the remote tracking branch).

Everything else is backed up: untracked files, modified/staged files, and files changed by commits you haven't pushed. Once a file is confirmed pushed, its stored hash is **dropped** from the manifest — if you edit it again later, it's treated as new and backed up again.

Memoria falls back to backing up **every** selected file (the classic behavior) when:

- the workspace is **not** a git repository,
- the current branch has **no upstream / remote tracking branch** (nothing can be confirmed as pushed), or
- git is unavailable on the machine.

This keeps the feature safe by default: if it can't prove a file is already on the remote, it backs it up.

## Archive naming

Backups are named so you can identify them at a glance:

```
{profileName}_{computerName}_{date}_{time}.zip
```

For example: `notebook_WORK-PC_2026-06-09_1800.zip`

The **computer name** segment is what makes the multi-machine workflow above possible — backups from different machines coexist in the same target folder without colliding.

## Creating a profile

1. Open the Command Palette (`Ctrl+Shift+P`)
2. Run **Memoria: Create Backup Profile**
3. Follow the 7-step wizard:

| Step | Prompt | Notes |
|------|--------|-------|
| 1 | **Profile name** | Letters, numbers, and hyphens only |
| 2 | **Source folders** | Tree selector — defaults to the entire workspace |
| 3 | **Exclusion patterns** | Optional, comma-separated globs (e.g. `**/node_modules/**`) |
| 4 | **Target folder** | Where zips are written — pick a **cloud-synced folder** (OneDrive, etc.) for off-machine durability |
| 5 | **Schedule time** | `HH:MM`, 24-hour (e.g. `18:00`) |
| 6 | **Schedule days** | Days of the week to run |
| 7 | **Retention count** | How many archives to keep per profile |

The profile is saved to `.memoria/backup-config.json` and the scheduler starts immediately.

## Running on demand

Run **Memoria: Run Backup** to trigger a profile right away. If you have multiple profiles, you can pick one or run **All profiles**.

## Browsing history

Run **Memoria: Backup History** to list a profile's existing archives (with size and timestamp). For any archive you can:

- **Reveal in Explorer** — open the file in your OS file manager
- **Delete** — remove the archive (with confirmation)

## Toggling

1. Open the Command Palette (`Ctrl+Shift+P`)
2. Run **Memoria: Manage features**
3. Check or uncheck **Scheduled Backup**

When disabled, all schedule timers stop and the status bar item is hidden. Existing archives and profiles are left untouched.

## Catch-up on start

If VS Code was closed when a backup was scheduled, the run is missed. Enable the setting **Memoria › Backup: Catch Up On Start** (`memoria.backup.catchUpOnStart`) to run any missed backups when VS Code next starts.

## Configuration

Profiles are stored in `.memoria/backup-config.json`. See the [backup-config.json reference](../configuration/backup-config-json.md) for the full schema.

## Troubleshooting

- **Backup didn't run?** Make sure the feature is enabled via **Memoria: Manage features** and that the scheduled day/time has actually passed while VS Code was open. Use **Catch Up On Start** for missed runs.
- **Archive is empty or missing?** A run is **skipped** when no files changed since the last backup — this is expected, not an error. In a git workspace, remember that files already committed and pushed to the remote are intentionally excluded, so a backup can be skipped even after you've edited files, as long as those edits were pushed.
- **Want everything backed up regardless of git?** Ensure the branch has no upstream, or use the feature in a non-git folder — Memoria only excludes files it can confirm are pushed. Otherwise, keep unpushed work and it will always be captured.
- **Can't find the target folder's files from another machine?** Confirm the target folder is inside a cloud-synced location (e.g. OneDrive) and that syncing has completed on both machines.
- **Two windows backing up at once?** A lockfile in the target folder prevents duplicate concurrent backups from multiple VS Code windows.

---

[⬅️ **Back** to Features](index.md) 💠 [Getting Started](../getting-started.md) 💠 [FAQ](../faq.md)
