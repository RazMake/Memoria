# Recording script: Reinitialization conflict resolver
# ======================================================
# Shows: Running Initialize workspace on an already-initialized workspace,
#        handling extra folders and modified files with diff editor
#
# Steps:
#   1. Show All.todo.md with user's tasks (active + completed)
#   2. Open the Command Palette → "Memoria: Initialize workspace"
#   3. The reinit prompt appears — confirm to proceed
#   4. Select a blueprint (same one)
#   5. Extra folders checklist — uncheck one, confirm
#   6. Modified files checklist — check All.todo.md for diff, confirm
#   7. Diff editor opens — viewer sees two hunks
#   8. Press "1" to toggle Hunk 1 to "Keep" (active tasks)
#   9. Ctrl+Enter to Apply & Close
#  10. Open the result file — active tasks preserved, completed section reset

$ErrorActionPreference = "Stop"
. "$PSScriptRoot\_recording-settings.ps1"

$target   = Join-Path $DocsDir "commands/media/conflict-resolver.gif"
$fixture  = New-CleanFixture "conflict-resolver"

# --- Setup: initialized workspace with modifications -------------------------
# Start from a clean folder — NO pre-scaffolding. The extension will initialize it.
Write-RecordingSettings -Root $fixture

# Create an extra folder NOT in the blueprint (will show in extra-folders step)
New-Item (Join-Path $fixture "99-MyCustomFolder") -ItemType Directory -Force | Out-Null
Set-Content (Join-Path $fixture "99-MyCustomFolder/notes.md") -Value "# Custom notes" -Encoding UTF8

# --- Launch VS Code -----------------------------------------------------------
Start-VSCode -FolderPath $fixture

# --- First init (off-camera): let the extension scaffold the workspace --------
Initialize-Workspace -FixturePath $fixture

# --- Modify blueprint-managed files so they show up as conflicts on reinit ----
# Overwrite the collector file with realistic user tasks.
# After reinit, the blueprint replaces this file with its generic placeholder.
# The diff editor lets the user choose "Keep Pre-existing Version" to restore
# all their tasks. The names make the outcome self-evident in the recording.
Set-Content (Join-Path $fixture "00-Workstreams/All.todo.md") -Value @"
# To do

- [ ] Review Q3 roadmap proposal
- [ ] Prepare demo for sprint review
- [ ] Reply to Sarah's design feedback
- [ ] Update API docs for v2 endpoints

# Completed

- [x] Fix login page redirect bug
      _Completed 2026-04-30_
- [x] Set up CI pipeline for staging
      _Completed 2026-04-28_
"@ -Encoding UTF8

# --- Start recording ----------------------------------------------------------
Start-Recording -Limit "00:00:50"

# Step 1: Show the current All.todo.md before reinit
# Open it so the viewer sees the user's tasks that are at risk
Send-Keys "^p" $DelayQuickPick
Type-Text "All.todo" $DelayShort
Send-Keys "{ENTER}" $DelayAfterCommand
Start-Sleep -Milliseconds $DelayPause        # pause on active tasks
# Scroll down to show the completed section too
Send-Keys "^{END}" $DelayAfterKeystroke
Start-Sleep -Milliseconds $DelayPause        # pause on completed tasks

# Step 2: Run Initialize workspace (reinit path)
Invoke-VSCodeCommand "Memoria: Initialize workspace"

# Step 3: Reinit confirmation prompt — confirm
Start-Sleep -Milliseconds $DelayQuickPick
Send-Keys "{ENTER}" $DelayAfterCommand       # confirm reinit

# Step 4: Blueprint picker
Start-Sleep -Milliseconds $DelayQuickPick
Send-Keys "{ENTER}" $DelayAfterCommand       # select same blueprint

# Step 5: Extra folders checklist
Start-Sleep -Milliseconds $DelayQuickPick
# Browse the list
Send-Keys "{DOWN}" $DelayAfterKeystroke
# Uncheck one folder (Space)
Send-Keys " " $DelayAfterKeystroke
Start-Sleep -Milliseconds $DelayShort
Send-Keys "{ENTER}" $DelayAfterCommand       # confirm

# Step 6: Modified files checklist
# All.todo.md appears (it was modified after the first init).
# Check it to open the diff editor after reinit.
Start-Sleep -Milliseconds $DelayQuickPick
Send-Keys " " $DelayAfterKeystroke           # check All.todo.md for diff
Start-Sleep -Milliseconds $DelayShort
Send-Keys "{ENTER}" $DelayAfterCommand       # confirm

# Step 7: Diff editor webview opens
# Pause so the viewer can see the diff hunks (two change sections)
Start-Sleep -Milliseconds ($DelayPause * 2)

# Step 8: Toggle Hunk 1 to "Keep" (active tasks preserved)
# The webview supports keyboard shortcuts:
#   Number keys 1-9 toggle Keep/Ignore on the corresponding hunk
#   Ctrl+Enter triggers Apply & Close
Send-Keys "{TAB}" $DelayAfterKeystroke       # focus into webview
Send-Keys "1" $DelayAfterKeystroke           # toggle Hunk 1 to "Keep"
Start-Sleep -Milliseconds $DelayPause        # pause so viewer sees the change

# Step 9: Apply the partial merge (Ctrl+Enter)
Send-Keys "^{ENTER}" $DelayAfterCommand      # Apply & Close — panel closes

# Step 10: Open the result file to show partial merge
# Active tasks preserved, completed section reset, no blueprint sample todo
Start-Sleep -Milliseconds $DelayShort
Send-Keys "^p" $DelayQuickPick
Type-Text "All.todo" $DelayShort
Send-Keys "{ENTER}" $DelayAfterCommand
Start-Sleep -Milliseconds ($DelayPause * 2)  # pause for viewer to see result

# --- Stop recording -----------------------------------------------------------
Stop-Recording -OutputFile $target
