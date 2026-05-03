# Recording script: Task Collector two-way sync
# ================================================
# Shows: Adding tasks in source files and seeing them collected;
#        checking off in collector and seeing it sync back
#
# Steps:
#   1. Show split view: source Markdown on left, collector on right
#   2. In the source file, type a new task: "- [ ] Review the proposal"
#   3. Save the source file (Ctrl+S)
#   4. The collector file updates — new task appears
#   5. In the collector, check off a task: change [ ] to [x]
#   6. Save the collector file
#   7. The task moves to Completed with a date stamp
#   8. Switch to the source — corresponding task is now [x]
#   9. Pause to show the two-way sync result

$ErrorActionPreference = "Stop"
. "$PSScriptRoot\_recording-settings.ps1"

$target   = Join-Path $DocsDir "features/media/task-collector-sync.gif"
$fixture  = New-CleanFixture "task-collector-sync"

# --- Setup: clean folder with VS Code settings --------------------------------
Write-RecordingSettings -Root $fixture

# --- Launch VS Code -----------------------------------------------------------
Start-VSCode -FolderPath $fixture

# --- First init (off-camera): let the extension scaffold the workspace --------
Initialize-Workspace -FixturePath $fixture

# --- Create source files with tasks (off-camera) -----------------------------
Set-Content (Join-Path $fixture "02-MeetingNotes/standup.md") -Value @"
# Daily Standup — 2026-04-28

## Updates
- Finished login page redesign
- [ ] Fix the login bug
- [ ] Send status update to team

## Notes
- Sprint review on Friday
"@ -Encoding UTF8

# Open source file and collector side by side
Send-Keys "^p" $DelayQuickPick
Type-Text "standup" $DelayShort
Send-Keys "{ENTER}" $DelayAfterCommand

# Split right and open collector
Send-Keys "^\" $DelayShort                   # split editor
Send-Keys "^p" $DelayQuickPick
Type-Text "All.todo" $DelayShort
Send-Keys "{ENTER}" $DelayAfterCommand
Start-Sleep -Milliseconds $DelayShort

# --- Start recording ----------------------------------------------------------
Start-Recording

# Step 1: Show split view
Write-Host "Step 1: Show split view"
Start-Sleep -Milliseconds $DelayPause

# Step 2: Switch to source file (left pane)
Write-Host "Step 2: Switch to source file and add a task"
Send-Keys "^1" $DelayShort                   # focus first editor group

# Navigate to end of file and add a new task
Send-Keys "^{END}" $DelayShort               # go to end
Send-Keys "{ENTER}" $DelayAfterKeystroke
Type-Text "- [ ] Review the proposal" $DelayShort

# Step 3: Save
Write-Host "Step 3: Save source file"
Send-Keys "^s" $DelayAfterSave

# Step 4: Wait for collector to update
Write-Host "Step 4: Wait for collector to update"
Start-Sleep -Milliseconds ($DelayPause * 2)

# Step 5: Switch to collector (right pane)
Write-Host "Step 5: Switch to collector and check off a task"
Send-Keys "^2" $DelayShort                   # focus second editor group
Start-Sleep -Milliseconds $DelayShort

# Find a task and check it off
Send-Keys "^h" $DelayQuickPick               # Find and Replace
Type-Text "- [ ] Review Q3" $DelayAfterKeystroke
Send-Keys "{TAB}" $DelayShort                # move to replace field
Type-Text "- [x] Review Q3" $DelayAfterKeystroke
Send-Keys "{ENTER}" $DelayShort              # replace
Send-Keys "{ESCAPE}" $DelayShort             # close find

# Step 6: Save collector
Write-Host "Step 6: Save collector file"
Send-Keys "^s" $DelayAfterSave

# Step 7-8: Wait for sync
Write-Host "Step 7: Wait for two-way sync"
Start-Sleep -Milliseconds ($DelayPause * 2)

# Switch back to source to show synced state
Write-Host "Step 8: Switch to source to show synced state"
Send-Keys "^1" $DelayShort
Start-Sleep -Milliseconds $DelayPause

# Step 9: Pause for viewer
Write-Host "Step 9: Pause for viewer"
Start-Sleep -Milliseconds ($DelayPause * 2)

# --- Stop recording -----------------------------------------------------------
Stop-Recording -OutputFile $target
