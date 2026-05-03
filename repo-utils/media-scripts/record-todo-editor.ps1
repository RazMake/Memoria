# Recording script: Todo Editor visual task board
# =================================================
# Shows: The visual editor for .todo.md files with card interactions
#
# Steps:
#   1. Open a .todo.md file — the visual Todo Editor appears
#   2. Show the task cards with checkboxes and text
#   3. Hover over a card to reveal the drag handle and source link
#   4. Click "+ Add task" in the toolbar — popup appears
#   5. Type a task name, press Enter — new card appears
#   6. Drag a task card to reorder (keyboard-based reorder)
#   7. Click a checkbox on an active task — moves to Completed
#   8. Expand the Completed section
#   9. Click a completed task's checkbox — moves back to active
#  10. Double-click a task body to edit inline

$ErrorActionPreference = "Stop"
. "$PSScriptRoot\_recording-settings.ps1"

$target   = Join-Path $DocsDir "features/media/todo-editor.gif"
$fixture  = New-CleanFixture "todo-editor"

# --- Setup: clean folder with VS Code settings --------------------------------
Write-RecordingSettings -Root $fixture

# --- Launch VS Code -----------------------------------------------------------
Start-VSCode -FolderPath $fixture

# --- First init (off-camera): let the extension scaffold the workspace --------
Initialize-Workspace -FixturePath $fixture

# --- Enhance the todo file with more tasks (off-camera) -----------------------
Set-Content (Join-Path $fixture "00-Workstreams/All.todo.md") -Value @"
# To do

- [ ] Review Q3 roadmap proposal
- [ ] Update onboarding documentation
- [ ] Schedule design review meeting
- [ ] Fix flaky CI tests
- [ ] Write API migration guide

# Completed

- [x] Submit expense report
      _Completed 2026-04-20_
- [x] Update team wiki
      _Completed 2026-04-18_
"@ -Encoding UTF8

# --- Launch VS Code -----------------------------------------------------------
Start-VSCode -FolderPath $fixture

# Open the todo file
Send-Keys "^p" $DelayQuickPick
Type-Text "All.todo" $DelayShort
Send-Keys "{ENTER}" $DelayAfterCommand

# --- Start recording ----------------------------------------------------------
Start-Recording

# Step 1-2: Show the Todo Editor (custom editor should open automatically)
Write-Host "Step 1: Show the Todo Editor"
Start-Sleep -Milliseconds ($DelayPause * 2)

# Step 3-5: The visual editor is a webview — interactions are mostly mouse-driven
# and difficult to automate via SendKeys. Show the board and pause.
# The user may need to manually interact for drag/drop and clicking.
Write-Host "Step 2: Pause to show board"
Start-Sleep -Milliseconds $DelayPause

# Step 4-5: Use keyboard Tab to navigate and Enter/Space to interact
Write-Host "Step 3: Add a new task via keyboard"
Send-Keys "{TAB}" $DelayAfterKeystroke       # focus into webview
Send-Keys "{TAB}" $DelayAfterKeystroke       # navigate to add button area
Send-Keys "{ENTER}" $DelayQuickPick          # trigger add task
Type-Text "Prepare sprint retrospective" $DelayAfterKeystroke
Send-Keys "{ENTER}" $DelayAfterCommand
Start-Sleep -Milliseconds $DelayPause

# Step 7: Check a task (Tab to checkbox, Space to toggle)
Write-Host "Step 4: Check a task checkbox"
Send-Keys "{TAB}" $DelayAfterKeystroke
Send-Keys "{TAB}" $DelayAfterKeystroke
Send-Keys " " $DelayAfterKeystroke           # toggle checkbox
Start-Sleep -Milliseconds $DelayPause

# Pause for viewer
Write-Host "Step 5: Pause for viewer"
Start-Sleep -Milliseconds ($DelayPause * 2)

# --- Stop recording -----------------------------------------------------------
Stop-Recording -OutputFile $target
