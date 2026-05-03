# Recording script: Snippets autocomplete
# ==========================================
# Shows: { copy-child heading snippet, @ contact snippets, { date/time snippets
#
# Steps:
#   1. Open a Markdown file with project headings
#   2. Go to start of file, type "# Today" heading, press Enter
#   3. Type "{" then "copy" — Copy Child Heading finds H2s under next H1
#   4. QuickPick lists sub-headings — select one — block inserted
#   5. Go to "# Test snippets" section
#   6. Type "@" then chars — autocomplete shows contact snippets
#   7. Select a contact — QuickPick for format — name inserted
#   8. New line, type "{" then "date" — select Date snippet, pick format
#   9. New line, type "{" then "now" — Date & Time — timestamp inserted
#  10. Pause to show the expanded snippets

$ErrorActionPreference = "Stop"
. "$PSScriptRoot\_recording-settings.ps1"

$target   = Join-Path $DocsDir "features/media/snippets-autocomplete.gif"
$fixture  = New-CleanFixture "snippets-autocomplete"

# --- Helper: type characters one-by-one so autocomplete fires -----------------
function Type-Chars {
    <#
    .SYNOPSIS  Send each character individually via SendKeys so VS Code's
               CompletionItemProvider sees the trigger and updates the list.
               Use this instead of Type-Text for snippet trigger strings.
    .PARAMETER Text   Plain text (no SendKeys escaping needed for alpha chars).
    .PARAMETER Delay  Delay in ms between each character.
    #>
    param(
        [string]$Text,
        [int]$Delay = 150
    )
    Focus-VSCodeWindow
    foreach ($ch in $Text.ToCharArray()) {
        [System.Windows.Forms.SendKeys]::SendWait($ch.ToString())
        Start-Sleep -Milliseconds $Delay
    }
}

# --- Setup: clean folder with VS Code settings --------------------------------
Write-RecordingSettings -Root $fixture

# --- Launch VS Code -----------------------------------------------------------
Start-VSCode -FolderPath $fixture

# --- First init (off-camera): let the extension scaffold the workspace --------
Invoke-VSCodeCommand "Memoria: Initialize workspace"
Start-Sleep -Milliseconds 3000                     # generous wait for blueprint picker
Focus-VSCodeWindow
Start-Sleep -Milliseconds 500
[System.Windows.Forms.SendKeys]::SendWait("{DOWN}")
Start-Sleep -Milliseconds 500
[System.Windows.Forms.SendKeys]::SendWait("{ENTER}")
Start-Sleep -Milliseconds $DelayAfterCommand
Wait-ForPath (Join-Path $fixture ".memoria/blueprint.json") 30000

# --- Create a demo file with project headings ---------------------------------
Set-Content (Join-Path $fixture "03-Inbox/scratch.md") -Value @"
# Yesterday
## Project 1
Minor progress on project 1
## Project 2
Status: Completed
## Project 3
Talked to the stakeholders to identify the scoped goals.

# Day before yesterday
## Project 1
Good progress on project 1
## Project 2
Estimate we'll finish tomorrow.
## Project 3
In trouble, we wont be able to meet the deadlines as is.

# Test snippets

"@ -Encoding UTF8

# Open scratch file
Send-Keys "^p" $DelayQuickPick
Type-Text "scratch" $DelayShort
Send-Keys "{ENTER}" $DelayAfterCommand

# --- Start recording ----------------------------------------------------------
Start-Recording

# --- Part 1: {copy-child} snippet — cursor at top, add # Today, then trigger ---
Write-Host "Step 1: Go to start of file and type # Today heading"
Send-Keys "^{HOME}" $DelayShort             # go to start of file
Type-Text "# Today" $DelayShort
Send-Keys "{ENTER}" $DelayAfterKeystroke     # blank line 1
Send-Keys "{ENTER}" $DelayAfterKeystroke     # blank line 2
Send-Keys "{ENTER}" $DelayAfterKeystroke     # blank line 3
Send-Keys "{UP}" $DelayAfterKeystroke        # move up 1
Send-Keys "{UP}" $DelayAfterKeystroke        # move up 2 — cursor on empty line under # Today

Write-Host "Step 2: Type { trigger + copy"
Send-Keys "{{}" $DelayShort                  # trigger char
Type-Chars "copy" 150                        # filter to Copy Child Heading
Start-Sleep -Milliseconds $DelayQuickPick

Write-Host "Step 3: Select Copy Child Heading snippet"
Send-Keys "{ENTER}" $DelayQuickPick          # select Copy Child Heading
Start-Sleep -Milliseconds $DelayQuickPick    # wait for sub-heading QuickPick

Write-Host "Step 3: Select sub-heading — Project 1"
Send-Keys "{ENTER}" $DelayAfterCommand       # first sub-heading
Start-Sleep -Milliseconds $DelayPause

# --- Part 2: @ contact snippet — go to # Test snippets section ----------------
Write-Host "Step 4: Go to # Test snippets section"
Send-Keys "^{END}" $DelayShort               # go to end of file
Send-Keys "{ENTER}" $DelayAfterKeystroke

Write-Host "Step 5: Type @ trigger + jane"
Send-Keys "@" $DelayShort                    # trigger char fires completion provider
Type-Chars "jane" 150                        # filter to Jane Doe
Start-Sleep -Milliseconds $DelayQuickPick

Write-Host "Step 6: Select contact from autocomplete"
Send-Keys "{ENTER}" $DelayQuickPick          # select Jane Doe
Start-Sleep -Milliseconds $DelayQuickPick    # wait for format QuickPick

Write-Host "Step 6: Select format — Nickname"
Send-Keys "{ENTER}" $DelayAfterCommand       # first option: Nickname
Start-Sleep -Milliseconds $DelayPause

# --- Part 3: {date} snippet --------------------------------------------------
Write-Host "Step 7: New line + type { trigger + date"
Send-Keys "^{END}" $DelayShort               # go to end of file
Send-Keys "{ENTER}" $DelayAfterKeystroke
Send-Keys "{{}" $DelayShort                  # trigger char (escaped for SendKeys)
Type-Chars "date" 150                        # filter to Date
Start-Sleep -Milliseconds $DelayQuickPick

Write-Host "Step 8: Select Date snippet"
Send-Keys "{ENTER}" $DelayQuickPick          # select Date
Start-Sleep -Milliseconds $DelayQuickPick    # wait for format QuickPick

Write-Host "Step 8: Select format — YYYY-MM-dd"
Send-Keys "{ENTER}" $DelayAfterCommand       # first option: YYYY-MM-dd
Start-Sleep -Milliseconds $DelayPause

# --- Part 4: {now} snippet — no parameters -----------------------------------
Write-Host "Step 9: New line + type { trigger + now"
Send-Keys "^{END}" $DelayShort               # go to end of file
Send-Keys "{ENTER}" $DelayAfterKeystroke
Send-Keys "{{}" $DelayShort                  # trigger char
Type-Chars "now" 150                         # filter to Date & Time
Start-Sleep -Milliseconds $DelayQuickPick

Write-Host "Step 10: Select Date & Time snippet"
Send-Keys "{ENTER}" $DelayAfterCommand       # select Date & Time (no params)
Start-Sleep -Milliseconds ($DelayPause * 2)

# --- Stop recording -----------------------------------------------------------
Stop-Recording -OutputFile $target
