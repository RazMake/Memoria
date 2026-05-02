# Recording script: Toggle dot-folders
# ======================================
# Shows: Before/after dot-folder visibility in Explorer
#
# Steps:
#   1. Show the Explorer with dot-folders visible (.memoria/, .github/, etc.)
#   2. Open the Command Palette (Ctrl+Shift+P)
#   3. Type "Memoria: Toggle dot-folders" and select it
#   4. Dot-folders disappear from the Explorer (first run hides all)
#   5. Pause to show the clean Explorer without dot-folders
#   6. Open the Command Palette again
#   7. Run "Memoria: Toggle dot-folders" again
#   8. Multi-select picker appears — show checking/unchecking individual folders
#   9. Confirm — some dot-folders reappear, others stay hidden

$ErrorActionPreference = "Stop"
. "$PSScriptRoot\_recording-settings.ps1"

$target   = Join-Path $MediaOutputDir "toggle-dot-folders.gif"
$fixture  = New-CleanFixture "toggle-dot-folders"

# --- Setup: initialized workspace with dot-folders ----------------------------
New-StandardWorkspace -Root $fixture

# --- Launch VS Code -----------------------------------------------------------
Start-VSCode -FolderPath $fixture

# --- Start recording ----------------------------------------------------------
Start-Recording

# Step 1: Show Explorer with dot-folders visible
Send-Keys "^+e" $DelayPause
Start-Sleep -Milliseconds $DelayPause

# Step 2-3: First toggle — hides all dot-folders
Invoke-VSCodeCommand "Memoria: Toggle dot-folders"

# Step 4-5: Pause to show clean Explorer
Start-Sleep -Milliseconds ($DelayPause * 2)

# Step 6-7: Second toggle — brings up the multi-select picker
Invoke-VSCodeCommand "Memoria: Toggle dot-folders"

# Step 8: Interact with picker
Start-Sleep -Milliseconds $DelayQuickPick
Send-Keys " " $DelayAfterKeystroke          # toggle first item
Send-Keys "{DOWN}" $DelayAfterKeystroke
Send-Keys " " $DelayAfterKeystroke          # toggle second item
Send-Keys "{DOWN}" $DelayAfterKeystroke
Start-Sleep -Milliseconds $DelayShort

# Step 9: Confirm
Send-Keys "{ENTER}" $DelayAfterCommand
Start-Sleep -Milliseconds ($DelayPause * 2)

# --- Stop recording -----------------------------------------------------------
Stop-Recording -OutputFile $target
