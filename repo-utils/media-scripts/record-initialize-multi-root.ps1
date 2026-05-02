# Recording script: Initialize multi-root workspace
# ===================================================
# Shows: Same initialization flow but in a multi-root workspace
#
# Steps:
#   1. Show the Explorer panel with multiple workspace roots visible
#   2. Open the Command Palette (Ctrl+Shift+P)
#   3. Type "Memoria: Initialize workspace" and select it
#   4. Select a blueprint (e.g., "People Manager Notebook")
#   5. If prompted, choose the target root folder
#   6. Wait for scaffolding to complete
#   7. Show the Explorer — folders created across the workspace roots
#   8. Pause briefly to let the viewer see the result

$ErrorActionPreference = "Stop"
. "$PSScriptRoot\_recording-settings.ps1"

$target   = Join-Path $MediaOutputDir "initialize-multi-root.gif"
$fixture  = New-CleanFixture "initialize-multi-root"

# --- Setup: 3 empty workspace root folders + .code-workspace file ------------
$root1 = Join-Path $fixture "Work-Notebook"
$root2 = Join-Path $fixture "Side-Project"
$root3 = Join-Path $fixture "Personal-Notes"
foreach ($r in @($root1, $root2, $root3)) {
    New-Item $r -ItemType Directory -Force | Out-Null
}

New-Item (Join-Path $root1 ".vscode") -ItemType Directory -Force | Out-Null
Set-Content (Join-Path $root1 ".vscode/settings.json") -Value @"
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

$wsFile = Join-Path $fixture "demo.code-workspace"
Set-Content $wsFile -Value @"
{
    "folders": [
        { "path": "Work-Notebook" },
        { "path": "Side-Project" },
        { "path": "Personal-Notes" }
    ],
    "settings": {
        "workbench.colorTheme": "Default Dark Modern",
        "editor.minimap.enabled": false,
        "workbench.secondarySideBar.visible": false,
        "chat.commandCenter.enabled": false,
        "workbench.startupEditor": "none",
        "workbench.tips.enabled": false,
        "security.workspace.trust.enabled": false
    }
}
"@ -Encoding UTF8

# --- Launch VS Code with workspace file ---------------------------------------
Start-VSCode -WorkspaceFile $wsFile

# --- Start recording ----------------------------------------------------------
Start-Recording

# Step 1: Show Explorer with multiple roots
Send-Keys "^+e" $DelayPause

# Step 2-3: Run initialize command
Invoke-VSCodeCommand "Memoria: Initialize workspace"

# Step 4: Select blueprint
Start-Sleep -Milliseconds $DelayQuickPick
Send-Keys "{DOWN}" $DelayAfterKeystroke
Send-Keys "{ENTER}" $DelayAfterCommand

# Step 5: Select target root folder
Start-Sleep -Milliseconds $DelayQuickPick
Send-Keys "{ENTER}" $DelayAfterCommand

# Step 6: Wait for scaffolding
Start-Sleep -Milliseconds ($DelayPause * 2)

# Step 7: Focus Explorer
Send-Keys "^+e" $DelayPause

# Step 8: Pause for viewer
Start-Sleep -Milliseconds ($DelayPause * 2)

# --- Stop recording -----------------------------------------------------------
Stop-Recording -OutputFile $target
