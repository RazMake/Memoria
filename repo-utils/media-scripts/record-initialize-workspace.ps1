# Recording script: Initialize workspace
# ========================================
# Shows: Command Palette → blueprint selection → scaffolded result
#
# Steps:
#   1. Open the Command Palette (Ctrl+Shift+P)
#   2. Type "Memoria: Initialize workspace" and select it
#   3. Wait for the blueprint picker to appear
#   4. Browse the list briefly, then select "Individual Contributor Notebook"
#   5. Wait for scaffolding to complete (progress notification)
#   6. Show the Explorer panel with the newly created folder structure
#   7. Pause briefly to let the viewer see the result

$ErrorActionPreference = "Stop"
. "$PSScriptRoot\_recording-settings.ps1"

$target        = Join-Path $DocsDir "commands/media/initialize-workspace.gif"
$targetCopy    = Join-Path $DocsDir "media/initialize-workspace.gif"
$fixture  = New-CleanFixture "initialize-workspace"

# --- Setup: empty folder with theme settings ----------------------------------
New-Item (Join-Path $fixture ".vscode") -ItemType Directory -Force | Out-Null
Set-Content (Join-Path $fixture ".vscode/settings.json") -Value @"
{
    "workbench.colorTheme": "Default Dark Modern",
    "editor.minimap.enabled": false,
    "editor.fontSize": 14,
    "workbench.secondarySideBar.visible": false,
    "chat.commandCenter.enabled": false,
    "workbench.startupEditor": "none",
    "workbench.tips.enabled": false,
    "security.workspace.trust.enabled": false,
    "problems.decorations.enabled": false
}
"@ -Encoding UTF8

# --- Launch VS Code -----------------------------------------------------------
Start-VSCode -FolderPath $fixture

# --- Start recording ----------------------------------------------------------
Start-Recording

# Focus Explorer
Send-Keys "^+e" $DelayShort

# Step 1: Open Command Palette
Open-CommandPalette

# Step 2-3: Type and select the command
Type-Text "Memoria: Initialize workspace" $DelayShort
Start-Sleep -Milliseconds $DelayShort
Send-Keys "{ENTER}" $DelayQuickPick

# Step 4: Blueprint picker — browse, then select
Start-Sleep -Milliseconds $DelayPause
Send-Keys "{DOWN}" $DelayAfterKeystroke
Send-Keys "{DOWN}" $DelayAfterKeystroke
Send-Keys "{UP}" $DelayAfterKeystroke
Send-Keys "{UP}" $DelayAfterKeystroke
Start-Sleep -Milliseconds $DelayShort
Send-Keys "{ENTER}" $DelayAfterCommand

# Step 5: Wait for scaffolding
Start-Sleep -Milliseconds ($DelayPause * 2)

# Step 6: Focus Explorer to show folder structure
Send-Keys "^+e" $DelayPause

# Step 7: Pause for viewer
Start-Sleep -Milliseconds ($DelayPause * 2)

# --- Stop recording -----------------------------------------------------------
Stop-Recording -OutputFile $target

# Copy to docs/media/ (referenced by getting-started.md too)
if (Test-Path $target) {
    $copyDir = Split-Path $targetCopy -Parent
    if (-not (Test-Path $copyDir)) { New-Item $copyDir -ItemType Directory -Force | Out-Null }
    Copy-Item $target $targetCopy -Force
    Write-Host "  Copied to: $targetCopy"
}
