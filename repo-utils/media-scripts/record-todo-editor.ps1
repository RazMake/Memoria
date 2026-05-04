# Recording script: Todo Editor visual task board
# =================================================
# Shows: The visual editor for .todo.md files with card interactions
#
# Steps:
#   1-2. Open a .todo.md file — the visual Todo Editor appears, pause to show board
#   3.   Navigate cards with arrow keys to show highlight
#   4-5. Press 'a' to open add-task popup, type a name, Enter — new card appears
#   6.   Reorder with Ctrl+Down
#   7.   Complete a task with Space — moves to Completed
#   8.   Expand the Completed section with 'c'
#   9.   Uncomplete a completed task with Space — moves back to active
#  10.   Edit a task inline with Enter — popup opens, append text, confirm

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

# Open the todo file (same VS Code window — do NOT re-launch)
Send-Keys "^p" $DelayQuickPick
Type-Text "All.todo" $DelayShort
Send-Keys "{ENTER}" $DelayAfterCommand
Start-Sleep -Milliseconds $DelayPause       # let custom editor load

# --- Start recording ----------------------------------------------------------
Start-Recording

# Step 1-2: Show the Todo Editor (custom editor should open automatically)
Write-Host "Step 1-2: Show the Todo Editor board"
Start-Sleep -Milliseconds ($DelayPause * 2)

# The webview has built-in keyboard shortcuts (see keyboardNav.ts / main.ts):
#   a/n        → open add-task popup
#   ArrowDown  → highlight next card
#   ArrowUp    → highlight previous card
#   Space      → toggle complete/uncomplete on highlighted card
#   c          → toggle completed section expanded/collapsed
#   Enter      → edit highlighted card inline
#   Ctrl+Down  → swap highlighted card down (reorder)
#   Ctrl+Up    → swap highlighted card up (reorder)
#   Delete     → delete highlighted card
# These fire inside the webview once it has focus — no Tab navigation needed.

# Step 3: Navigate cards with arrow keys to show highlight
Write-Host "Step 3: Navigate cards with arrow keys"
Send-Keys "{DOWN}" $DelayAfterKeystroke      # highlight first card
Start-Sleep -Milliseconds $DelayShort
Send-Keys "{DOWN}" $DelayAfterKeystroke      # highlight second card
Start-Sleep -Milliseconds $DelayShort
Send-Keys "{DOWN}" $DelayAfterKeystroke      # highlight third card
Start-Sleep -Milliseconds $DelayPause

# Step 4-5: Add a new task via the 'a' shortcut → popup appears
Write-Host "Step 4-5: Add a new task"
Send-Keys "a" $DelayQuickPick                # open add-task popup
Type-Text "Prepare sprint retrospective" $DelayAfterKeystroke
Send-Keys "{ENTER}" $DelayAfterCommand       # confirm — new card appears
Start-Sleep -Milliseconds $DelayPause

# Step 6: Reorder — move the highlighted task down with Ctrl+Down
Write-Host "Step 6: Reorder task with Ctrl+Down"
Send-Keys "^{DOWN}" $DelayAfterKeystroke     # swap down
Start-Sleep -Milliseconds $DelayShort
Send-Keys "^{DOWN}" $DelayAfterKeystroke     # swap down again
Start-Sleep -Milliseconds $DelayPause

# Step 7: Complete a task — Space toggles the highlighted card
Write-Host "Step 7: Complete a task (Space)"
Send-Keys "{UP}" $DelayAfterKeystroke        # highlight first task
Send-Keys "{UP}" $DelayAfterKeystroke
Send-Keys "{UP}" $DelayAfterKeystroke
Start-Sleep -Milliseconds $DelayShort
Send-Keys " " $DelayAfterKeystroke           # toggle → moves to Completed
Start-Sleep -Milliseconds $DelayPause

# Step 8: Expand the Completed section
Write-Host "Step 8: Expand Completed section (c)"
Send-Keys "c" $DelayAfterKeystroke           # toggle completed section
Start-Sleep -Milliseconds $DelayPause

# Step 9: Uncomplete a task — navigate to a completed card and Space
Write-Host "Step 9: Uncomplete a completed task"
Send-Keys "{DOWN}" $DelayAfterKeystroke      # move into completed list
Send-Keys "{DOWN}" $DelayAfterKeystroke
Start-Sleep -Milliseconds $DelayShort
Send-Keys " " $DelayAfterKeystroke           # uncomplete → moves back to active
Start-Sleep -Milliseconds $DelayPause

# Step 10: Edit a task inline — Enter on highlighted card
Write-Host "Step 10: Edit task inline (Enter)"
Send-Keys "{UP}" $DelayAfterKeystroke        # highlight an active task
Send-Keys "{ENTER}" $DelayQuickPick          # open edit popup
Type-Text " — updated" $DelayAfterKeystroke  # append text
Send-Keys "{ENTER}" $DelayAfterCommand       # confirm edit
Start-Sleep -Milliseconds ($DelayPause * 2)

# --- Stop recording -----------------------------------------------------------
Stop-Recording -OutputFile $target
