# Recording script: Manage features
# ====================================
# Shows: Enabling/disabling features via the picker
#
# Steps:
#   1. Open the Command Palette (Ctrl+Shift+P)
#   2. Type "Memoria: Manage features" and select it
#   3. Multi-select picker appears with feature list
#   4. Show the current state (some checked, some unchecked)
#   5. Toggle a feature off (e.g., uncheck "Explorer Decorations")
#   6. Toggle another feature on (e.g., check "Task Collector")
#   7. Click "OK" to confirm
#   8. Brief pause showing changes took effect

$ErrorActionPreference = "Stop"
. "$PSScriptRoot\_recording-settings.ps1"

$target   = Join-Path $MediaOutputDir "manage-features.gif"
$fixture  = New-CleanFixture "manage-features"

# --- Setup: initialized workspace with all features on ------------------------
New-StandardWorkspace -Root $fixture

# --- Launch VS Code -----------------------------------------------------------
Start-VSCode -FolderPath $fixture

# --- Start recording ----------------------------------------------------------
Start-Recording

# Show Explorer with decorations
Send-Keys "^+e" $DelayPause

# Step 1-2: Run Manage features
Invoke-VSCodeCommand "Memoria: Manage features"

# Step 3-4: Picker appears — browse
Start-Sleep -Milliseconds $DelayQuickPick

# Step 5: Toggle a feature off
Send-Keys " " $DelayAfterKeystroke
Send-Keys "{DOWN}" $DelayAfterKeystroke
Send-Keys "{DOWN}" $DelayAfterKeystroke

# Step 6: Toggle another feature
Send-Keys " " $DelayAfterKeystroke
Start-Sleep -Milliseconds $DelayShort

# Step 7: Confirm
Send-Keys "{ENTER}" $DelayAfterCommand

# Step 8: Show effect
Send-Keys "^+e" $DelayShort
Start-Sleep -Milliseconds ($DelayPause * 2)

# --- Stop recording -----------------------------------------------------------
Stop-Recording -OutputFile $target
