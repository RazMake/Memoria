# Recording script: Explorer Decorations
# =========================================
# Shows: Color-coded badges and labels on folders in the Explorer
#
# Steps:
#   1. Show the Explorer panel with all decorated folders visible
#   2. Slowly scroll through the folder tree to display different colored badges
#   3. Hover over a decorated folder to show the tooltip
#   4. Expand a folder with propagated decorations to show children inherit the color
#   5. Open Command Palette → "Memoria: Manage features"
#   6. Uncheck "Explorer Decorations" and click OK
#   7. Show the Explorer — decorations disappear
#   8. Re-enable decorations
#   9. Decorations reappear immediately

$ErrorActionPreference = "Stop"
. "$PSScriptRoot\_recording-settings.ps1"

$target   = Join-Path $MediaOutputDir "explorer-decorations.gif"
$fixture  = New-CleanFixture "explorer-decorations"

# --- Setup: initialized workspace with decorations ----------------------------
New-StandardWorkspace -Root $fixture

# --- Launch VS Code -----------------------------------------------------------
Start-VSCode -FolderPath $fixture

# --- Start recording ----------------------------------------------------------
Start-Recording

# Step 1: Show Explorer with decorations
Send-Keys "^+e" $DelayPause

# Step 2: Scroll through folders slowly
Send-Keys "{DOWN}" $DelayAfterKeystroke
Send-Keys "{DOWN}" $DelayAfterKeystroke
Send-Keys "{DOWN}" $DelayAfterKeystroke
Send-Keys "{DOWN}" $DelayAfterKeystroke
Send-Keys "{DOWN}" $DelayAfterKeystroke
Start-Sleep -Milliseconds $DelayShort

# Step 3-4: Expand a folder to show propagation
Send-Keys "{RIGHT}" $DelayAfterKeystroke     # expand current folder
Send-Keys "{DOWN}" $DelayAfterKeystroke
Send-Keys "{DOWN}" $DelayAfterKeystroke
Start-Sleep -Milliseconds $DelayPause

# Step 5-6: Disable decorations via Manage features
Invoke-VSCodeCommand "Memoria: Manage features"
Start-Sleep -Milliseconds $DelayQuickPick

# Navigate to Explorer Decorations and uncheck
Send-Keys " " $DelayAfterKeystroke           # toggle off
Send-Keys "{ENTER}" $DelayAfterCommand

# Step 7: Show Explorer without decorations
Send-Keys "^+e" $DelayShort
Start-Sleep -Milliseconds ($DelayPause * 2)

# Step 8: Re-enable decorations
Invoke-VSCodeCommand "Memoria: Manage features"
Start-Sleep -Milliseconds $DelayQuickPick
Send-Keys " " $DelayAfterKeystroke           # toggle back on
Send-Keys "{ENTER}" $DelayAfterCommand

# Step 9: Show decorations reappeared
Send-Keys "^+e" $DelayShort
Start-Sleep -Milliseconds ($DelayPause * 2)

# --- Stop recording -----------------------------------------------------------
Stop-Recording -OutputFile $target
