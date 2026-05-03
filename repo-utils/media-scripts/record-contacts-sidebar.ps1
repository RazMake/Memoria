# Recording script: Contacts sidebar overview
# ==============================================
# Shows: Browsing, searching, and adding contacts via the sidebar
#
# Steps:
#   1. Open the Contacts sidebar panel
#   2. Expand a contact group to show its members
#   3. Use the search box — type a name fragment, show filtered results
#   4. Clear the search
#   5. Add a new colleague by editing Colleagues.md directly
#   6. Save — sidebar auto-refreshes with the new entry

$ErrorActionPreference = "Stop"
. "$PSScriptRoot\_recording-settings.ps1"

$target   = Join-Path $DocsDir "features/media/contacts-sidebar.gif"
$fixture  = New-CleanFixture "contacts-sidebar"

# --- Setup: clean folder with VS Code settings --------------------------------
Write-RecordingSettings -Root $fixture

# --- Launch VS Code -----------------------------------------------------------
Start-VSCode -FolderPath $fixture

# --- First init (off-camera): let the extension scaffold the workspace --------
Initialize-Workspace -FixturePath $fixture

# --- Start recording ----------------------------------------------------------
Start-Recording

# Step 1: Open Contacts sidebar
Write-Host "Step 1: Open Contacts sidebar"
Invoke-VSCodeCommand "Memoria: Focus Contacts"
Start-Sleep -Milliseconds $DelayPause

# Step 2: Browse the contact groups (Tab into webview, expand a group)
Write-Host "Step 2: Browse the contact groups"
Send-Keys "{TAB}" $DelayAfterKeystroke       # enter webview → search input
Send-Keys "{TAB}" $DelayAfterKeystroke       # → add button
Send-Keys "{TAB}" $DelayAfterKeystroke       # → first group summary
Send-Keys " " $DelayAfterKeystroke           # expand group
Start-Sleep -Milliseconds $DelayPause

# Step 3: Search for a contact
Write-Host "Step 3: Search for a contact"
Send-Keys "+{TAB}" $DelayAfterKeystroke      # → add button
Send-Keys "+{TAB}" $DelayAfterKeystroke      # → search input
Type-Text "Jane" $DelayAfterKeystroke
Start-Sleep -Milliseconds $DelayPause

# Step 4: Clear the search
Write-Host "Step 4: Clear the search"
Send-Keys "^a" $DelayAfterKeystroke          # select all in search field
Send-Keys "{BACKSPACE}" $DelayAfterKeystroke # clear the search text
Start-Sleep -Milliseconds $DelayShort

# Step 5: Add a new colleague by editing the file directly
Write-Host "Step 5: Open Colleagues.md"
Send-Keys "^p" $DelayQuickPick               # Quick Open
Type-Text "Colleagues" $DelayShort
Send-Keys "{ENTER}" $DelayAfterCommand

Write-Host "Step 5: Type new contact at end of file"
Send-Keys "^{END}" $DelayShort               # go to end of file
$newContact = @"

# alex
- Nickname: Alex
- FullName: Alex Rivera
- Title: Software Engineer
- CareerPathKey: sde
- PronounsKey: he/him
"@
Type-Text $newContact $DelayShort

Write-Host "Step 5: Save the file"
Send-Keys "^s" $DelayAfterSave

# Step 6: Show sidebar auto-refresh with the new contact
Write-Host "Step 6: Show the new contact in the sidebar"
Start-Sleep -Milliseconds $DelayPause        # wait for file watcher debounce
Invoke-VSCodeCommand "Memoria: Focus Contacts"
Start-Sleep -Milliseconds ($DelayPause * 2)

# --- Stop recording -----------------------------------------------------------
Stop-Recording -OutputFile $target
