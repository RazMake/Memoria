# Templates

Markdown templates with a structured frontmatter let you render rich, personalised text — meeting-note drafts, feedback requests, standup summaries, and anything else you write repeatedly. Templates are part of the [Snippets](snippets.md) feature and stored in the blueprint's templates folder (`11-Templates/` in both blueprints).

## How it works

When you invoke a template command, Memoria:

1. Presents a QuickPick list of all `.md` files in the templates folder.
2. Parses the chosen template's frontmatter to discover what inputs are needed.
3. Prompts you for each input (pick from a list or type free text).
4. Substitutes all `{{name}}` and `{{name.property}}` references in the body with the resolved values.
5. Delivers the rendered text — into the editor, a new document, or the clipboard.

## Using templates

### Autocomplete trigger

Type `{template}` in any Markdown file and select it from the autocomplete list. The rendered text is inserted at the cursor.

### Command Palette

| Command | What it does |
|---------|-------------|
| **Memoria: Insert Template** | Renders a template and inserts the text at the cursor (copies to clipboard when no editor is open) |
| **Memoria: Render Template to File** | Renders a template and opens the result in a new untitled Markdown document |
| **Memoria: Render Template to Clipboard** | Renders a template and copies the result to the clipboard |

### From the terminal

The wrapper script deployed by the blueprint provides the same functionality outside VS Code:

```powershell
# List available templates
.\13-Scripts\Utils\Invoke-Template.ps1 list-templates

# Render a template to stdout
.\13-Scripts\Utils\Invoke-Template.ps1 render "Interview/Feedback.md"

# Render with pre-supplied inputs (no interactive prompts)
.\13-Scripts\Utils\Invoke-Template.ps1 render "Interview/Feedback.md" `
    -Params @{ "candidate.person" = "alice.johnson"; "deadline.choice" = "7" }

# Render to a file
.\13-Scripts\Utils\Invoke-Template.ps1 render "Interview/Feedback.md" `
    -Out "01-MeetingNotes/feedback-alice.md"
```

See [Invoke-Template.ps1](#from-the-terminal) and the `template-based-skill-creator` skill in `.github/skills/` to build automations on top of templates.

---

## Template file format

A template is a Markdown file with an optional YAML-style frontmatter block. The frontmatter declares what data to collect; the body uses `{{name}}` expressions to reference that data.

```
---
candidate: PeopleSelector(Team)
deadline:  DeadlineSelector(1, 14)
topic:     FreeText(What is the main feedback topic?)
---

# Feedback for {{candidate.FullName}}

**Due:** {{deadline}}
**Topic:** {{topic.value}}

Hi {{candidate.Nickname}},

...
```

### Frontmatter

The frontmatter is enclosed in `---` fences. Each line has the form:

```
name: FunctionName(arg1, arg2, ...)
```

- `name` — identifier used to reference the result in the body (`{{name}}`).
- `FunctionName` — one of the built-in functions or a custom function from `_functions/`.
- Arguments — plain values, quoted strings (`"label"`), unions (`Group1 | Group2`), duration strings (`7d`, `2w`, `1M`), or `{{ref.prop}}` references to earlier entries.

A template with no frontmatter is valid — it renders as plain text with no prompts.

### Body expressions

In the body, `{{name}}` inserts the resolved value of a frontmatter entry. For entries that resolve to an object (e.g. `PeopleSelector`, `Me`), use property access:

| Expression | What it inserts |
|------------|----------------|
| `{{candidate.FullName}}` | Full name of the selected person |
| `{{candidate.Nickname}}` | Nickname |
| `{{candidate.Title}}` | Job title |
| `{{candidate.Email}}` | Custom `Email` extra field (if set on the contact) |
| `{{me.FullName}}` | Your own full name (from `Me.md`) |
| `{{deadline}}` | Formatted deadline string (e.g. `"by Friday, Jun 20, 2026"`) |
| `{{topic.value}}` | Free-text answer for the `topic` entry |

Unknown references emit an inline warning marker (`⚠️ template: unknown {{ref}}`) rather than failing silently.

---

## Built-in functions

### `PeopleSelector(group?)`

Prompts the user to pick a person from a contact group.

| Argument form | Effect |
|---|---|
| `PeopleSelector()` | Offers all groups; user picks group then person |
| `PeopleSelector(Team)` | Single-group pick from `Team` |
| `PeopleSelector(Team \| Peers)` | Multi-group: user picks group first, then person |
| `PeopleSelector("Candidate", Team)` | Custom prompt label `"Candidate"`, single group |

The resolved value is the full contact object. Use property expressions in the body (`{{candidate.FullName}}`, `{{candidate.Title}}`, etc.). Any [extra fields](contacts.md) on the contact are also accessible by their field name (`{{candidate.Email}}`).

Requires the [Contacts](contacts.md) feature to be enabled.

---

### `Me()`

Reads your own profile from `Me.md` in the contacts folder. No user input — resolves automatically.

```
me: Me()
```

Then in the body: `{{me.FullName}}`, `{{me.Title}}`, `{{me.Email}}`, etc.

Requires the [Contacts](contacts.md) feature to be enabled and `Me.md` to be populated.

---

### `FreeText(label?)`

Prompts the user to type a free-text string.

```
topic: FreeText(What is the main feedback topic?)
```

The resolved value is a plain string. Reference it as `{{topic.value}}` in the body.

---

### `DeadlineSelector(start, end)`

Presents a pick list of deadline options in a half-open day range `[start, end)` relative to today. An optional quoted label may precede the numbers.

```
deadline:  DeadlineSelector(1, 14)
urgentBy:  DeadlineSelector("Respond by", 1, 7)
```

Each option is labelled with a human-readable relative string (e.g. `"in 3 days"`). The resolved value is a formatted absolute date string (e.g. `"by Friday, Jun 20, 2026"`).

Arguments:
- `start` — first day offset to include (integer ≥ 0)
- `end` — exclusive upper bound (integer > start)

---

### `IfWithin(duration, date, text)`

Returns `text` when `date` falls within `duration` of today; returns an empty string otherwise. No user input.

```
recentJoiner: IfWithin(6M, {{candidate.LevelStartDate}}, " _(recently levelled)_")
```

- `duration` — `Nd` (days), `Nw` (weeks), or `NM` (months ×30)
- `date` — a `YYYY-MM-DD` date string, or a `{{ref.prop}}` reference to an earlier entry
- `text` — the string to emit when the condition is true; may reference `{{scope}}` expressions

---

## Adding new templates

1. Create a `.md` file anywhere inside `11-Templates/` (subdirectories are fine).
2. Add an optional frontmatter block with one entry per input you need.
3. Write the body using `{{name}}` expressions.
4. Save — the file watcher picks it up immediately; no restart needed.

A minimal example with no inputs:

```markdown
# Weekly standup

**Yesterday:** 

**Today:** 

**Blockers:** 
```

A more structured example:

```markdown
---
person:   PeopleSelector("Who is this about?", Team)
deadline: DeadlineSelector(1, 8)
notes:    FreeText(Key observations)
---

## 1:1 notes — {{person.FullName}} ({{person.Title}})

**Next check-in due:** {{deadline}}

{{notes.value}}
```

---

## Adding custom functions

For inputs that none of the built-ins cover, add a TypeScript file to `11-Templates/_functions/`. Files there are compiled automatically alongside the built-ins.

### Structure

A function file must export one or more objects that implement `TemplateFunction`. Export them individually or as an array:

```typescript
import type { TemplateFunction, TemplateContext, TemplateInput } from "memoria-templates";

const myFunction: TemplateFunction<string> = {
    name: "MyFunction",

    describeInputs(ctx: TemplateContext): TemplateInput[] {
        // Return the ordered list of inputs to collect from the user.
        return [
            {
                name: "choice",
                label: "Pick an option",
                kind: "pick",
                options: [
                    { value: "a", label: "Option A" },
                    { value: "b", label: "Option B", detail: "extra detail" },
                ],
            },
        ];
    },

    resolve(inputs: Record<string, string>): string {
        // Return the value that will be placed in the template scope.
        return inputs["choice"] === "a" ? "You chose A" : "You chose B";
    },
};

export default myFunction;
```

Use the function in a template frontmatter entry:

```
result: MyFunction()
```

Then reference it in the body as `{{result}}` (or `{{result.property}}` if `resolve` returns an object).

### The `memoria-templates` module

Function files import types from the virtual `memoria-templates` module. It exposes:

| Export | Description |
|--------|-------------|
| `TemplateFunction<T>` | The interface your function must implement |
| `TemplateContext` | Runtime context passed to `describeInputs` and `resolve` |
| `TemplateInput` | A single input descriptor |
| `PickOption` | One option in a `"pick"` input (`value`, `label`, `detail?`) |
| `InputKind` | `"pick"` or `"freeText"` |

### `TemplateFunction<T>` interface

| Member | Required | Description |
|--------|----------|-------------|
| `name` | Yes | Identifier used in frontmatter (e.g. `"MyFunction"`) — must be unique and not shadow a built-in |
| `describeInputs(ctx)` | Yes | Returns the ordered inputs to collect; called before rendering |
| `resolve(inputs, ctx)` | Yes | Returns the result value placed in the scope |
| `display?(result)` | When `T` is an object | Returns the string used when the body writes `{{name}}` directly (without a property path) |
| `branchArgs?` | Rarely | Array of 0-based argument positions whose content is branch text, not a scope dependency (used for conditional functions like `IfWithin`) |

### Dynamic pick options

When the options for one input depend on an earlier answer in the same entry, use `resolveOptions` instead of a static `options` array:

```typescript
describeInputs(ctx: TemplateContext): TemplateInput[] {
    return [
        {
            name: "group",
            label: "Select group",
            kind: "pick",
            options: [{ value: "alpha", label: "Alpha" }, { value: "beta", label: "Beta" }],
        },
        {
            name: "item",
            label: "Select item",
            kind: "pick",
            resolveOptions(pickCtx: TemplateContext) {
                // pickCtx.answers["group"] holds the answer to the preceding input.
                return pickCtx.answers["group"] === "alpha"
                    ? [{ value: "a1", label: "Alpha-1" }, { value: "a2", label: "Alpha-2" }]
                    : [{ value: "b1", label: "Beta-1" }];
            },
        },
    ];
},
```

### Constraints

- **Only `memoria-templates` can be imported.** Node.js built-ins (`fs`, `child_process`, `net`, etc.) are blocked — the sandbox enforces this.
- **Function names must be unique** and cannot shadow any reserved built-in name: `FreeText`, `IfWithin`, `PeopleSelector`, `Me`, `DeadlineSelector`.
- **Side-effects at module top level are not allowed.** Do all work inside `resolve` and `describeInputs`, not at import time. The file is compiled fresh on each render.
- Changes to `_functions/` files are picked up by the file watcher without restarting VS Code.

---

## Toggling

Templates are part of the Snippets feature. If Snippets is disabled, template commands and the `{template}` autocomplete are also removed. See [Snippets — Toggling](snippets.md#toggling).

---

## Troubleshooting

- **Template not appearing in the list?** Confirm the file is under `11-Templates/` and ends in `.md`. Files or folders whose names start with `_` (like `_functions/`) are intentionally excluded.
- **Function file not loading?** Check the VS Code notification area for a compile error. Ensure you export the function as a default export or as a named export, and that the function object has `name`, `describeInputs`, and `resolve`.
- **`⚠️ template: unknown {{ref}}` in output?** The expression path does not match any frontmatter entry name or object property. Check spelling and that the entry was resolved before it is referenced.
- **`⚠️ template: {{ref}} is not text`?** A frontmatter entry that resolves to an object is used directly as `{{name}}` without a property path. Add `.property` access, or implement `display()` on the function.

---

[⬅️ **Back** to Features](index.md) 💠 [Snippets](snippets.md) 💠 [Contacts](contacts.md) 💠 [Commands](../commands/index.md)
