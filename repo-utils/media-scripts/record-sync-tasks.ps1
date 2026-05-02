# Recording script: Sync Tasks command
# =======================================
# Shows: Running the Sync Tasks command and seeing the progress
#
# Steps:
#   1. Show the collector file (All.todo.md) — may have some tasks already
#   2. Open the Command Palette (Ctrl+Shift+P)
#   3. Type "Memoria: Sync Tasks" and select it
#   4. Progress notification appears briefly
#   5. Collector file refreshes with newly synced tasks
#   6. Pause to show the updated collector content

$ErrorActionPreference = "Stop"
. "$PSScriptRoot\_recording-settings.ps1"

$target   = Join-Path $MediaOutputDir "sync-tasks.gif"
$fixture  = New-CleanFixture "sync-tasks"

# --- Setup: initialized workspace with scattered tasks -----------------------
New-StandardWorkspace -Root $fixture

# Add more tasks in source files for visible sync
Set-Content (Join-Path $fixture "01-ToRemember/action-items.md") -Value @"
# Action Items

- [ ] Update the team wiki
- [ ] Order new monitors for the lab
- [x] Submit expense report (2026-04-20)
"@ -Encoding UTF8

Set-Content (Join-Path $fixture "03-Inbox/ideas.md") -Value @"
# Ideas

- [ ] Prototype the new dashboard layout
- [ ] Research caching strategies for API v2
"@ -Encoding UTF8

# --- Launch VS Code -----------------------------------------------------------
Start-VSCode -FolderPath $fixture

# Open the collector file first
Send-Keys "^p" $DelayQuickPick
Type-Text "All.todo" $DelayShort
Send-Keys "{ENTER}" $DelayAfterCommand
Start-Sleep -Milliseconds $DelayShort

# --- Start recording ----------------------------------------------------------
Start-Recording

# Step 1: Show collector file content
Start-Sleep -Milliseconds $DelayPause

# Step 2-3: Run Sync Tasks
Invoke-VSCodeCommand "Memoria: Sync Tasks"

# Step 4-5: Wait for progress and refresh
Start-Sleep -Milliseconds ($DelayPause * 2)

# Step 6: Pause for viewer
Start-Sleep -Milliseconds ($DelayPause * 2)

# --- Stop recording -----------------------------------------------------------
Stop-Recording -OutputFile $target
