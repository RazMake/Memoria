# Recording script: Snippets autocomplete (date/time)
# =====================================================
# Shows: Typing snippet triggers, selecting from autocomplete, choosing format
#
# Steps:
#   1. Open a Markdown file and position the cursor in the body
#   2. Type "{date}" — autocomplete popup appears with "Date" snippet
#   3. Select the "Date" snippet from the list
#   4. A QuickPick appears with format options (YYYY-MM-dd, etc.)
#   5. Select "YYYY-MM-dd" — current date is inserted
#   6. Press Enter to start a new line
#   7. Type "{time}" — select the "Time" snippet
#   8. Choose a time format — current time is inserted
#   9. Press Enter, type "{now}" — select "Date & Time" — timestamp inserted
#  10. Pause to show the three expanded snippets

$ErrorActionPreference = "Stop"
. "$PSScriptRoot\_recording-settings.ps1"

$target   = Join-Path $DocsDir "features/media/snippets-autocomplete.gif"
$fixture  = New-CleanFixture "snippets-autocomplete"

# --- Setup: clean folder with VS Code settings --------------------------------
Write-RecordingSettings -Root $fixture

# --- Launch VS Code -----------------------------------------------------------
Start-VSCode -FolderPath $fixture

# --- First init (off-camera): let the extension scaffold the workspace --------
Initialize-Workspace -FixturePath $fixture

# --- Create a scratch file for the demo (off-camera) -------------------------
Set-Content (Join-Path $fixture "03-Inbox/scratch.md") -Value @"
# Scratch Pad

Use this file to try snippets.

"@ -Encoding UTF8

# Open scratch file
Send-Keys "^p" $DelayQuickPick
Type-Text "scratch" $DelayShort
Send-Keys "{ENTER}" $DelayAfterCommand

# Position cursor at end of file
Send-Keys "^{END}" $DelayShort
Send-Keys "{ENTER}" $DelayAfterKeystroke

# --- Start recording ----------------------------------------------------------
Start-Recording

# Step 2: Type {date} trigger
Type-Text "{date}" $DelayShort
Start-Sleep -Milliseconds $DelayQuickPick

# Step 3: Select from autocomplete
Send-Keys "{ENTER}" $DelayQuickPick

# Step 4-5: Select format
Start-Sleep -Milliseconds $DelayQuickPick
Send-Keys "{ENTER}" $DelayAfterCommand       # select first format (YYYY-MM-dd)
Start-Sleep -Milliseconds $DelayPause

# Step 6: New line
Send-Keys "{ENTER}" $DelayAfterKeystroke

# Step 7: Type {time} trigger
Type-Text "{time}" $DelayShort
Start-Sleep -Milliseconds $DelayQuickPick
Send-Keys "{ENTER}" $DelayQuickPick

# Step 8: Select time format
Start-Sleep -Milliseconds $DelayQuickPick
Send-Keys "{ENTER}" $DelayAfterCommand
Start-Sleep -Milliseconds $DelayPause

# Step 9: New line, type {now}
Send-Keys "{ENTER}" $DelayAfterKeystroke
Type-Text "{now}" $DelayShort
Start-Sleep -Milliseconds $DelayQuickPick
Send-Keys "{ENTER}" $DelayQuickPick

Start-Sleep -Milliseconds $DelayQuickPick
Send-Keys "{ENTER}" $DelayAfterCommand

# Step 10: Pause to show result
Start-Sleep -Milliseconds ($DelayPause * 2)

# --- Stop recording -----------------------------------------------------------
Stop-Recording -OutputFile $target
