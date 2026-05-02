# Recording script: Reinitialization conflict resolver
# ======================================================
# Shows: Running Initialize workspace on an already-initialized workspace,
#        handling extra folders and modified files with diff editor
#
# Steps:
#   1. Show the Explorer with the current workspace structure
#   2. Open the Command Palette → "Memoria: Initialize workspace"
#   3. The reinit prompt appears — confirm to proceed
#   4. Select a blueprint (same or different)
#   5. Step 1: Extra folders checklist appears
#      - Uncheck one folder to move it to WorkspaceInitializationBackups/
#      - Confirm
#   6. Step 2: Modified files checklist appears
#      - Check a file to open it in the diff editor
#      - Confirm
#   7. Diff editor opens
#   8. Show the WorkspaceInitializationBackups/ folder
#   9. Pause to let the viewer see the complete flow

$ErrorActionPreference = "Stop"
. "$PSScriptRoot\_recording-settings.ps1"

$target   = Join-Path $MediaOutputDir "conflict-resolver.gif"
$fixture  = New-CleanFixture "conflict-resolver"

# --- Setup: initialized workspace with modifications -------------------------
New-StandardWorkspace -Root $fixture

# Create an extra folder NOT in the blueprint (will show in extra-folders step)
New-Item (Join-Path $fixture "99-MyCustomFolder") -ItemType Directory -Force | Out-Null
Set-Content (Join-Path $fixture "99-MyCustomFolder/notes.md") -Value "# Custom notes" -Encoding UTF8

# Modify a blueprint-managed file (will show in modified-files step)
Set-Content (Join-Path $fixture "00-Workstreams/All.todo.md") -Value @"
# To do

- [ ] Review Q3 roadmap proposal
- [ ] MY CUSTOM TASK — this was added by the user
- [ ] Another hand-written task

# Completed

- [x] Old task that user completed
      _Completed 2026-05-02_
"@ -Encoding UTF8

# --- Launch VS Code -----------------------------------------------------------
Start-VSCode -FolderPath $fixture

# --- Start recording ----------------------------------------------------------
Start-Recording -Limit "00:00:30"

# Step 1: Show Explorer
Send-Keys "^+e" $DelayPause

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
Start-Sleep -Milliseconds $DelayQuickPick
Send-Keys " " $DelayAfterKeystroke           # check a file for diff
Start-Sleep -Milliseconds $DelayShort
Send-Keys "{ENTER}" $DelayAfterCommand       # confirm

# Step 7: Diff editor opens
Start-Sleep -Milliseconds ($DelayPause * 2)

# Step 8: Show Explorer with backups folder
Send-Keys "^+e" $DelayPause
Start-Sleep -Milliseconds $DelayPause

# Step 9: Pause for viewer
Start-Sleep -Milliseconds ($DelayPause * 2)

# --- Stop recording -----------------------------------------------------------
Stop-Recording -OutputFile $target
