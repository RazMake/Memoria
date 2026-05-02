# Recording script: Copy Child Heading snippet
# ===============================================
# Shows: Using {copy-child} to duplicate a sub-heading section
#
# Steps:
#   1. Open a Markdown file with a heading that has sub-headings
#   2. Position the cursor at the end of the parent heading line
#   3. Type "{copy-child}" — autocomplete popup appears
#   4. Select the snippet
#   5. QuickPick lists the sub-headings ("Week 18", "Week 17")
#   6. Select "Week 18"
#   7. The full content of the section is inserted at the cursor
#   8. Pause to show the duplicated section

$ErrorActionPreference = "Stop"
. "$PSScriptRoot\_recording-settings.ps1"

$target   = Join-Path $MediaOutputDir "snippets-copy-child.gif"
$fixture  = New-CleanFixture "snippets-copy-child"

# --- Setup: initialized workspace with weekly notes --------------------------
New-StandardWorkspace -Root $fixture

# --- Launch VS Code -----------------------------------------------------------
Start-VSCode -FolderPath $fixture

# Open weekly notes file
Send-Keys "^p" $DelayQuickPick
Type-Text "weekly-notes" $DelayShort
Send-Keys "{ENTER}" $DelayAfterCommand

# Position cursor at the end of "# Weekly Notes" heading
Send-Keys "^{HOME}" $DelayShort              # go to top
Send-Keys "{END}" $DelayShort                # end of first line
Send-Keys "{ENTER}" $DelayAfterKeystroke     # new line below heading
Send-Keys "{ENTER}" $DelayAfterKeystroke     # blank line

# --- Start recording ----------------------------------------------------------
Start-Recording

Start-Sleep -Milliseconds $DelayPause

# Step 3: Type {copy-child} trigger
Type-Text "{copy-child}" $DelayShort
Start-Sleep -Milliseconds $DelayQuickPick

# Step 4: Select from autocomplete
Send-Keys "{ENTER}" $DelayQuickPick

# Step 5-6: QuickPick with sub-headings — select "Week 18"
Start-Sleep -Milliseconds $DelayQuickPick
Send-Keys "{ENTER}" $DelayAfterCommand       # select first child (Week 18)

# Step 7-8: Pause to show duplicated section
Start-Sleep -Milliseconds ($DelayPause * 3)

# --- Stop recording -----------------------------------------------------------
Stop-Recording -OutputFile $target
