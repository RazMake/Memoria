---
description: >
  Use this skill when the user wants to create a new Copilot skill that renders a
  Memoria template as part of its work — for example a skill that sends a Teams
  message, opens an email draft, saves a file, or copies text to the clipboard.
  This skill interviews the user, discovers the template schema from the workspace,
  and writes the new skill file.
tools: [execute/runInTerminal, execute/getTerminalOutput, read/readFile, edit, todo]
---

# Create a template-rendering skill

Your job is to **author a new `.skill.md` file** for the user. The file you produce
will be a ready-to-use Copilot skill that renders a specific template and acts on
the result. Work through the phases below in order and do not skip ahead.
Run every discovery command against the workspace — never guess paths or param keys.

---

## Phase 1 — Interview the user

Ask the user **one question** that covers all three points:

> "What should the new skill do, which template should it use, and what should happen
> with the rendered text — for example: copy to clipboard, open a Teams message,
> create a file, or open an email draft?"

If they are unsure which template to use, run:

```powershell
.\13-Scripts\Utils\Invoke-Template.ps1 list-templates
```

Show the results (`path` + `title`) and ask them to pick one. Also ask what to name
the new skill file (will become `.github/skills/<name>.skill.md`).

Do not proceed to Phase 2 until you have:
- The template path (e.g. `"People-Related/PromoFeedbackRequest.md"`)
- The output action (e.g. "open a pre-filled Teams message")
- The skill file name (e.g. `"send-promo-feedback-request"`)

---

## Phase 2 — Discover the template schema

Run `describe` on the chosen template:

```powershell
.\13-Scripts\Utils\Invoke-Template.ps1 describe "<templatePath>"
```

Parse every entry in the JSON array. For each input, note:
- `key` — the exact string to use in `--params` (e.g. `"candidate.person"`)
- `label` — the human-readable question to ask the user
- `kind` — `"pick"` or `"freeText"`
- `options` — the list of `{ value, label, detail? }` choices for `"pick"` inputs
- `"dynamic": true` — options depend on an earlier answer (see below)

**Resolving dynamic inputs:** when an entry has `"dynamic": true`, its option list
cannot be shown until the preceding input for the same template entry is answered.
Re-run `describe` supplying the earlier answer to get the real option list:

```powershell
# Supply already-known answers so the dynamic options resolve
.\13-Scripts\Utils\Invoke-Template.ps1 describe "<templatePath>" `
    --params '{"<entry.earlierInput>": "<answeredValue>"}'
```

Repeat until every input has either a concrete `options` list or is confirmed `"freeText"`.
Build a complete input table before moving to Phase 3.

---

## Phase 3 — Write the new skill file

Create `.github/skills/<skill-name>.skill.md` with the structure shown below.
Fill in every placeholder with the real values discovered in Phase 2.
Do **not** leave any placeholder text in the output file.

```markdown
---
description: >
  Use this skill when the user wants to <one-line description of what this skill does>.
tools: [execute/runInTerminal, execute/getTerminalOutput]
---

# <Skill title>

<One sentence describing what this skill does and when to use it.>

## What you need from the user

Before rendering, ask the user for each of the following inputs.
For pick inputs, show the numbered option list and wait for the user's choice.
For freeText inputs, ask an open question.

<!-- Repeat this block for every input discovered in Phase 2 -->
**<label>** (`<key>`)
Kind: pick | freeText
<!-- If kind is pick: -->
Options:
1. <option.label> — <option.detail if present> → value: `<option.value>`
2. ...
<!-- If dynamic: note that the options below were resolved from the earlier answer
     and should be re-confirmed if the user changes the preceding input. -->

## Render the template

Once all inputs are collected, run:

```powershell
.\13-Scripts\Utils\Invoke-Template.ps1 render "<templatePath>" -Params @{
    "<key1>" = "<collected-value-1>"
    "<key2>" = "<collected-value-2>"
    # ... one line per input
}
```

## Act on the result

<!-- Choose the block that matches the output action the user requested: -->

<!-- TEAMS -->
Capture the rendered text and open a pre-filled Teams deep link:
```powershell
$text = .\13-Scripts\Utils\Invoke-Template.ps1 render "<templatePath>" -Params @{ ... }
$encoded = [Uri]::EscapeDataString($text)
Start-Process "msteams://teams.microsoft.com/l/chat/0/0?message=$encoded"
# If the link would be too long, copy to clipboard and open Teams instead:
# $text | Set-Clipboard; Start-Process "msteams://"
```

<!-- EMAIL (Outlook / mailto) -->
Open a pre-filled Outlook compose window:
```powershell
$text    = .\13-Scripts\Utils\Invoke-Template.ps1 render "<templatePath>" -Params @{ ... }
$subject = [Uri]::EscapeDataString("<subject line>")
$body    = [Uri]::EscapeDataString($text)
$link    = "mailto:?subject=$subject&body=$body"
if ($link.Length -lt 1800) {
    Start-Process $link
} else {
    $text | Set-Clipboard
    Start-Process "outlook:"   # open Outlook; user pastes from clipboard
    Write-Host "Text is in your clipboard — paste it into the compose window."
}
```

<!-- CLIPBOARD -->
```powershell
.\13-Scripts\Utils\Invoke-Template.ps1 render "<templatePath>" -Params @{ ... } |
    Set-Clipboard
```

<!-- FILE -->
```powershell
.\13-Scripts\Utils\Invoke-Template.ps1 render "<templatePath>" -Params @{ ... } `
    -Out "<workspace-relative-path>" [-Force]
```
```

Keep only the "Act on the result" block that matches the user's chosen output action.
Remove all the other output-channel comment blocks before saving.

---

## Constraints

- **Never fabricate template paths or param keys.** Always use the exact values from
  `list-templates` and `describe`. If discovery commands fail, tell the user rather
  than guessing.
- **Never auto-send.** For Teams and email, only open a pre-filled compose surface.
  The user must explicitly send.
- **Do not construct `..`-escaping paths** in `--Out` arguments. The CLI rejects them,
  but the skill you write should not attempt it either.
- **Embed the real option lists** in the new skill. The user should never have to run
  `describe` themselves — the new skill must carry all the information it needs.


The wrapper lives at `13-Scripts/Utils/Invoke-Template.ps1` relative to the workspace
root. Confirm it exists before proceeding:

```powershell
Test-Path "13-Scripts\Utils\Invoke-Template.ps1"
```

If it is missing, tell the user to re-initialize the workspace or copy the wrapper
from the extension's blueprint resources.

---

## Step 2 — Discover available templates

```powershell
.\13-Scripts\Utils\Invoke-Template.ps1 list-templates
```

Parse the JSON array. Each entry has:
- `path` — relative path inside the templates folder (pass this as `<templatePath>`)
- `category` — sub-folder prefix, or `null`
- `title` — first `# H1` in the template body, or `null`

Show the list to the user and ask which template (or templates) the new skill should render.

---

## Step 3 — Describe the template's inputs

```powershell
.\13-Scripts\Utils\Invoke-Template.ps1 describe "<templatePath>"
```

This outputs a JSON array of input descriptors. Each entry has:
| Field | Meaning |
|---|---|
| `key` | Qualified input key used in `--params` (e.g. `"candidate.person"`) |
| `label` | Human-readable prompt |
| `kind` | `"pick"` (choose from a list) or `"freeText"` |
| `options` | Array of `{ value, label, detail? }` for static pick inputs |
| `dynamic: true` | Options depend on an earlier answer — see step 3a |

### Step 3a — Cascaded (dynamic) inputs

When an entry has `"dynamic": true`, its option list depends on an earlier answer from
the same template entry. Re-run `describe` with the earlier answers supplied via
`--params` to resolve the options:

```powershell
# Example: group was answered first; now resolve the person list
.\13-Scripts\Utils\Invoke-Template.ps1 describe "<templatePath>" `
    --params '{"entryName.group": "Team"}'
```

The previously-dynamic input will now have an `options` array instead of `dynamic: true`.

---

## Step 4 — Choose the skill's input strategy

Discuss with the user how the skill will collect its inputs:

| Strategy | When to use |
|---|---|
| **Hardcoded** | The template path and all params are fixed (e.g. a daily-standup script) |
| **Interactive collect** | The user runs the skill in a terminal and answers prompts |
| **Copilot-collected** | Copilot asks the user for each input before calling render |
| **Caller-supplied params** | The skill accepts a `$Params` hashtable as a parameter |

---

## Step 5 — Choose the output channel

| Channel | How |
|---|---|
| **Clipboard** | Pipe stdout to `Set-Clipboard` |
| **File** | Use `--Out "<path>"` (add `--Force` to allow overwrite) |
| **Stdout** | Default — no extra flag needed |
| **Variable** | Capture: `$text = .\Invoke-Template.ps1 render ...` |

---

## Step 6 — Create the skill or script

### Option A — PowerShell script

Generate a `.ps1` file in `13-Scripts/` using the patterns below.

**Hardcoded render to clipboard:**
```powershell
.\13-Scripts\Utils\Invoke-Template.ps1 render "Notes/StandUp.md" | Set-Clipboard
```

**Interactive collect then render:**
```powershell
$params = .\13-Scripts\Utils\Invoke-Template.ps1 collect "Interview/Feedback.md" |
    ConvertFrom-Json
.\13-Scripts\Utils\Invoke-Template.ps1 render "Interview/Feedback.md" -Params $params |
    Set-Clipboard
```

**Caller-supplied params (reusable wrapper):**
```powershell
[CmdletBinding()]
param (
    [Parameter(Mandatory)] [string] $Person,
    [string] $OutputPath = ''
)
$params = @{ "candidate.person" = $Person }
if ($OutputPath) {
    .\13-Scripts\Utils\Invoke-Template.ps1 render "Interview/Feedback.md" `
        -Params $params -Out $OutputPath
} else {
    .\13-Scripts\Utils\Invoke-Template.ps1 render "Interview/Feedback.md" `
        -Params $params | Set-Clipboard
}
```

### Option B — Copilot skill (`.skill.md`)

Create `<name>.skill.md` in `.github/skills/`. The skill body should:

1. List the **exact** `--params` keys the template needs (from `describe` output).
2. Tell Copilot to ask the user for each value before calling the wrapper.
3. Specify the output channel.

**Skeleton:**
```markdown
---
description: >
  Use this skill when the user wants to <what the template does>.
tools: [execute/runInTerminal, execute/getTerminalOutput]
---

# <Skill name>

Ask the user for the following values, then render the template.

Required inputs (from `13-Scripts\Utils\Invoke-Template.ps1 describe "<templatePath>"`):
<!-- paste the key/label/options rows here -->

## Steps

1. Ask the user for each required input.
2. Run:
   ```powershell
   .\13-Scripts\Utils\Invoke-Template.ps1 render "<templatePath>" `
       -Params @{ "<key1>" = "<value1>"; "<key2>" = "<value2>" }
   ```
3. <Send to clipboard / write to file / show to user>.
```

---

## Step 7 — Verify

Test the new skill end-to-end:
1. Run the script (or invoke the Copilot skill) with known good inputs.
2. Confirm the rendered output looks correct.
3. If using `--Out`, confirm the file was created without clobbering existing files.

---

## Constraints

- **Never fabricate template paths or param keys** — always run `list-templates` and
  `describe` to get real values from the workspace.
- **Confine `--Out` paths inside the workspace root** — the CLI enforces this, but
  your generated script should not construct paths that escape it with `..`.
- **Do not auto-send messages** — if the template output is used for email or Teams,
  only open a pre-filled compose surface; never send automatically.
