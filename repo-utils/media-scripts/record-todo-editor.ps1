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

$target   = Join-Path $MediaOutputDir "todo-editor.gif"
$fixture  = New-CleanFixture "todo-editor"

# --- Setup: initialized workspace with a populated todo file ------------------
New-StandardWorkspace -Root $fixture

# Enhance the todo file with more tasks
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
Start-Sleep -Milliseconds ($DelayPause * 2)

# Step 3-5: The visual editor is a webview — interactions are mostly mouse-driven
# and difficult to automate via SendKeys. Show the board and pause.
# The user may need to manually interact for drag/drop and clicking.
Start-Sleep -Milliseconds $DelayPause

# Step 4-5: Use keyboard Tab to navigate and Enter/Space to interact
Send-Keys "{TAB}" $DelayAfterKeystroke       # focus into webview
Send-Keys "{TAB}" $DelayAfterKeystroke       # navigate to add button area
Send-Keys "{ENTER}" $DelayQuickPick          # trigger add task
Type-Text "Prepare sprint retrospective" $DelayAfterKeystroke
Send-Keys "{ENTER}" $DelayAfterCommand
Start-Sleep -Milliseconds $DelayPause

# Step 7: Check a task (Tab to checkbox, Space to toggle)
Send-Keys "{TAB}" $DelayAfterKeystroke
Send-Keys "{TAB}" $DelayAfterKeystroke
Send-Keys " " $DelayAfterKeystroke           # toggle checkbox
Start-Sleep -Milliseconds $DelayPause

# Pause for viewer
Start-Sleep -Milliseconds ($DelayPause * 2)

# --- Stop recording -----------------------------------------------------------
Stop-Recording -OutputFile $target
