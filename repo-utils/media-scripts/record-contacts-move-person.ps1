# Recording script: Move person between contact groups
# ======================================================
# Shows: Moving a contact between groups, with field handling
#
# Steps:
#   1. Open the Contacts sidebar, show a report in Team.md group
#   2. Hover over the contact row to reveal inline actions
#   3. Click the "Move" action (or use Command Palette)
#   4. Select the destination group (e.g., Colleagues.md)
#   5. Show the confirmation — report-only fields will be preserved as _droppedFields
#   6. Confirm the move
#   7. Contact disappears from Team.md and appears in Colleagues.md
#   8. (Optional) Move the contact back

$ErrorActionPreference = "Stop"
. "$PSScriptRoot\_recording-settings.ps1"

$target   = Join-Path $MediaOutputDir "contacts-move-person.gif"
$fixture  = New-CleanFixture "contacts-move-person"

# --- Setup: people-manager workspace with Team.md ----------------------------
New-PeopleManagerWorkspace -Root $fixture

# --- Launch VS Code -----------------------------------------------------------
Start-VSCode -FolderPath $fixture

# --- Start recording ----------------------------------------------------------
Start-Recording

# Step 1: Open Contacts sidebar
Invoke-VSCodeCommand "Memoria: Focus Contacts"
Start-Sleep -Milliseconds $DelayPause

# Navigate to a contact in Team.md
Send-Keys "{DOWN}" $DelayAfterKeystroke
Send-Keys "{RIGHT}" $DelayAfterKeystroke     # expand Team group
Send-Keys "{DOWN}" $DelayAfterKeystroke      # select first report
Start-Sleep -Milliseconds $DelayPause

# Step 3: Move person via Command Palette
Invoke-VSCodeCommand "Memoria: Move Person"
Start-Sleep -Milliseconds $DelayQuickPick

# Step 4: Select destination group
Send-Keys "{DOWN}" $DelayAfterKeystroke      # browse groups
Send-Keys "{ENTER}" $DelayQuickPick          # select Colleagues.md

# Step 5-6: Confirm
Start-Sleep -Milliseconds $DelayQuickPick
Send-Keys "{ENTER}" $DelayAfterCommand

# Step 7: Show result
Start-Sleep -Milliseconds $DelayPause

# Navigate to see the contact in new location
Send-Keys "{DOWN}" $DelayAfterKeystroke
Send-Keys "{DOWN}" $DelayAfterKeystroke
Send-Keys "{DOWN}" $DelayAfterKeystroke
Start-Sleep -Milliseconds ($DelayPause * 2)

# --- Stop recording -----------------------------------------------------------
Stop-Recording -OutputFile $target
