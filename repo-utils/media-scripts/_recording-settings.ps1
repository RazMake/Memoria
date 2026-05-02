# ==============================================================================
# Shared recording settings — imported by every scenario script.
# Edit values here to change behavior for ALL recordings at once.
# ==============================================================================

# --------------- paths --------------------------------------------------------
$RepoRoot        = (Resolve-Path "$PSScriptRoot\..\..").Path
$MediaOutputDir  = Join-Path $RepoRoot "src\resources\docs\media"
$FixtureRoot     = Join-Path $env:TEMP "memoria-recording-fixtures"

# ScreenToGif portable path (download from https://www.screentogif.com/)
$ScreenToGifExe  = if ($env:SCREENTOGIF_EXE) { $env:SCREENTOGIF_EXE } else { "ScreenToGif.exe" }

# VS Code executable
$CodeExe         = if ($env:VSCODE_EXE) { $env:VSCODE_EXE } else { "code" }

# --------------- capture settings ---------------------------------------------
$CaptureWidth    = 800
$CaptureHeight   = 500
$CaptureFps      = 15     # frames per second
$RecordingLimit  = "00:00:20"   # default max duration per clip (HH:MM:SS)

# --------------- timing (milliseconds) ----------------------------------------
$DelayAfterCommand       = 1500   # wait after executing a command palette action
$DelayAfterKeystroke     = 300    # breathing room between keystrokes
$DelayPause              = 2000   # pause so the viewer can see the result
$DelayQuickPick          = 1000   # wait for QuickPick to appear
$DelayShort              = 500    # generic short delay
$DelayAfterSave          = 800    # wait after Ctrl+S

# --------------- internal state (set by Start-VSCode) -------------------------
$script:VSCodeHwnd       = [IntPtr]::Zero
$script:VSCodeProcess    = $null

# ==============================================================================
#  Win32 interop — window management
# ==============================================================================

Add-Type -AssemblyName System.Windows.Forms

if (-not ([System.Management.Automation.PSTypeName]'Win32Window').Type) {
Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;

public class Win32Window {
    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

    [DllImport("user32.dll")]
    public static extern bool MoveWindow(IntPtr hWnd, int X, int Y,
                                         int nWidth, int nHeight, bool bRepaint);

    [DllImport("user32.dll")]
    public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);

    [DllImport("user32.dll")]
    public static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll")]
    public static extern bool BringWindowToTop(IntPtr hWnd);

    [DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Auto)]
    public static extern int GetWindowText(IntPtr hWnd, StringBuilder sb, int nMaxCount);

    [DllImport("user32.dll")]
    public static extern bool IsWindow(IntPtr hWnd);

    [DllImport("user32.dll", CharSet = CharSet.Auto)]
    public static extern IntPtr SendMessage(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam);

    [DllImport("user32.dll", CharSet = CharSet.Auto)]
    public static extern IntPtr FindWindow(string lpClassName, string lpWindowName);

    public const uint WM_CLOSE = 0x0010;

    // Simulate Alt press so SetForegroundWindow works from a background process.
    [DllImport("user32.dll")]
    public static extern void keybd_event(byte bVk, byte bScan,
                                          uint dwFlags, UIntPtr dwExtraInfo);

    public const int  SW_RESTORE        = 9;
    public const byte VK_MENU           = 0x12;   // Alt key
    public const uint KEYEVENTF_KEYUP   = 0x02;

    [StructLayout(LayoutKind.Sequential)]
    public struct RECT {
        public int Left, Top, Right, Bottom;
    }

    /// <summary>
    /// Force a window to the foreground even when the caller is not the
    /// foreground process (the Alt-key trick satisfies the Win32 rule).
    /// </summary>
    public static void ForceForeground(IntPtr hWnd) {
        keybd_event(VK_MENU, 0, 0,              UIntPtr.Zero);
        keybd_event(VK_MENU, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
        ShowWindow(hWnd, SW_RESTORE);
        BringWindowToTop(hWnd);
        SetForegroundWindow(hWnd);
    }
}
"@
} # end Add-Type guard

# ==============================================================================
#  Helper functions used by every script
# ==============================================================================

function New-CleanFixture {
    <#
    .SYNOPSIS  Create (or recreate) a fresh temp folder for the scenario.
    .PARAMETER Name  Subfolder name under $FixtureRoot.
    #>
    param([string]$Name)
    $path = Join-Path $FixtureRoot $Name
    if (Test-Path $path) { Remove-Item $path -Recurse -Force }
    New-Item $path -ItemType Directory -Force | Out-Null
    return $path
}

# --------------- VS Code window management ------------------------------------

function Wait-ForVSCodeWindow {
    <#
    .SYNOPSIS  Poll until a VS Code window whose title contains $TitleHint appears.
               Stores the handle in $script:VSCodeHwnd.
    #>
    param(
        [string]$TitleHint,
        [int]$TimeoutMs = 20000
    )
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    while ($sw.ElapsedMilliseconds -lt $TimeoutMs) {
        # VS Code may spawn multiple renderer processes; pick the one with a
        # visible main window whose title contains the hint text.
        $procs = Get-Process -Name "Code" -ErrorAction SilentlyContinue |
                 Where-Object {
                     $_.MainWindowHandle -ne [IntPtr]::Zero -and
                     $_.MainWindowTitle  -ne "" -and
                     $_.MainWindowTitle  -like "*$TitleHint*"
                 }
        if ($procs) {
            $chosen = $procs | Select-Object -First 1
            $script:VSCodeHwnd    = $chosen.MainWindowHandle
            $script:VSCodeProcess = $chosen
            Write-Host "  Found VS Code window: '$($chosen.MainWindowTitle)'"
            return
        }
        Start-Sleep -Milliseconds 500
    }
    throw "Timed out after ${TimeoutMs}ms waiting for a VS Code window matching '$TitleHint'."
}

function Move-VSCodeWindow {
    <#
    .SYNOPSIS  Position and resize the VS Code window to the capture dimensions.
               Centers the window on the primary monitor when possible.
    #>
    $screenW = [System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea.Width
    $screenH = [System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea.Height
    $left    = [math]::Max(0, [math]::Floor(($screenW - $CaptureWidth)  / 2))
    $top     = [math]::Max(0, [math]::Floor(($screenH - $CaptureHeight) / 2))
    [Win32Window]::MoveWindow($script:VSCodeHwnd,
                              $left, $top,
                              $CaptureWidth, $CaptureHeight, $true) | Out-Null
    Start-Sleep -Milliseconds 300
    Write-Host "  Window positioned: ${left},${top} ${CaptureWidth}x${CaptureHeight}"
}

function Focus-VSCodeWindow {
    <#
    .SYNOPSIS  Bring the VS Code window to the foreground.
               Skips the invasive Alt-key trick if VS Code is already
               the foreground window (the Alt key activates the menu bar
               and dismisses the Command Palette).
    #>
    if ($script:VSCodeHwnd -eq [IntPtr]::Zero) { return }

    # Refresh handle — VS Code sometimes recycles its renderer process.
    $current = Get-Process -Id $script:VSCodeProcess.Id -ErrorAction SilentlyContinue
    if ($current -and $current.MainWindowHandle -ne [IntPtr]::Zero) {
        $script:VSCodeHwnd = $current.MainWindowHandle
    }

    # Only use the aggressive ForceForeground (which sends Alt) when
    # VS Code is NOT already the foreground window.
    $fg = [Win32Window]::GetForegroundWindow()
    if ($fg -eq $script:VSCodeHwnd) { return }

    [Win32Window]::ForceForeground($script:VSCodeHwnd)
    Start-Sleep -Milliseconds 150
}

function Get-VSCodeWindowRect {
    <# .SYNOPSIS  Return the current RECT of the VS Code window. #>
    $rect = New-Object Win32Window+RECT
    [Win32Window]::GetWindowRect($script:VSCodeHwnd, [ref]$rect) | Out-Null
    return $rect
}

# --------------- VS Code launch -----------------------------------------------

function Start-VSCode {
    <#
    .SYNOPSIS  Launch VS Code, wait for the window, position it, and focus it.
    #>
    param(
        [string]$FolderPath,
        [string]$WorkspaceFile,
        [switch]$NewWindow
    )
    $codeArgs = @("--new-window")
    if ($WorkspaceFile) {
        $codeArgs += $WorkspaceFile
        $titleHint = [System.IO.Path]::GetFileNameWithoutExtension($WorkspaceFile)
    } else {
        $codeArgs += $FolderPath
        $titleHint = Split-Path $FolderPath -Leaf
    }

    Write-Host "Launching VS Code …"
    & $CodeExe @codeArgs
    Wait-ForVSCodeWindow -TitleHint $titleHint
    Move-VSCodeWindow
    Focus-VSCodeWindow

    # Dismiss the "Do you trust the authors?" dialog if it appears.
    # "Yes, I trust the authors" is the default focused button — Enter accepts.
    Start-Sleep -Milliseconds 1500
    [System.Windows.Forms.SendKeys]::SendWait("{ENTER}")
    Start-Sleep -Milliseconds 1000

    # Extra settle time for extension host to start
    Start-Sleep -Milliseconds 2000
    Focus-VSCodeWindow

    # Close secondary sidebar (Chat panel) which steals focus.
    # Escape first to defocus any active input (e.g. Chat input box).
    [System.Windows.Forms.SendKeys]::SendWait("{ESCAPE}")
    Start-Sleep -Milliseconds $DelayShort
    [System.Windows.Forms.SendKeys]::SendWait("{ESCAPE}")
    Start-Sleep -Milliseconds $DelayShort

    # Close secondary sidebar via Command Palette using clipboard paste.
    Focus-VSCodeWindow
    [System.Windows.Forms.SendKeys]::SendWait("^+p")
    Start-Sleep -Milliseconds $DelayQuickPick
    [System.Windows.Forms.Clipboard]::SetText("View: Close Secondary Side Bar")
    [System.Windows.Forms.SendKeys]::SendWait("^v")
    Start-Sleep -Milliseconds $DelayShort
    [System.Windows.Forms.SendKeys]::SendWait("{ENTER}")
    Start-Sleep -Milliseconds $DelayShort

    # Final cleanup: dismiss any overlay
    Focus-VSCodeWindow
    [System.Windows.Forms.SendKeys]::SendWait("{ESCAPE}")
    Start-Sleep -Milliseconds $DelayShort
}

# --------------- Recording (ScreenToGif) --------------------------------------

function Start-Recording {
    <#
    .SYNOPSIS  Start ScreenToGif, capturing the exact VS Code window region.
    .PARAMETER Limit  Override for max recording duration (HH:MM:SS).
    #>
    param([string]$Limit)
    if (-not $Limit) { $Limit = $RecordingLimit }

    # Read VS Code's actual screen position
    $rect   = Get-VSCodeWindowRect
    $left   = $rect.Left
    $top    = $rect.Top
    $width  = $rect.Right  - $rect.Left
    $height = $rect.Bottom - $rect.Top
    $region = "$left,$top,$width,$height"

    Write-Host "Starting ScreenToGif — region $region, ${CaptureFps}fps, limit $Limit"
    & $ScreenToGifExe -n -o s -r $region -f "${CaptureFps}fps" -l $Limit -c

    # Give ScreenToGif a moment to initialise, then put VS Code back on top
    Start-Sleep -Milliseconds 1500
    Focus-VSCodeWindow
}

function Stop-Recording {
    <#
    .SYNOPSIS  Stop ScreenToGif (F7 hotkey), then automate the editor save.
               1. Puts the target path on the clipboard.
               2. Finds the ScreenToGif editor window.
               3. Sends Ctrl+S to open the save panel.
               4. Pastes the target path into the filename field.
               5. Presses Enter to trigger Save.
               If auto-save fails the path is still on the clipboard.
    #>
    param([string]$OutputFile)

    # Ensure the output directory exists
    $dir = Split-Path $OutputFile -Parent
    if ($dir -and -not (Test-Path $dir)) {
        New-Item $dir -ItemType Directory -Force | Out-Null
    }

    # Pre-load clipboard with just the filename (no extension) — ScreenToGif
    # appends .gif automatically.  The folder path field is left as-is.
    $fileNameNoExt = [System.IO.Path]::GetFileNameWithoutExtension($OutputFile)
    [System.Windows.Forms.Clipboard]::SetText($fileNameNoExt)

    # F7 is the default ScreenToGif stop-recording hotkey (global).
    [System.Windows.Forms.SendKeys]::SendWait("{F7}")

    # Wait for the ScreenToGif editor window to appear.
    Start-Sleep -Milliseconds 2000
    $stg = $null
    for ($i = 0; $i -lt 20; $i++) {
        $stg = Get-Process -Name "ScreenToGif" -ErrorAction SilentlyContinue |
               Where-Object { $_.MainWindowHandle -ne [IntPtr]::Zero -and
                              $_.MainWindowTitle -like "*ScreenToGif*" } |
               Select-Object -First 1
        if ($stg) { break }
        Start-Sleep -Milliseconds 500
    }

    if ($stg) {
        Write-Host "  Found ScreenToGif editor — automating save…"
        [Win32Window]::ForceForeground($stg.MainWindowHandle)
        Start-Sleep -Milliseconds 500

        # Ctrl+S opens the ScreenToGif save panel.
        [System.Windows.Forms.SendKeys]::SendWait("^s")
        Start-Sleep -Milliseconds 2000

        # Paste the filename (without extension) into the focused field.
        $fileNameNoExt = [System.IO.Path]::GetFileNameWithoutExtension($OutputFile)
        [System.Windows.Forms.Clipboard]::SetText($fileNameNoExt)
        [System.Windows.Forms.SendKeys]::SendWait("^a")
        Start-Sleep -Milliseconds 200
        [System.Windows.Forms.SendKeys]::SendWait("^v")
        Start-Sleep -Milliseconds 500

        # Press Enter to trigger Save.
        [System.Windows.Forms.SendKeys]::SendWait("{ENTER}")
        Start-Sleep -Milliseconds 3000

        Write-Host "  Save triggered for: $fileNameNoExt"
    } else {
        Write-Host "  Could not find ScreenToGif editor window."
    }

    Write-Host ""
    Write-Host "============================================================"
    Write-Host "  Target:  $OutputFile"
    Write-Host "============================================================"
    Write-Host ""

    # Close the demo VS Code window
    Close-DemoVSCode

    # Close ScreenToGif
    Close-ScreenToGif
}

function Close-ScreenToGif {
    <#
    .SYNOPSIS  Close all ScreenToGif windows gracefully after the recording
               has been saved.
    #>
    $stgProcs = Get-Process -Name "ScreenToGif" -ErrorAction SilentlyContinue
    if (-not $stgProcs) { return }

    Write-Host "Closing ScreenToGif…"
    foreach ($p in $stgProcs) {
        if ($p.MainWindowHandle -ne [IntPtr]::Zero) {
            # WM_CLOSE triggers ScreenToGif's in-window exit confirmation
            # dialog (a WPF modal overlay, NOT a separate Win32 window).
            [Win32Window]::SendMessage($p.MainWindowHandle, [Win32Window]::WM_CLOSE,
                                       [IntPtr]::Zero, [IntPtr]::Zero) | Out-Null
            Start-Sleep -Milliseconds 1500

            # Focus the ScreenToGif window and press Enter to confirm exit.
            # The dialog lives inside the main window, so we target the same
            # HWND — FindWindow won't find it as a separate window.
            [Win32Window]::ForceForeground($p.MainWindowHandle)
            Start-Sleep -Milliseconds 300
            [System.Windows.Forms.SendKeys]::SendWait("{ENTER}")
            Start-Sleep -Milliseconds 2000
        }
    }

    # If any ScreenToGif process is still alive, force-kill it.
    # The recording was already saved, so no data loss.
    $stgProcs = Get-Process -Name "ScreenToGif" -ErrorAction SilentlyContinue
    foreach ($p in $stgProcs) {
        if (-not $p.HasExited) {
            Write-Host "  ScreenToGif still running — killing process."
            $p.Kill()
        }
    }
}

function Close-DemoVSCode {
    <#
    .SYNOPSIS  Close only the VS Code window that was opened for recording.
               Uses WM_CLOSE on the tracked window handle so other VS Code
               windows are left untouched (the process is shared and must
               NOT be killed).
    #>
    if ($script:VSCodeHwnd -eq [IntPtr]::Zero) { return }

    Write-Host "Closing demo VS Code window…"

    # Send WM_CLOSE to the specific window — this closes only that window,
    # not the entire VS Code process.
    [Win32Window]::SendMessage($script:VSCodeHwnd, [Win32Window]::WM_CLOSE,
                               [IntPtr]::Zero, [IntPtr]::Zero) | Out-Null
    Start-Sleep -Milliseconds 1500

    # If prompted to save, dismiss with "Don't Save"
    if ([Win32Window]::IsWindow($script:VSCodeHwnd)) {
        [Win32Window]::ForceForeground($script:VSCodeHwnd)
        Start-Sleep -Milliseconds 300
        [System.Windows.Forms.SendKeys]::SendWait("d")
        Start-Sleep -Milliseconds 1000
    }

    # Verify the window is gone
    if ([Win32Window]::IsWindow($script:VSCodeHwnd)) {
        Write-Host "  Warning: window still open — sending Alt+F4 as fallback."
        [Win32Window]::ForceForeground($script:VSCodeHwnd)
        Start-Sleep -Milliseconds 300
        [System.Windows.Forms.SendKeys]::SendWait("%{F4}")
        Start-Sleep -Milliseconds 1000
        [System.Windows.Forms.SendKeys]::SendWait("d")
        Start-Sleep -Milliseconds 500
    }

    $script:VSCodeHwnd    = [IntPtr]::Zero
    $script:VSCodeProcess = $null
}

# --------------- keystroke helpers --------------------------------------------

function Send-Keys {
    <#
    .SYNOPSIS  Focus VS Code and send a hotkey sequence.
               Use ONLY for modifier combos and special keys
               (e.g. "^+p", "{ENTER}", "{DOWN}", "^s").
               For typing text, use Type-Text instead.
    .PARAMETER Keys   SendKeys-format string.
    .PARAMETER Delay  Post-keystroke delay in ms.
    #>
    param(
        [string]$Keys,
        [int]$Delay = $DelayAfterKeystroke
    )
    Focus-VSCodeWindow
    [System.Windows.Forms.SendKeys]::SendWait($Keys)
    Start-Sleep -Milliseconds $Delay
}

function Type-Text {
    <#
    .SYNOPSIS  Type text reliably into the focused VS Code input by pasting
               from the clipboard. SendKeys is unreliable for long strings
               because characters get lost or sent to the wrong input.
    .PARAMETER Text   The plain text to insert.
    .PARAMETER Delay  Post-paste delay in ms.
    #>
    param(
        [string]$Text,
        [int]$Delay = $DelayAfterKeystroke
    )
    Focus-VSCodeWindow
    [System.Windows.Forms.Clipboard]::SetText($Text)
    [System.Windows.Forms.SendKeys]::SendWait("^v")
    Start-Sleep -Milliseconds $Delay
}

function Open-CommandPalette {
    <#
    .SYNOPSIS  Open the VS Code Command Palette (Ctrl+Shift+P).
               Presses Escape first to dismiss any overlay that might steal focus
               (e.g. Copilot Chat, find widget, quick-open).
    #>
    Focus-VSCodeWindow
    # Dismiss anything that might be open
    Send-Keys "{ESCAPE}" $DelayShort
    Send-Keys "^+p" $DelayQuickPick
}

function Invoke-VSCodeCommand {
    <#
    .SYNOPSIS  Open the Command Palette, type a command name via clipboard
               paste, and press Enter.
    .PARAMETER CommandText  e.g. "Memoria: Initialize workspace".
    #>
    param([string]$CommandText)
    Open-CommandPalette
    Type-Text $CommandText $DelayShort
    Start-Sleep -Milliseconds $DelayShort
    Send-Keys "{ENTER}" $DelayAfterCommand
}

function Write-MemoriaConfig {
    <#
    .SYNOPSIS  Write a .memoria/ config directory into a fixture folder.
    .PARAMETER Root         Workspace root path.
    .PARAMETER BlueprintId  "individual-contributor" or "people-manager".
    .PARAMETER Features     Hashtable of featureId → $true/$false.
    #>
    param(
        [string]$Root,
        [string]$BlueprintId = "individual-contributor",
        [hashtable]$Features = @{}
    )
    $memoriaDir = Join-Path $Root ".memoria"
    New-Item $memoriaDir -ItemType Directory -Force | Out-Null

    # Default feature set
    $allFeatures = @(
        @{ id = "taskCollector"; name = "Task Collector"; description = "Aggregate and sync tasks"; enabled = $true }
        @{ id = "contacts"; name = "Contacts"; description = "Browse, search, and manage contacts"; enabled = $true }
        @{ id = "snippets"; name = "Snippets"; description = "Text expansion for Markdown"; enabled = $true }
        @{ id = "decorations"; name = "Explorer Decorations"; description = "Badges and colors on folders"; enabled = $true }
    )
    foreach ($f in $allFeatures) {
        if ($Features.ContainsKey($f.id)) { $f.enabled = $Features[$f.id] }
    }

    # blueprint.json
    @{
        blueprintId      = $BlueprintId
        blueprintVersion = "1.0.0"
        initializedAt    = (Get-Date -Format "o")
        lastReinitAt     = $null
        fileManifest     = @{}
        taskCollector    = @{ collectorPath = "00-Workstreams/All.todo.md" }
        contacts         = @{
            peopleFolder = "05-Autocomplete/Contacts/"
            groups       = @(
                @{ file = "Peers.md"; type = "colleague" }
                @{ file = "Colleagues.md"; type = "colleague" }
            )
        }
        snippets         = @{ snippetsFolder = "05-Autocomplete/Snippets" }
    } | ConvertTo-Json -Depth 5 | Set-Content (Join-Path $memoriaDir "blueprint.json") -Encoding UTF8

    # features.json
    @{ features = $allFeatures } | ConvertTo-Json -Depth 3 | Set-Content (Join-Path $memoriaDir "features.json") -Encoding UTF8

    # decorations.json
    @{
        rules = @(
            @{ filter = ".*/"; color = "terminal.ansiBrightBlack" }
            @{ filter = "00-Workstreams/"; color = "terminal.ansiMagenta"; badge = "W"; tooltip = "Current workstreams and todos"; propagate = $true }
            @{ filter = "01-ToRemember/"; color = "terminal.ansiYellow"; badge = "R"; tooltip = "Things to remember"; propagate = $true }
            @{ filter = "02-MeetingNotes/"; color = "terminal.ansiCyan"; badge = "M"; tooltip = "Meeting notes"; propagate = $true }
            @{ filter = "05-Autocomplete/Contacts/"; color = "terminal.ansiGreen"; badge = "C"; tooltip = "Contacts"; propagate = $true }
        )
    } | ConvertTo-Json -Depth 4 | Set-Content (Join-Path $memoriaDir "decorations.json") -Encoding UTF8

    # default-files.json
    @{
        defaultFiles = @{
            "00-Workstreams/" = @{
                filesToOpen                    = @("All.todo.md")
                closeCurrentlyOpenedFilesFirst = $true
                openSideBySide                 = $true
            }
        }
    } | ConvertTo-Json -Depth 4 | Set-Content (Join-Path $memoriaDir "default-files.json") -Encoding UTF8

    # task-collector.json
    @{
        completedRetentionDays = 30
        syncOnStartup          = $true
        include                = @("**/*.md")
        exclude                = @("**/node_modules/**")
        debounceMs             = 500
    } | ConvertTo-Json -Depth 2 | Set-Content (Join-Path $memoriaDir "task-collector.json") -Encoding UTF8

    # dotfolders.json
    @{
        managedEntries = @(".git", ".vscode")
    } | ConvertTo-Json -Depth 2 | Set-Content (Join-Path $memoriaDir "dotfolders.json") -Encoding UTF8

    # tasks-index.json
    @{
        version        = 1
        collectorPath  = "00-Workstreams/All.todo.md"
        tasks          = @{}
        collectorOrder = @{ active = @(); completed = @() }
        sourceOrders   = @{}
    } | ConvertTo-Json -Depth 3 | Set-Content (Join-Path $memoriaDir "tasks-index.json") -Encoding UTF8
}

function New-StandardWorkspace {
    <#
    .SYNOPSIS  Scaffold the standard Individual Contributor folder structure.
    .PARAMETER Root  Workspace root path.
    #>
    param([string]$Root)

    # Directories
    $dirs = @(
        ".github", ".vscode", ".memoria",
        "00-Workstreams", "00-Workstreams/Dev-Designs",
        "01-ToRemember", "01-ToRemember/Trainings",
        "02-MeetingNotes",
        "03-Inbox",
        "04-Archive",
        "05-Autocomplete", "05-Autocomplete/Contacts",
        "05-Autocomplete/Contacts/DataTypes",
        "05-Autocomplete/Snippets"
    )
    foreach ($d in $dirs) {
        New-Item (Join-Path $Root $d) -ItemType Directory -Force | Out-Null
    }

    # Collector file
    Set-Content (Join-Path $Root "00-Workstreams/All.todo.md") -Value @"
# To do

- [ ] Review Q3 roadmap proposal
- [ ] Update onboarding documentation
- [ ] Schedule design review meeting

# Completed
"@ -Encoding UTF8

    # Sample meeting notes with tasks
    Set-Content (Join-Path $Root "02-MeetingNotes/standup.md") -Value @"
# Daily Standup — 2026-04-28

## Updates
- Finished login page redesign
- [ ] Fix the login bug
- [ ] Send status update to team

## Notes
- Sprint review on Friday
"@ -Encoding UTF8

    Set-Content (Join-Path $Root "02-MeetingNotes/manager-sync.md") -Value @"
# 1:1 with Manager — 2026-04-25

## Action Items
- [ ] Draft promotion packet
- [x] Complete training module (2026-04-20)

## Discussion Points
- Career growth goals
- Project timeline adjustments
"@ -Encoding UTF8

    # Contact files
    Set-Content (Join-Path $Root "05-Autocomplete/Contacts/Peers.md") -Value @"
# jdoe
- Nickname: Jane
- FullName: Jane Doe
- Title: Senior Software Engineer
- CareerPathKey: sde
- PronounsKey: she/her

# bsmith
- Nickname: Bob
- FullName: Bob Smith
- Title: Principal Engineer
- CareerPathKey: sde
- PronounsKey: he/him
"@ -Encoding UTF8

    Set-Content (Join-Path $Root "05-Autocomplete/Contacts/Colleagues.md") -Value @"
# agarcia
- Nickname: Ana
- FullName: Ana Garcia
- Title: Product Manager
- CareerPathKey: pm
- PronounsKey: she/her

# mchen
- Nickname: Mike
- FullName: Mike Chen
- Title: Design Lead
- CareerPathKey: design
- PronounsKey: he/him
"@ -Encoding UTF8

    # DataTypes
    Set-Content (Join-Path $Root "05-Autocomplete/Contacts/DataTypes/CareerPaths.md") -Value @"
# sde
- Name: Software Engineer
- Short: SDE

# pm
- Name: Product Manager
- Short: PM

# design
- Name: Designer
- Short: Design
"@ -Encoding UTF8

    Set-Content (Join-Path $Root "05-Autocomplete/Contacts/DataTypes/Pronouns.md") -Value @"
# she/her
- Subject: she
- Object: her
- PossessiveAdjective: her
- Possessive: hers
- Reflexive: herself

# he/him
- Subject: he
- Object: him
- PossessiveAdjective: his
- Possessive: his
- Reflexive: himself
"@ -Encoding UTF8

    # Sample markdown for snippets demos
    Set-Content (Join-Path $Root "03-Inbox/scratch.md") -Value @"
# Scratch Pad

Use this file to try snippets.

"@ -Encoding UTF8

    # Weekly notes for copy-child demo
    Set-Content (Join-Path $Root "01-ToRemember/weekly-notes.md") -Value @"
# Weekly Notes

## Week 18
- Completed API migration
- Started performance testing
- [ ] Write test summary report

## Week 17
- Deployed v2.1 to staging
- Fixed 3 critical bugs
- Updated runbooks
"@ -Encoding UTF8

    # .vscode/settings.json for clean theme
    Set-Content (Join-Path $Root ".vscode/settings.json") -Value @"
{
    "workbench.colorTheme": "Default Dark Modern",
    "editor.minimap.enabled": false,
    "editor.fontSize": 14,
    "window.zoomLevel": 0,
    "workbench.secondarySideBar.visible": false,
    "chat.commandCenter.enabled": false,
    "workbench.startupEditor": "none",
    "workbench.tips.enabled": false,
    "security.workspace.trust.enabled": false
}
"@ -Encoding UTF8

    # Write .memoria config
    Write-MemoriaConfig -Root $Root
}

function New-PeopleManagerWorkspace {
    <#
    .SYNOPSIS  Scaffold the People Manager folder structure (extends standard).
    .PARAMETER Root  Workspace root path.
    #>
    param([string]$Root)

    # Start with standard structure
    New-StandardWorkspace -Root $Root

    # Add people-manager-specific directories
    $pmDirs = @(
        "00-Workstreams/Planning",
        "00-Workstreams/Team-Evaluations",
        "01-ToRemember/Hiring",
        "01-ToRemember/Evaluation"
    )
    foreach ($d in $pmDirs) {
        New-Item (Join-Path $Root $d) -ItemType Directory -Force | Out-Null
    }

    # Add Team.md (direct reports)
    Set-Content (Join-Path $Root "05-Autocomplete/Contacts/Team.md") -Value @"
# mvhouse
- Nickname: Michael
- FullName: Michael Von House
- Title: Program Manager 2
- CareerPathKey: pm
- LevelId: l3
- LevelStartDate: 2025-06-01
- PronounsKey: he/him

# ljohnson
- Nickname: Lisa
- FullName: Lisa Johnson
- Title: Software Engineer
- CareerPathKey: sde
- LevelId: l2
- LevelStartDate: 2025-01-15
- PronounsKey: she/her
"@ -Encoding UTF8

    # Update blueprint config for people-manager
    Write-MemoriaConfig -Root $Root -BlueprintId "people-manager"

    # Update contacts config to include Team.md
    $bpPath = Join-Path $Root ".memoria/blueprint.json"
    $bp = Get-Content $bpPath -Raw | ConvertFrom-Json
    $bp.contacts.groups = @(
        @{ file = "Team.md"; type = "report" }
        @{ file = "Peers.md"; type = "colleague" }
        @{ file = "Colleagues.md"; type = "colleague" }
    )
    $bp | ConvertTo-Json -Depth 5 | Set-Content $bpPath -Encoding UTF8
}

Write-Host "Recording settings loaded from: $PSScriptRoot\_recording-settings.ps1"
Write-Host "  Output dir : $MediaOutputDir"
Write-Host "  Capture    : ${CaptureWidth}x${CaptureHeight} (centred)"
Write-Host "  FPS        : $CaptureFps"
Write-Host ""
