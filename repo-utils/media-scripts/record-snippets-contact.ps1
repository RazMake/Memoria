# Recording script: Contact snippets (@-trigger)
# ================================================
# Shows: Typing @ followed by a name, selecting a contact, choosing format
#
# Steps:
#   1. Open a Markdown file and position the cursor
#   2. Type "@" — autocomplete popup appears with contact names
#   3. Continue typing a name fragment (e.g., "@jd") to filter
#   4. Select a contact from the list (e.g., "Jane Doe")
#   5. QuickPick appears with format options
#   6. Select "Full Name (title)" — formatted text is inserted
#   7. Hover over the inserted text — tooltip shows contact info
#   8. Press Ctrl+Shift+H to show detailed contact hover

$ErrorActionPreference = "Stop"
. "$PSScriptRoot\_recording-settings.ps1"

$target   = Join-Path $MediaOutputDir "snippets-contact.gif"
$fixture  = New-CleanFixture "snippets-contact"

# --- Setup: initialized workspace with contacts and snippets -----------------
New-StandardWorkspace -Root $fixture

# --- Launch VS Code -----------------------------------------------------------
Start-VSCode -FolderPath $fixture

# Open scratch file
Send-Keys "^p" $DelayQuickPick
Type-Text "scratch" $DelayShort
Send-Keys "{ENTER}" $DelayAfterCommand

Send-Keys "^{END}" $DelayShort
Send-Keys "{ENTER}" $DelayAfterKeystroke

# --- Start recording ----------------------------------------------------------
Start-Recording

# Step 2: Type @ trigger
Type-Text "@" $DelayShort
Start-Sleep -Milliseconds $DelayQuickPick

# Step 3: Filter by typing name fragment
Type-Text "jd" $DelayAfterKeystroke
Start-Sleep -Milliseconds $DelayQuickPick

# Step 4: Select contact
Send-Keys "{ENTER}" $DelayQuickPick

# Step 5-6: Select format
Start-Sleep -Milliseconds $DelayQuickPick
Send-Keys "{DOWN}" $DelayAfterKeystroke      # browse formats
Send-Keys "{DOWN}" $DelayAfterKeystroke
Send-Keys "{ENTER}" $DelayAfterCommand       # select Full Name (title)

Start-Sleep -Milliseconds $DelayPause

# Step 7: Hover over inserted text (move cursor back over it)
Send-Keys "{HOME}" $DelayShort
# Trigger hover with Ctrl+K Ctrl+I (VS Code show hover)
Send-Keys "^k" $DelayShort
Send-Keys "^i" $DelayShort
Start-Sleep -Milliseconds ($DelayPause * 2)

# Step 8: Dismiss hover and show detailed view
Send-Keys "{ESCAPE}" $DelayShort
Start-Sleep -Milliseconds ($DelayPause * 2)

# --- Stop recording -----------------------------------------------------------
Stop-Recording -OutputFile $target
