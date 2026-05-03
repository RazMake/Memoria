# Recording script: Contacts sidebar overview
# ==============================================
# Shows: Browsing, searching, and managing contacts from the sidebar
#
# Steps:
#   1. Open the Contacts sidebar panel
#   2. Show the grouped list of contacts (Team.md, Colleagues.md)
#   3. Use the search box — type a name fragment, show filtered results
#   4. Clear the search
#   5. Click the "+" button to add a new person
#   6. Select a group, fill in a few fields (nickname, full name)
#   7. Save the contact — it appears in the sidebar list
#   8. Click an existing contact row to open the edit form
#   9. Show the inline action icons (edit, move, delete) on hover

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
# Use Command Palette to focus the Contacts view
Invoke-VSCodeCommand "Memoria: Focus Contacts"
Start-Sleep -Milliseconds $DelayPause

# Step 2: Browse the contact groups
Send-Keys "{DOWN}" $DelayAfterKeystroke
Send-Keys "{DOWN}" $DelayAfterKeystroke
Send-Keys "{RIGHT}" $DelayAfterKeystroke     # expand a group
Send-Keys "{DOWN}" $DelayAfterKeystroke
Send-Keys "{DOWN}" $DelayAfterKeystroke
Start-Sleep -Milliseconds $DelayPause

# Step 3: Search for a contact
# Use the tree view filter (Ctrl+F in sidebar or type to filter)
Send-Keys "^f" $DelayShort
Type-Text "John" $DelayAfterKeystroke
Start-Sleep -Milliseconds $DelayPause

# Step 4: Clear the search
Send-Keys "{ESCAPE}" $DelayShort
Start-Sleep -Milliseconds $DelayShort

# Step 5-7: Add a new contact via Command Palette
Invoke-VSCodeCommand "Memoria: Add Person"
Start-Sleep -Milliseconds $DelayQuickPick

# Select group
Send-Keys "{ENTER}" $DelayQuickPick

# Fill in fields — nickname
Type-Text "alex" $DelayAfterKeystroke
Send-Keys "{ENTER}" $DelayQuickPick

# Full name
Type-Text "Alex Rivera" $DelayAfterKeystroke
Send-Keys "{ENTER}" $DelayQuickPick

# Title
Type-Text "Software Engineer" $DelayAfterKeystroke
Send-Keys "{ENTER}" $DelayAfterCommand

Start-Sleep -Milliseconds $DelayPause

# Step 8-9: Show contacts list again
Invoke-VSCodeCommand "Memoria: Focus Contacts"
Start-Sleep -Milliseconds $DelayPause

Send-Keys "{DOWN}" $DelayAfterKeystroke
Send-Keys "{DOWN}" $DelayAfterKeystroke
Start-Sleep -Milliseconds ($DelayPause * 2)

# --- Stop recording -----------------------------------------------------------
Stop-Recording -OutputFile $target
