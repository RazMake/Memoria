# Recording script: Reinitialization conflict resolver
# ======================================================
# Shows: Running Initialize workspace on an already-initialized workspace,
#        handling extra folders and modified files with diff editor
#
# Steps:
#   1. Show All.todo.md with user's tasks (active + completed)
#   2. Open the Command Palette → "Memoria: Initialize workspace"
#   3. Select a blueprint (same one)
#   4. Extra folders checklist — keep all, confirm
#   5. Modified files checklist — check All.todo.md for diff, confirm
#   6. Diff editor opens — viewer sees two hunks
#   7. Press "1" to toggle Hunk 1 to "Keep" (active tasks)
#   8. Ctrl+Enter to Apply & Close
#   9. Open the result file — active tasks preserved, completed section reset

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
Start-Recording

# Step 1: Show the current All.todo.md before reinit
Write-Host "Step 1: Show All.todo.md with user tasks"
Send-Keys "^p" $DelayQuickPick
Type-Text "All.todo" $DelayShort
Send-Keys "{ENTER}" $DelayAfterCommand
Start-Sleep -Milliseconds $DelayPause        # pause on active tasks
# Scroll down to show the completed section too
Send-Keys "^{END}" $DelayAfterKeystroke
Start-Sleep -Milliseconds $DelayPause        # pause on completed tasks

# Step 2: Run Initialize workspace (reinit path)
Write-Host "Step 2: Run Initialize workspace (reinit)"
Invoke-VSCodeCommand "Memoria: Initialize workspace"

# Step 3: Blueprint picker (there is no reinit confirmation prompt —
# the command goes straight to the blueprint picker)
Write-Host "Step 3: Select blueprint"
Start-Sleep -Milliseconds $DelayQuickPick
Send-Keys "{ENTER}" $DelayAfterCommand       # select same blueprint

# Step 4: Extra folders checklist — all pre-checked (keep), just confirm
Write-Host "Step 4: Handle extra folders checklist"
Start-Sleep -Milliseconds $DelayQuickPick
Send-Keys "{ENTER}" $DelayAfterCommand       # keep all folders as-is

# Step 5: Modified files checklist — none pre-checked, check All.todo.md
Write-Host "Step 5: Handle modified files checklist"
Start-Sleep -Milliseconds $DelayQuickPick
Send-Keys "{DOWN}" $DelayAfterKeystroke      # move focus from input box to first item
Send-Keys " " $DelayAfterKeystroke           # check All.todo.md for diff
Start-Sleep -Milliseconds $DelayShort
Send-Keys "{ENTER}" $DelayAfterCommand       # confirm

# Step 6: Diff editor webview opens
Write-Host "Step 6: Show diff editor with two hunks"
Start-Sleep -Milliseconds ($DelayPause * 2)

# Step 7: Toggle Hunk 1 to "Keep"
Write-Host "Step 7: Toggle Hunk 1 to Keep"
Send-Keys "{TAB}" $DelayAfterKeystroke       # focus into webview
Send-Keys "1" $DelayAfterKeystroke           # toggle Hunk 1 to "Keep"
Start-Sleep -Milliseconds $DelayPause        # pause so viewer sees the change

# Step 8: Apply the partial merge (Ctrl+Enter)
Write-Host "Step 8: Apply & Close"
Send-Keys "^{ENTER}" $DelayAfterCommand      # Apply & Close — panel closes

# Step 9: Open the result file to show partial merge
Write-Host "Step 9: Show result — active tasks preserved"
Start-Sleep -Milliseconds $DelayShort
Send-Keys "^p" $DelayQuickPick
Type-Text "All.todo" $DelayShort
Send-Keys "{ENTER}" $DelayAfterCommand
Start-Sleep -Milliseconds ($DelayPause * 2)  # pause for viewer to see result

# --- Stop recording -----------------------------------------------------------
Stop-Recording -OutputFile $target
