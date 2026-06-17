<#
.SYNOPSIS
    Thin wrapper around the Memoria template CLI.
    Reads .memoria/engine-config.json to locate Node and the CLI automatically.

.DESCRIPTION
    Supported verbs:
      render          Render a template to stdout or --Out <file>.
      invoke          Resolve a single function or named template entry.
      describe        Print the input schema (qualified keys, kinds, options) as JSON.
      list-templates  List all available templates as JSON.
      collect         Walk through a template's inputs interactively, handling
                      dynamic (cascaded) options automatically, and output the
                      collected --params JSON. Pipe the result into render:
                        .\Invoke-Template.ps1 collect "Interview/Feedback.md" |
                            .\Invoke-Template.ps1 render "Interview/Feedback.md" -Params ($input | ConvertFrom-Json)

.PARAMETER Verb
    The CLI verb: render, invoke, describe, list-templates, or collect.

.PARAMETER Target
    Template path (render / describe / collect), function call, or "path#name" reference (invoke).

.PARAMETER Params
    Hashtable of pre-supplied input values, e.g. @{ "candidate.person" = "Alice" }.
    Keys are the qualified input names returned by 'describe'.

.PARAMETER Out
    Output file path (render only). Resolved relative to the current directory.

.PARAMETER Force
    Allow overwriting an existing --Out file (render only).

.EXAMPLE
    .\Invoke-Template.ps1 render "Interview/Feedback.md" -Params @{ "candidate.person" = "Alice" }

.EXAMPLE
    .\Invoke-Template.ps1 list-templates

.EXAMPLE
    .\Invoke-Template.ps1 describe "Interview/Feedback.md"

.EXAMPLE
    .\Invoke-Template.ps1 collect "Interview/Feedback.md"

.EXAMPLE
    .\Invoke-Template.ps1 render "Notes/StandUp.md" -Out "01-MeetingNotes/standup.md"
#>
[CmdletBinding()]
param (
    [Parameter(Mandatory, Position = 0)]
    [ValidateSet('render', 'invoke', 'describe', 'list-templates', 'collect')]
    [string] $Verb,

    [Parameter(Position = 1)]
    [string] $Target = '',

    [hashtable] $Params = @{},

    [string] $Out = '',

    [switch] $Force
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# ── Workspace root ────────────────────────────────────────────────────────────
# Script lives at <root>/13-Scripts/Utils/Invoke-Template.ps1, so the root is
# two levels up. Resolve to an absolute path to be cwd-independent.
$scriptDir     = Split-Path -Parent $MyInvocation.MyCommand.Path
$workspaceRoot = (Resolve-Path (Join-Path $scriptDir '..\..')).Path

# ── Engine discovery ──────────────────────────────────────────────────────────
$configPath = Join-Path $workspaceRoot '.memoria' 'engine-config.json'
$node       = $null
$cli        = $null

if (Test-Path $configPath) {
    $cfg = Get-Content $configPath -Raw | ConvertFrom-Json
    if ((Test-Path -LiteralPath $cfg.node) -and (Test-Path -LiteralPath $cfg.cli)) {
        $node = $cfg.node
        $cli  = $cfg.cli
    }
}

if (-not $node) {
    # Fall back: node on PATH + newest installed Memoria CLI.
    $nodeCmd = Get-Command node -ErrorAction SilentlyContinue
    if (-not $nodeCmd) {
        throw (
            'Cannot locate Node.js. ' +
            'Ensure it is on PATH, or open this workspace in VS Code to refresh .memoria/engine-config.json.'
        )
    }
    $node = $nodeCmd.Source

    $extensionsRoot = Join-Path $env:USERPROFILE '.vscode' 'extensions'
    $cli = Get-ChildItem (Join-Path $extensionsRoot 'razm*' 'dist' 'template-cli.cjs') `
        -ErrorAction SilentlyContinue |
        Sort-Object FullName -Descending |
        Select-Object -First 1 -ExpandProperty FullName

    if (-not $cli) {
        throw (
            'Cannot locate template-cli.cjs. ' +
            'Open this workspace in VS Code to refresh .memoria/engine-config.json.'
        )
    }
}

# ── collect verb ──────────────────────────────────────────────────────────────
# Walks through a template's inputs interactively, re-running describe after
# each batch of answers to resolve dynamic (cascaded) option lists.
if ($Verb -eq 'collect') {
    if (-not $Target) {
        throw "collect requires a <templatePath> argument."
    }

    $answers = @{}

    # Loop until all inputs are resolved — dynamic inputs may appear after earlier picks.
    $maxPasses = 10
    for ($pass = 0; $pass -lt $maxPasses; $pass++) {
        $paramsArg = if ($answers.Count) { @('--params', ($answers | ConvertTo-Json -Compress)) } else { @() }
        $schema    = (& $node $cli describe $Target @paramsArg --root $workspaceRoot) | ConvertFrom-Json

        $pendingInputs = $schema | Where-Object { -not $answers.ContainsKey($_.key) }
        if (-not $pendingInputs) { break }

        $anyAnswered = $false
        foreach ($input in $pendingInputs) {
            if ($input.dynamic) {
                # Options not yet resolvable — need earlier answers first; skip for now.
                continue
            }

            if ($input.kind -eq 'pick' -and $input.options) {
                $i = 1
                Write-Host "`n$($input.label) [$($input.key)]:" -ForegroundColor Cyan
                foreach ($opt in $input.options) {
                    $detail = if ($opt.detail) { "  ($($opt.detail))" } else { '' }
                    Write-Host "  $i. $($opt.label)$detail"
                    $i++
                }
                do {
                    $raw = Read-Host "Choice (1-$($input.options.Count))"
                    $idx = [int]$raw - 1
                } while ($idx -lt 0 -or $idx -ge $input.options.Count)
                $answers[$input.key] = $input.options[$idx].value
            } else {
                Write-Host "`n$($input.label) [$($input.key)]:" -ForegroundColor Cyan
                $answers[$input.key] = Read-Host
            }
            $anyAnswered = $true
        }

        # If no progress was made (all remaining inputs are dynamic and nothing was answered), bail.
        if (-not $anyAnswered) { break }
    }

    # Output the final answers as a JSON object compatible with --params.
    $answers | ConvertTo-Json -Compress
    exit 0
}

# ── Build argument list for pass-through verbs ────────────────────────────────
$cliArgs = @($cli, $Verb)

if ($Target)         { $cliArgs += $Target }
if ($Params.Count)   { $cliArgs += '--params', ($Params | ConvertTo-Json -Compress) }
if ($Out)            { $cliArgs += '--out',    $Out }
if ($Force)          { $cliArgs += '--force' }

# Always pass --root so the CLI works regardless of the calling directory.
$cliArgs += '--root', $workspaceRoot

# ── Run ───────────────────────────────────────────────────────────────────────
& $node @cliArgs
exit $LASTEXITCODE


.DESCRIPTION
    Supported verbs:
      render          Render a template to stdout or --Out <file>.
      invoke          Resolve a single function or named template entry.
      describe        Print the input schema (qualified keys, kinds, options) as JSON.
      list-templates  List all available templates as JSON.

.PARAMETER Verb
    The CLI verb: render, invoke, describe, or list-templates.

.PARAMETER Target
    Template path (render / describe), function call, or "path#name" reference (invoke).

.PARAMETER Params
    Hashtable of pre-supplied input values, e.g. @{ "candidate.person" = "Alice" }.
    Keys are the qualified input names returned by 'describe'.

.PARAMETER Out
    Output file path (render only). Resolved relative to the current directory.

.PARAMETER Force
    Allow overwriting an existing --Out file (render only).

.EXAMPLE
    .\Invoke-Template.ps1 render "Interview/Feedback.md" -Params @{ "candidate.person" = "Alice" }

.EXAMPLE
    .\Invoke-Template.ps1 list-templates

.EXAMPLE
    .\Invoke-Template.ps1 describe "Interview/Feedback.md"

.EXAMPLE
    .\Invoke-Template.ps1 render "Notes/StandUp.md" -Out "01-MeetingNotes/standup.md"
#>
[CmdletBinding()]
param (
    [Parameter(Mandatory, Position = 0)]
    [ValidateSet('render', 'invoke', 'describe', 'list-templates')]
    [string] $Verb,

    [Parameter(Position = 1)]
    [string] $Target = '',

    [hashtable] $Params = @{},

    [string] $Out = '',

    [switch] $Force
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# ── Workspace root ────────────────────────────────────────────────────────────
# Script lives at <root>/13-Scripts/Utils/Invoke-Template.ps1, so the root is
# two levels up. Resolve to an absolute path to be cwd-independent.
$scriptDir     = Split-Path -Parent $MyInvocation.MyCommand.Path
$workspaceRoot = (Resolve-Path (Join-Path $scriptDir '..\..')).Path

# ── Engine discovery ──────────────────────────────────────────────────────────
$configPath = Join-Path $workspaceRoot '.memoria' 'engine-config.json'
$node       = $null
$cli        = $null

if (Test-Path $configPath) {
    $cfg = Get-Content $configPath -Raw | ConvertFrom-Json
    if ((Test-Path -LiteralPath $cfg.node) -and (Test-Path -LiteralPath $cfg.cli)) {
        $node = $cfg.node
        $cli  = $cfg.cli
    }
}

if (-not $node) {
    # Fall back: node on PATH + newest installed Memoria CLI.
    $nodeCmd = Get-Command node -ErrorAction SilentlyContinue
    if (-not $nodeCmd) {
        throw (
            'Cannot locate Node.js. ' +
            'Ensure it is on PATH, or open this workspace in VS Code to refresh .memoria/engine-config.json.'
        )
    }
    $node = $nodeCmd.Source

    $extensionsRoot = Join-Path $env:USERPROFILE '.vscode' 'extensions'
    $cli = Get-ChildItem (Join-Path $extensionsRoot 'razm*' 'dist' 'template-cli.cjs') `
        -ErrorAction SilentlyContinue |
        Sort-Object FullName -Descending |
        Select-Object -First 1 -ExpandProperty FullName

    if (-not $cli) {
        throw (
            'Cannot locate template-cli.cjs. ' +
            'Open this workspace in VS Code to refresh .memoria/engine-config.json.'
        )
    }
}

# ── Build argument list ───────────────────────────────────────────────────────
$cliArgs = @($cli, $Verb)

if ($Target)         { $cliArgs += $Target }
if ($Params.Count)   { $cliArgs += '--params', ($Params | ConvertTo-Json -Compress) }
if ($Out)            { $cliArgs += '--out',    $Out }
if ($Force)          { $cliArgs += '--force' }

# Always pass --root so the CLI works regardless of the calling directory.
$cliArgs += '--root', $workspaceRoot

# ── Run ───────────────────────────────────────────────────────────────────────
& $node @cliArgs
exit $LASTEXITCODE
