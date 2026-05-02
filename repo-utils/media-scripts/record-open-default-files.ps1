# Recording script: Open default files
# =======================================
# Shows: Right-click → files open side by side
#
# Steps:
#   1. Show the Explorer with the folder structure and some editors open
#   2. Right-click a folder that has default files configured
#   3. Select "Open default file(s)" from the context menu
#   4. If unsaved files prompt appears, show the save checkbox picker
#   5. Current editors close and the default files open side by side
#   6. Pause to show the result

$ErrorActionPreference = "Stop"
. "$PSScriptRoot\_recording-settings.ps1"

$target   = Join-Path $MediaOutputDir "open-default-files.gif"
$fixture  = New-CleanFixture "open-default-files"

# --- Setup: initialized workspace with default files -------------------------
New-StandardWorkspace -Root $fixture

# Add a second file for side-by-side effect
Set-Content (Join-Path $fixture "00-Workstreams/Dev-Designs/design-notes.md") -Value @"
# Design Notes

## API v2 Migration
- REST to GraphQL for user-facing endpoints
"@ -Encoding UTF8

# --- Launch VS Code -----------------------------------------------------------
Start-VSCode -FolderPath $fixture

# Open some files first so we can show them being replaced
Send-Keys "^p" $DelayQuickPick
Type-Text "standup" $DelayShort
Send-Keys "{ENTER}" $DelayAfterCommand

Send-Keys "^p" $DelayQuickPick
Type-Text "weekly" $DelayShort
Send-Keys "{ENTER}" $DelayAfterCommand
Start-Sleep -Milliseconds $DelayShort

# --- Start recording ----------------------------------------------------------
Start-Recording

# Step 1: Show Explorer with editors open
Send-Keys "^+e" $DelayPause

# Step 2-3: Use Command Palette since right-click is hard to automate
Invoke-VSCodeCommand "Memoria: Open default files"

# Step 4-5: If folder picker appears, select 00-Workstreams
Start-Sleep -Milliseconds $DelayQuickPick
Send-Keys "{ENTER}" $DelayAfterCommand

# Wait for files to open
Start-Sleep -Milliseconds ($DelayPause * 2)

# Step 6: Pause for viewer
Start-Sleep -Milliseconds ($DelayPause * 2)

# --- Stop recording -----------------------------------------------------------
Stop-Recording -OutputFile $target
