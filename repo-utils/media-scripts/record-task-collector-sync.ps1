# Recording script: Task Collector two-way sync
# ================================================
# Shows: Adding a task in standup.md, editing from both sides,
#        and resolving via the TODO editor — all synced live.
#
# Steps:
#   1. Open standup.md (left) and All.todo.md editor (right)
#   2. Add a task in standup.md — it appears in the TODO editor
#   3. Edit the task in All.todo.md — change syncs back to standup.md
#   4. Edit the task in standup.md — change syncs to All.todo.md
#   5. Resolve the task in All.todo.md — standup.md shows [x]

$ErrorActionPreference = "Stop"
. "$PSScriptRoot\_recording-settings.ps1"

$target   = Join-Path $DocsDir "features/media/task-collector-sync.gif"
$fixture  = New-CleanFixture "task-collector-sync"

# --- Setup: scaffold workspace off-camera -------------------------------------
New-StandardWorkspace -Root $fixture

# --- Launch VS Code -----------------------------------------------------------
Start-VSCode -FolderPath $fixture

# Wait for extension to activate and sync tasks into the collector
Start-Sleep -Milliseconds ($DelayPause * 3)

# --- Open standup.md on the left, All.todo.md (TODO editor) on the right ------
Send-Keys "^p" $DelayQuickPick
Type-Text "standup" $DelayShort
Send-Keys "{ENTER}" $DelayAfterCommand

Send-Keys "^\" $DelayShort                   # split editor right
Send-Keys "^p" $DelayQuickPick
Type-Text "All.todo" $DelayShort
Send-Keys "{ENTER}" $DelayAfterCommand
Start-Sleep -Milliseconds $DelayShort

# --- Start recording ----------------------------------------------------------
Start-Recording

# ---- Step 1: Show split view ------------------------------------------------
Write-Host "Step 1: Show split view"
Start-Sleep -Milliseconds ($DelayPause * 2)

# ---- Step 2: Add a task in standup.md (left pane) ----------------------------
Write-Host "Step 2: Add a task in standup.md"
Send-Keys "^1" $DelayShort                   # focus left editor group

# Navigate to end of tasks section and add a new task
Send-Keys "^g" $DelayQuickPick               # Go to Line
Type-Text "6" $DelayAfterKeystroke
Send-Keys "{ENTER}" $DelayShort              # jump to line 6
Send-Keys "{END}" $DelayShort                # end of line
Send-Keys "{ENTER}" $DelayAfterKeystroke     # new line
Type-Text "- [ ] Review the proposal" $DelayShort

# Save — the new task should appear in the TODO editor
Send-Keys "^s" $DelayAfterSave
Write-Host "   Waiting for All.todo.md to show the new task..."
Start-Sleep -Milliseconds ($DelayPause * 2)

# Focus the TODO editor to show the new task appeared
Send-Keys "^2" $DelayShort
Start-Sleep -Milliseconds ($DelayPause * 2)

# ---- Step 3: Edit the task in All.todo.md (TODO editor) ---------------------
Write-Host "Step 3: Edit task in All.todo.md"

# New collected task is prepended at the top — ↓ highlights first task
Send-Keys "{DOWN}" $DelayShort               # highlight "Review the proposal"
Start-Sleep -Milliseconds $DelayShort
Send-Keys "{ENTER}" $DelayQuickPick          # open edit popup

# Select all and type the edited text
Send-Keys "^a" $DelayShort                   # select all text in input
Type-Text "Review the proposal document" $DelayShort

# Pause so viewer can see the edited text before confirming
Start-Sleep -Milliseconds $DelayPause
Send-Keys "{ENTER}" $DelayAfterCommand       # confirm edit

# Wait for standup.md to sync
Write-Host "   Waiting for standup.md to reflect the edit..."
Start-Sleep -Milliseconds ($DelayPause * 2)

# Focus standup.md to show the synced change
Send-Keys "^1" $DelayShort
Start-Sleep -Milliseconds ($DelayPause * 2)

# ---- Step 4: Edit the task in standup.md (left pane) ------------------------
Write-Host "Step 4: Edit task in standup.md"

Send-Keys "^h" $DelayQuickPick               # open Find and Replace
Type-Text "Review the proposal document" $DelayAfterKeystroke
Send-Keys "{TAB}" $DelayShort                # move to replace field
Type-Text "Review the updated proposal" $DelayAfterKeystroke
Send-Keys "{ENTER}" $DelayShort              # replace
Send-Keys "{ESCAPE}" $DelayShort             # close find

# Save and wait for the TODO editor to reflect the edit
Send-Keys "^s" $DelayAfterSave
Write-Host "   Waiting for All.todo.md to reflect the edit..."
Start-Sleep -Milliseconds ($DelayPause * 2)

# Focus the TODO editor to show the updated text
Send-Keys "^2" $DelayShort
Start-Sleep -Milliseconds ($DelayPause * 2)

# ---- Step 5: Resolve the task in All.todo.md (TODO editor) ------------------
Write-Host "Step 5: Resolve task in All.todo.md"

# The task should still be highlighted from step 3; re-highlight first task
Send-Keys "{DOWN}" $DelayShort               # highlight first task
Start-Sleep -Milliseconds $DelayShort
Send-Keys " " $DelayAfterCommand             # Space = toggle complete

# Wait for standup.md to show [x]
Write-Host "   Waiting for standup.md to show completed task..."
Start-Sleep -Milliseconds ($DelayPause * 2)

# Focus standup.md to show the task is now [x]
Send-Keys "^1" $DelayShort
Start-Sleep -Milliseconds ($DelayPause * 2)

# --- Stop recording -----------------------------------------------------------
Stop-Recording -OutputFile $target
