# PRD: Templated Text Generation

**Date**: 2026-06-14
**Status**: Draft

## 1. TL;DR

Add **templated text generation** to Memoria as part of the existing **Snippets** feature. A
template is a Markdown file with a **frontmatter** block that declares named objects, each produced
by a **function** (e.g. `candidate: PeopleSelector(Team)`). The template **body** references those
objects via property access — `{{candidate.fullName}}`, `{{provider.resolvedPronouns.subject}}`. A
function's arguments may themselves reference other frontmatter results (e.g.
`IfWithin(4M, {{me.StartDate}}, "…")`), so entries are resolved in **multiple passes** by dependency
order. Rendering resolves each frontmatter function (asking the user for any inputs), substitutes the
values into the body, and **strips the frontmatter** so it never appears in the output.

The same rendering happens in two places without code duplication:

- **Inside VS Code** — a built-in `{template}` snippet (and dedicated commands) lets the user pick a
  template, resolve inputs via QuickPick, and insert/copy/save the rendered text.
- **Outside VS Code** — a bundled, `vscode`-free **Node CLI** (`dist/template-cli.cjs`) renders the
  exact same templates. A thin **PowerShell SKILL** shells into the CLI to obtain the text (and, when
  needed, the underlying objects such as a recipient's email) and then performs OS-level actions like
  opening a pre-filled email or Teams message.

Functions are **user-extensible**: in addition to the built-ins (`PeopleSelector`, `Me`,
`DeadlineSelector`, `FreeText`, and the conditional `IfWithin`), users author `.ts` files that export
functions returning arbitrary objects (or conditional text) whose values templates can reference.
The people/date built-ins (`PeopleSelector`, `Me`, `DeadlineSelector`) are **host-registered adapter
functions** that read from the **Contacts** feature through a narrow provider; the template engine
**core carries no Contacts types** and is **not coupled** to Contacts (§7, §8.1).

---

## 2. Terminology

- **Template** — a Markdown file with a frontmatter block of object declarations and a body that
  references those objects. Stored under the workspace templates folder (e.g. `11-Templates/`).
- **Frontmatter declaration** — a line of the form `name: FunctionCall(args)`. `name` becomes a
  variable available in the body; `FunctionCall(args)` is the function that produces its value. An
  argument may reference another entry's result via `{{other.prop}}` (see §4.4). The frontmatter block
  is a **Memoria-specific declaration grammar (§4.2), not YAML**, and is never parsed by a YAML parser.
- **Template function** — a named, typed function that (a) declares the **inputs** it needs from the
  user and (b) **resolves** to a value: an object, a scalar, or conditional text. Built-in or
  user-authored.
- **Input** — a value a function needs at render time (a pick, a free-text string, a date). Resolved
  via QuickPick in VS Code or via CLI params (prompting in-terminal only if missing).
- **Pass** — one sweep of the multi-pass resolver, which resolves every entry whose argument
  references are already satisfied (see §4.4).
- **Render** — the act of resolving all frontmatter functions and substituting their results into the
  body, producing plain text with the frontmatter removed.
- **Engine core** — the `vscode`-free TypeScript module that parses, resolves, and renders templates.
- **Adapter** — a small implementation of an engine interface (`InputResolver`, `ContactsProvider`)
  that differs between the VS Code host and the CLI.
- **SKILL** — an AI-agent skill (`.vscode/skills/<name>/SKILL.md` + scripts) deployed by the
  blueprint, that drives the CLI to produce text and perform email/Teams actions.

---

## 3. Goals / Non-goals

**Goals**

- Render Markdown templates whose frontmatter declares objects produced by functions, substituting
  `{{name}}` / `{{name.prop}}` into the body and stripping the frontmatter from the output.
- Provide built-in functions: `PeopleSelector`, `Me`, `DeadlineSelector`, `FreeText`, and the
  conditional `IfWithin`.
- Let users extend the function set by authoring `.ts` files that return arbitrary objects or
  conditional text, including their own conditional helpers.
- Support function arguments that reference other frontmatter results, resolving entries in multiple
  passes by dependency order (§4.4).
- Resolve function inputs interactively in VS Code (QuickPick / input box) and non-interactively from
  the CLI (params/JSON, prompting in-terminal only when a value is missing).
- Expose templating in the **Snippets** feature: a `{template}` snippet picks a template, resolves its
  inputs one-by-one, and inserts the rendered text at the cursor.
- Provide commands to render a template **inline at the cursor**, to a **new file**, and to the
  **clipboard**; keep clipboard and stdout (CLI) as distinct output paths.
- Ship a single **engine core** reused by both the extension and a bundled **Node CLI** — no logic
  duplicated between VS Code and PowerShell.
- Let built-in people functions read from the **Contacts** feature via a provider, adding a
  `getGroupContacts(groupName)` accessor to the Contacts service.
- Ship a PowerShell **SKILL** that renders text via the CLI and opens pre-filled email/Teams messages.
- Ship a starter set of templates with the extension into the workspace templates folder.

**Non-goals**

- Sending email or Teams messages automatically from the extension (no auto-send; the SKILL only opens
  pre-filled compose surfaces or hands back text). Microsoft Graph auto-send is out of scope for v1.
- Arithmetic or function calls **inside the body `{{…}}`** (`{{candidate.level+1}}`). Property access
  with nested paths is supported; computation is done inside functions, not in `{{…}}`. (Conditionals
  and cross-references via functions/arguments **are** supported — see §4.4, §6.4.)
- A PowerShell reimplementation of the engine. PowerShell only orchestrates the CLI and OS actions.
- A rich template-authoring UI. Templates and functions are authored as Markdown / `.ts` files.
- Template syncing or a template marketplace.

---

## 4. Template file format

### 4.1 Structure

A template is a UTF-8 Markdown file that begins with a **frontmatter block** — a Memoria-specific
declaration block delimited by an opening and closing `---` fence. It is **not YAML** and is never
handed to a YAML parser (its grammar is defined in §4.2; the fence/body boundary in §4.5):

```markdown
---
candidate: PeopleSelector(Team)
provider: PeopleSelector(Team | Managers | Peers | Colleagues)
me: Me()
deadline: DeadlineSelector(1d, 3d)
project: FreeText()
---
Hi {{provider.nickname}}. I have your name from _{{candidate.fullName}}_ and I am reaching out to
see if you would agree to give me some feedback for your experience working with
{{candidate.nickname}} this last year.

I am currently managing the {{me.TeamName}} team. If you could share some thoughts {{deadline}} on
{{project}} it would really help. Thank you!
```

> **Field casing (normative).** Typed contact fields are referenced by their **camelCase** runtime
> names (`fullName`, `nickname`, `careerPathKey`, `levelId`, … — the `ResolvedContact` shape, §6.2).
> Free-form fields — every field in `Me.md`, and any extra/custom Markdown field on a contact — are
> referenced by their **exact Markdown label** (`{{me.TeamName}}`, `{{me.StartDate}}`,
> `{{candidate.SomeCustomField}}`). There is **no** `firstName`/`teamName` on a typed contact; use
> `nickname`/`fullName`, or a custom `Me.md` field (§4.3, §6.2).

### 4.2 Frontmatter grammar

Each non-empty frontmatter line is a single declaration:

```
<name> : <FunctionName> ( <args>? )
```

- **`name`** — an identifier (`[A-Za-z_][A-Za-z0-9_]*`). Becomes a variable referenced in the body.
  Names must be unique within a template.
- **`FunctionName`** — the name of a built-in or user-authored function.
- **`args`** — a comma-separated list of arguments, each one of:
  - **identifier** — e.g. `Team`
  - **union** — pipe-separated identifiers, e.g. `Team | Managers | Peers | Colleagues`, passed to the
    function as a list of options
  - **number+unit** — `\d+[dwM]`: digits followed by a unit (`d` = calendar days, `w` = weeks
    ×7 days, `M` = months ×30 days). `DeadlineSelector` accepts only `d` and `w`; the `M` unit is
    supported only by `IfWithin` (§6.2). An unrecognized unit is a parse error (§12).
  - **quoted string** — `"..."` for literal text; **may embed `{{…}}` references** that are substituted
    before the function runs (e.g. `"…{{candidate.nickname}}…"`)
  - **reference** — `{{other.prop}}` that resolves to another frontmatter entry's value (e.g.
    `{{me.StartDate}}`). Free-text and conditional functions in particular rely on this.

**Tokenizer and escaping (normative).** The argument list is tokenized by a **quote-aware,
paren-aware** scanner — it is **not** a naive `split(',')`:

- A **double-quoted string** runs from `"` to the next **unescaped** `"`. Inside a quoted string,
  commas (`,`), parentheses (`(` `)`), and pipes (`|`) are **literal text**, not separators.
- The closing `)` of the call is the paren matching the opening `(` **at depth 0, ignoring parentheses
  inside quoted strings**.
- Argument separators (`,`) and union separators (`|`) are recognized **only outside** quoted strings.
- **Escape sequences inside quoted strings**: `\"` → `"`, `\\` → `\`, `\n` → newline, `\t` → tab; a
  backslash before any other character is preserved literally. `{{…}}` references inside a quoted string
  are substituted **after** unescaping.
- Whitespace around identifiers, `,`, and `|` is insignificant; whitespace **inside** a quoted string is
  preserved.

Because arguments can reference other entries, resolution is **multi-pass** (see §4.4); the frontmatter
block is **always removed** from the rendered output, in every code path.

### 4.3 Body expression grammar

The body supports **property access**, including nested paths:

- `{{name}}` — the function result rendered as text. A string or number is inserted directly. An
  **object** is inserted via the function's declared `display()` (every built-in that returns an object
  declares one, §6.1). A bare `{{name}}` that resolves to a **non-string with no `display()`** emits an
  inline marker `⚠️ template: {{name}} is not text` and a diagnostic (§12) — it never silently emits
  `String(result)` / `[object Object]`.
- `{{name.property}}` — a property of the result object (e.g. `{{candidate.fullName}}`).
- `{{name.a.b.c}}` — a **nested path** of arbitrary depth (e.g. `{{provider.resolvedPronouns.subject}}`,
  `{{candidate.resolvedCareerLevel.id}}`). Free-form fields are **flattened** onto the object and
  referenced by their exact Markdown label (e.g. `{{me.StartDate}}`, not `{{me.extraFields.StartDate}}`);
  typed contact fields keep their camelCase names (§4.1, §6.2).

No arithmetic and no function calls inside `{{…}}` (compute those in a function instead, §6.4).
Unknown names or path segments render as an inline error marker (see §12) rather than silently
emitting an empty string. The same `{{…}}` substitution is applied to quoted-string and reference
arguments in the frontmatter (§4.4).

### 4.4 Resolution model (multi-pass)

Frontmatter entries are resolved by repeated passes until a fixpoint:

1. An entry's arguments may contain `{{other.prop}}` references (and quoted-string arguments may embed
   `{{…}}`), so an entry can depend on other entries' results. **Dependency extraction scans the
   interior of quoted-string arguments**, so `greeting: FreeText("Hi {{candidate.fullName}}")` depends
   on `candidate` even though the reference sits inside a string — it is never resolved before
   `candidate`. **Exception — branch-content arguments (§6.1):** a function may declare certain
   argument positions as `branchArgs`. References inside those arguments are **not** extracted as
   resolution dependencies; they are substituted from whatever scope exists when the function runs. If
   a referenced entry is not yet in scope, the reference produces the unknown-field marker (§12). This
   enables conditional functions like `IfWithin` to avoid prompting for entries that a discarded branch
   would have used (see §6.2).
2. In each pass, the engine resolves every entry whose argument references are **already in scope**: it
   renders that entry's arguments against the current scope, collects the function's inputs (prompting
   the user via the `InputResolver`), runs the function, and stores the result under the entry's name.
3. Passes repeat until all entries are resolved. If a pass resolves nothing while entries remain, those
   entries form an unsatisfiable or circular dependency and the render fails with an error naming them.

Consequences:

- **Prompting follows dependency order**, not strictly declaration order; declaration order is the
  tie-breaker within a pass.
- A conditional like `newManager: IfWithin(4M, {{me.StartDate}}, "…{{me.StartInPosition}}…")` resolves
  only after `me`; its date and text arguments are rendered (references substituted) before `IfWithin`
  runs, so the returned text already has its `{{…}}` replaced. Input collection for a conditional's
  branch is **deferred** until the condition is known — a discarded branch never prompts (§6.2).

### 4.5 Frontmatter fence and body boundary

The frontmatter grammar is line-based and unambiguous, so body `---` lines are always safe:

- A template **must** begin with a line containing exactly `---` (the **opening fence**), optionally
  preceded by a UTF-8 BOM and blank lines. A file whose first non-blank line is not `---` is treated as
  a **body-only template** (no frontmatter declarations). Body-only templates are useful as **static
  boilerplate** (e.g. a meeting-notes skeleton or a checklist with no dynamic fields) and for **graceful
  degradation** — a template whose frontmatter was accidentally deleted still renders its body rather
  than failing entirely.
- The frontmatter runs until the next line containing exactly `---` (the **closing fence**). The closing
  fence is **required** when an opening fence is present; a missing closing fence is a parse error (§12)
  naming the template — the whole file is **not** silently treated as frontmatter.
- **Everything after the closing fence is verbatim body**, including any `---` lines (Markdown
  horizontal rules and `---` separators are preserved untouched). Only the **first** opening/closing
  fence pair is the frontmatter; later `---` lines are body.
- A single newline immediately after the closing fence is consumed; all other body whitespace is
  preserved.
- **Template title (optional, from the body — not frontmatter).** A template's display title is its
  **first `# H1` heading in the body**, following the standard Markdown convention. There is **no**
  `title:` frontmatter field — the `name: FunctionCall(args)` grammar (§4.2) has no place for one. The
  title is **optional**: a template that opens with an `# H1` has that text as its title; a template
  with no `# H1` simply **has no title** (no filename derivation, no synthesized fallback). The heading
  stays part of the rendered body (only the frontmatter fence is stripped, §4.1). When a host lists
  templates (the QuickPick, `list-templates`), the **relative path is the always-present identifier**
  and the title is shown only when present (§5.1, §9.1).

---

## 5. User-visible behavior (in VS Code)

### 5.1 The `{template}` snippet

Templating is surfaced through the existing Snippets autocomplete:

1. The user types `{` in a Markdown file and selects the built-in **`{template}`** snippet
   (label "Template").
2. A QuickPick lists available templates (from the templates folder, grouped by category subfolder).
   The **relative path** is the always-present identifier; a template's **title** — its first body
   `# H1` (§4.5) — is shown when it has one, and templates without an `# H1` are listed by path alone.
3. After a template is chosen, its frontmatter functions are resolved by the multi-pass resolver
   (§4.4) in **dependency order**. Each function contributes zero or more QuickPick / input-box steps
   (see §6.1):
   - `PeopleSelector(Team)` → a QuickPick of the people in the `Team` group.
   - `PeopleSelector(A | B | C)` → first pick a group among `A`, `B`, `C`, **then** pick a person whose
     options are computed from the chosen group (the dependent-input cascade, §6.1).
   - `DeadlineSelector(1d, 3d)` → a QuickPick among the offered durations, each previewed via
     `formatDueIn` (e.g. "in 3 days (by Friday, May 01, 2026)"); the pick resolves to the `formatDueBy`
     phrase (§6.2).
   - `FreeText()` → an input box (its prompt may include resolved references, e.g.
     `FreeText("Notes about {{candidate.nickname}}")`).
   - `Me()` → no prompt (read from `Me.md`, §6.2).
   - `IfWithin(…)` → no prompt; contributes conditional text once its referenced entry is resolved
     (its branch inputs are collected only if the condition is true, §6.2).
4. The rendered text (frontmatter stripped) is inserted at the cursor, replacing the `{template}`
   trigger.

If the user cancels any step (Escape), the whole insertion is aborted and nothing is written.

The `{template}` completion item does **not** reuse the synchronous snippet `expand` path. Selecting it
fires a dedicated **`memoria.expandTemplate`** command (the item sets `insertText: ""` + `command`, the
existing parameterized-snippet pattern in
[snippetCompletionProvider.ts](../../../src/features/snippets/snippetCompletionProvider.ts)), which runs
the **async** multi-pass renderer (prompting interleaved with resolution, §4.4) and then inserts the
result — something the flat, synchronous `SnippetDefinition.expand` / `memoria.expandSnippet` cannot
express (§8.2).

**Trigger reservation.** `template` is a **reserved snippet trigger**: the snippet loader skips any
user-authored snippet that defines `trigger: "template"`, preventing it from shadowing the built-in
template snippet. This mirrors the built-in name collision rule for functions (§6.3).

### 5.2 Commands

| Command ID | Title | Behavior |
|---|---|---|
| `memoria.insertTemplate` | Memoria: Insert Template | Same flow as §5.1 but invokable from the Command Palette; inserts at the active cursor (or copies to clipboard if no editor is active). |
| `memoria.renderTemplateToFile` | Memoria: Render Template to New File | Pick template → resolve inputs → open a new untitled document containing the rendered text. |
| `memoria.renderTemplateToClipboard` | Memoria: Render Template to Clipboard | Pick template → resolve inputs → copy rendered text to the clipboard and show a confirmation. |

All three reuse the same engine core and the same `VsCodeInputResolver`.

### 5.3 Reset shipped template / function to default

Templates and user-function files shipped by the blueprint are tracked in the blueprint
`fileManifest` (same mechanism as Snippets, §11). Right-clicking a shipped file in the Explorer offers
**"Memoria: Reset template to default"**, which restores the bundled original and updates the manifest
hash. User-created files do not show this entry.

---

## 6. Functions

### 6.1 Function model

A template function declares the inputs it needs and resolves to a value. The engine never assumes a
UI; inputs are resolved through an injected `InputResolver` (QuickPick in VS Code, params/prompt in the
CLI). Before a function runs, the engine **renders its arguments** against the current scope (§4.4), so
references like `{{me.StartDate}}` and `{{…}}` inside quoted strings arrive already substituted.

```typescript
// Provided to user function files via the "memoria-templates" module.

export interface TemplateInput {
    /** Unique key within this function instance (qualified by the frontmatter name at runtime). */
    name: string;
    /** Human-readable prompt shown to the user. */
    label: string;
    /** How the value is collected. */
    kind: "pick" | "freeText";
    /** Static options for kind === "pick". */
    options?: { value: string; label: string; detail?: string }[];
    /**
     * Lazily compute pick options from the answers already collected for THIS function
     * (e.g. the person list depends on the already-picked group). Inspired by
     * `SnippetParameter.resolveOptions` in the Snippets feature but with a richer return type
     * (`{ value, label, detail }` objects instead of plain strings) and async support; takes
     * precedence over `options`.
     */
    resolveOptions?(ctx: TemplateContext):
        | { value: string; label: string; detail?: string }[]
        | Promise<{ value: string; label: string; detail?: string }[]>;
    /** Default value used when none is supplied. */
    default?: string;
}

/** One frontmatter argument after reference/template substitution (§4.4). */
export interface TemplateArg {
    /** Rendered scalar value (references and embedded `{{…}}` already substituted). */
    value: string;
    /** For union arguments (`A | B | C`), the list of options; otherwise undefined. */
    options?: string[];
}

export interface TemplateContext {
    /** Rendered arguments from the frontmatter call, in order (§4.4). */
    args: TemplateArg[];
    /** Inputs already collected for THIS function, by input name (dependent picks read these). */
    answers: Record<string, string>;
    /** Already-resolved frontmatter entries, for functions that inspect prior results. */
    scope: Record<string, unknown>;
    /** Today's date, injected for deterministic testing. */
    now: Date;
}

export interface TemplateFunction<T = unknown> {
    /** Function name as referenced in the frontmatter (e.g. "PeopleSelector"). */
    name: string;
    /**
     * Ordered inputs to collect. The engine collects them one-by-one and, before prompting each
     * `pick`, calls that input's `resolveOptions(ctx)` with all earlier answers visible in
     * `ctx.answers` — so a later input can depend on an earlier one (union PeopleSelector: first
     * "group", then a "person" whose options are computed from the chosen group). A function with
     * independent inputs simply lists them with static `options`.
     */
    describeInputs(ctx: TemplateContext): TemplateInput[] | Promise<TemplateInput[]>;
    /** Produce the result (object, scalar, or conditional text) from collected inputs + context. */
    resolve(inputs: Record<string, string>, ctx: TemplateContext): T | Promise<T>;
    /**
     * Text used when the body references {{name}} directly (no property). **Required** for functions
     * that return an object; for scalar-returning functions it defaults to `String(result)`. A bare
     * {{name}} on an object result with no `display()` is a diagnostic, not `[object Object]` (§4.3, §12).
     */
    display?(result: T): string;
    /**
     * Argument positions (0-based) whose `{{…}}` references are **branch content** — not extracted as
     * resolution dependencies (§4.4). The engine substitutes them from the current scope when the
     * function runs, rather than blocking on them. Used by conditional functions (e.g. `IfWithin`
     * declares `branchArgs: [2]` so its text argument does not force upstream entries to resolve).
     */
    branchArgs?: number[];
}
```

The engine renders **whatever the function returns** — an object (property access in the body is
generic, including nested paths), a string, or conditional text (return `""` to contribute nothing).
Built-in functions document their returned shapes; user functions are free to return any object or
string. `PeopleSelector` returns a flattened `ResolvedContact` (§6.2, §7); `Me()` returns the richer
`MeProfile` (§6.2).

**Where built-ins live (host-registered adapters).** The engine **core** ships only the two *pure*
built-ins that need nothing beyond `args`/`answers`/`scope`/`now`: `FreeText` and `IfWithin`. The
people/date built-ins — `PeopleSelector`, `Me`, `DeadlineSelector` — are **registered by the host** and
supplied to `renderTemplate` through the same function list as user functions (§8.1). They **close over
a `ContactsProvider`** (and `dateUtils`), so the core never imports `ContactsProvider`, `ResolvedContact`,
or `MeProfile` and stays free of Contacts types (§7, §8.1). Both hosts register the same pack: the
VS Code adapter closes over `LiveContactsProvider`, the CLI adapter over `DiskContactsProvider`.

### 6.2 Built-in functions

**`PeopleSelector(group [ | group2 | ...])`** → a **flattened contact object** (`ResolvedContact`, §7).
- With one group: prompts to pick a person from that contact group.
- With a union: first prompts to pick a group among the options, then a person.
- Reads people through the `ContactsProvider`; the returned object exposes the contact's fields and
  resolved sub-objects, with any extra Markdown fields flattened to top level (see schemas below).

**`Me()`** → the current user's **`MeProfile`**, parsed from **`Me.md`** in the Contacts people folder
(the same folder as `Team.md`, `Colleagues.md`) by a **dedicated `me`-kind parser** (schema below, §7).
No prompt. If `Me.md` is absent, `Me()` **short-circuits before declaring any inputs** (like the
Contacts-unavailable case, §7) and resolves to an error sentinel that renders as a **single
consolidated diagnostic** (e.g. `⚠️ template: Me.md not found — create it in the Contacts people
folder`), rather than scattering unknown-field markers at every `{{me.*}}` reference. Unlike
the people you track, you usually know **much more about yourself**, so `Me.md` is **not** constrained to
the Report/Colleague schema: it is a free-form dictionary whose every field — including fields **no
template references** — is **flattened** onto the profile and referenced by its **exact Markdown label**:
`{{me.TeamName}}`, `{{me.StartDate}}`, `{{me.StartInPosition}}`, `{{me.Email}}`, etc.

**`DeadlineSelector(dur1, dur2, ...)`** → a **human-friendly deadline string** (not a date object). It
**reuses the existing `dateUtils` helpers and introduces no new phrasing logic**: each duration argument
uses the grammar `\d+[dw]` (`d` = calendar days, `w` = weeks ×7 days; the `M` unit is **not accepted**
by `DeadlineSelector` — use `IfWithin` for month-based conditionals, §6.2). The parsed number of days is
rendered with
[`formatDueIn`/`formatDueBy`](../../../src/utils/dateUtils.ts). Prompts to pick one of the offered
durations, each **previewed** as `formatDueIn(days, ctx.now)` (e.g.
`"in 1 week and 3 days (by Wednesday, Apr 29, 2026)"`); the chosen option **resolves** to
`formatDueBy(days, ctx.now)` (e.g. `"by Wednesday, Apr 29, 2026"`).

**`FreeText([label])`** → the string the user types. The optional `label` argument customizes the
prompt and **may reference other frontmatter entries** (e.g. `FreeText("Notes about
{{candidate.nickname}}")`); the rendered label is shown as the input prompt.

**`IfWithin(duration, date, text)`** → returns `text` when `date` is within `duration` of `ctx.now`,
otherwise `""`. The `duration` argument uses the grammar `\d+[dwM]` — in addition to `d` (days) and `w`
(weeks), `IfWithin` supports the `M` (month) unit, approximated as ×30 calendar days. The `date`
argument is an **ISO 8601 date string** (`YYYY-MM-DD`); any other format is a parse error (§12). The
comparison uses **calendar-day granularity** against `ctx.now` (time-of-day is ignored). Because
arguments are rendered first (§4.4), `date` (typically `{{me.StartDate}}`) and any `{{…}}` inside `text`
whose referenced entries are already in scope are substituted. `IfWithin` declares `branchArgs: [2]`
(§6.1), so references inside the text argument are **not** extracted as resolution dependencies — they
are substituted from the current scope when `IfWithin` runs, not forced to resolve beforehand. If the
condition is **false**, the text is discarded entirely and none of its references are evaluated; a
discarded branch never prompts the user. This is the canonical
**conditional function**; users author more of them the same way (return a string or `""`).

#### Contact object schemas (`ResolvedContact`, flattened)

`PeopleSelector` returns the Contacts feature's `ResolvedContact` — the stored contact plus resolved
reference data — with **extra Markdown fields flattened to top level**. There are two stored schemas:

- **Common** (both): `id`, `nickname`, `fullName`, `title`, `careerPathKey`, `pronounsKey`.
- **TeamMember / Report** (`kind: "report"`, stored in `Team.md`) additionally: `levelId`,
  `levelStartDate`, `employeeId`, `bandRank`, `overallRank`.
- **Colleague** (`kind: "colleague"`) — the common fields only.

Resolved sub-objects available on both (enable nested paths):

- `groupName`, `groupFile`, `groupType`, `isCustomGroup`, `shortTitle`
- `resolvedPronouns` → `{ key, subject, object, possessiveAdjective, possessive, reflexive }`
- `resolvedCareerPath` → `{ key, name, short, minimumCareerLevel }`
- `resolvedCareerLevel` → `{ key, id (number), interviewType, titlePattern }` (reports only; `null` for
  colleagues)
- `resolvedInterviewType` → `{ key, name }` (reports only; `null` for colleagues)

**Flattening rule:** each entry of the contact's `extraFields` is hoisted to a top-level property under
its **exact Markdown label**, so `{{candidate.SomeCustomField}}` works. Typed fields keep their
camelCase runtime names (`fullName`, `nickname`, `levelId`, …); only free-form/extra fields carry the
label casing. Flattening **never shadows** a known property (`kind`, `id`, `nickname`, `fullName`,
`title`, `careerPathKey`, `pronounsKey`, `levelId`, `levelStartDate`, `employeeId`, `bandRank`,
`overallRank`, `extraFields`, `droppedFields`), a resolved sub-object (`groupName`, `groupFile`,
`groupType`, `isCustomGroup`, `shortTitle`, `resolvedPronouns`, `resolvedCareerPath`,
`resolvedCareerLevel`, `resolvedInterviewType`), or any other property already present on the
`ResolvedContact` type — those win; a colliding extra field is skipped and noted in `diagnostics`.
The raw `extraFields` / `droppedFields` maps remain available for callers that need them.

Example references: `{{candidate.fullName}}`, `{{provider.resolvedPronouns.subject}}`,
`{{candidate.resolvedCareerLevel.id}}`, `{{candidate.shortTitle}}`. (The example `{{candidate.level+1}}`
needs arithmetic and so must be computed inside a function — §6.4.)

#### Self profile (`MeProfile`) and the `me` document kind

`Me()` returns a **distinct, richer shape** because you typically record more about yourself than about
others, so `Me.md` gets its **own document kind and parser** rather than reusing the group parser.

- **New `ContactDocumentKind` type.** A new type `ContactDocumentKind = ContactKind | "me"` is
  introduced to distinguish the `Me.md` document format from group documents. The existing
  `ContactKind` (`"report" | "colleague"`) is **unchanged** — `ContactGroup.type` in the blueprint
  manifest continues to accept only `"report" | "colleague"`, so a group can never have type `"me"`.
  The `"me"` kind denotes a **single-record, free-form** document (one profile, not a list of
  `#`-keyed contacts) and is **not** validated against the Report/Colleague field schema.
- **Dedicated parser `parseMeProfileDocument(text): MeProfile`.** A new pure function in
  [contactParser.ts](../../../src/features/contacts/contactParser.ts) (sibling to
  `parseContactGroupDocument`) that reads the same `- Field: value` lines but **does not require a `#`
  heading** and yields a single flat profile. It **dynamically includes every field present in the
  file** — including fields **no template references** — so nothing is dropped and nothing is required.
- **`MeProfile` schema.** A flat dictionary keyed by the **exact Markdown label**:

  ```typescript
  export interface MeProfile {
      /** Every `- Label: value` line in Me.md, keyed by its exact label (e.g. "TeamName"). */
      [field: string]: string;
  }
  ```

  Templates reference fields by label (`{{me.TeamName}}`, `{{me.StartDate}}`, `{{me.Email}}`); any field
  the user adds is available immediately with no schema change. The renderer detects missing fields via
  `Object.hasOwn(profile, fieldName)`: a field present in `Me.md` exists in the dictionary (even if its
  value is an empty string); a field absent from the file is not in the dictionary and triggers the
  unknown-field marker (§12). A few conventional fields the shipped
  templates expect — `FullName`, `FirstName`, `TeamName`, `StartDate`, `Email` — are **documented, not
  enforced**: if absent, references to them surface the usual unknown-field marker (§12).

### 6.3 User-extensible functions

Users add `.ts` files under the templates folder's `_functions/` subfolder. Each file
`export default`s one or more `TemplateFunction` objects:

```typescript
import type { TemplateFunction } from "memoria-templates";

const functions: TemplateFunction[] = [
    {
        name: "Project",
        describeInputs: () => [
            { name: "name", label: "Project name", kind: "freeText" },
        ],
        resolve: (inputs) => ({ name: inputs.name, slug: inputs.name.toLowerCase().replace(/\s+/g, "-") }),
        display: (p) => (p as { name: string }).name,
    },
    {
        // A user-defined conditional: emit the text only on/after a cutoff date.
        name: "IfAfter",
        describeInputs: () => [],
        resolve: (_inputs, ctx) => {
            const cutoff = ctx.args[0]?.value;
            const text = ctx.args[1]?.value ?? "";
            return cutoff && ctx.now >= new Date(cutoff) ? text : "";
        },
    },
];

export default functions;
```

- Files are compiled at runtime with **sucrase** and evaluated in the **shared sandbox module**
  extracted from the Snippets compiler (§8.1, §8.4): only the `memoria-templates` module may be
  imported; Node built-ins (`fs`, `child_process`, …) are blocked (`BLOCKED_MODULES`).
- **Built-in names are reserved (namespaced).** `PeopleSelector`, `Me`, `DeadlineSelector`, `FreeText`,
  and `IfWithin` belong to a reserved built-in namespace. A user function whose `name` collides with a
  built-in (or with another user function) **fails loudly at load time** — the file is rejected with a
  precise error naming the conflicting function, plus a warning notification (VS Code) / non-zero exit
  (CLI). Built-ins are **never silently overridden**; a variant must use a different name.
- The same files are loaded by the CLI through the same shared sandbox, so user functions work
  identically outside VS Code.

### 6.4 Conditional and computed text via functions

Logic lives in **functions**, not in the `{{…}}` body language. This keeps the body declarative while
still covering the motivating examples:

- **Conditional text** — `newManager: IfWithin(4M, {{me.StartDate}}, "…{{me.StartInPosition}}…")`.
  `IfWithin` (built-in, §6.2) returns the rendered text or `""`. Users define more conditionals by
  authoring functions that return a string or `""` (see `IfAfter` in §6.3).
- **Cross-references** — passing `{{me.StartDate}}` (or any `{{other.prop}}`) as an argument is
  supported and drives the multi-pass resolver (§4.4).
- **Computation / arithmetic** — `{{candidate.level+1}}` is **not** valid in the body (no arithmetic in
  `{{…}}`). Compute it in a function instead: e.g. a
  `nextLevel: NextLevel({{candidate.resolvedCareerLevel.id}})` declaration whose function reads
  `ctx.args[0].value` (the substituted level id string), computes the incremented value, and returns
  `{ value }`, referenced as `{{nextLevel.value}}`. Alternatively, the function can look up
  `ctx.scope["candidate"]` to access the full resolved object.

The only remaining body restriction is therefore arithmetic/function-calls inside `{{…}}`; property
access (including nested paths) and conditional/cross-referencing **functions** are all supported.

---

## 7. Contacts integration (decoupled)

The engine **core** carries **no Contacts types**. `ContactsProvider` and the people/date built-ins
that consume it are **host-registered adapters** (§6.1, §8.1); the core only ever sees the generic
`TemplateFunction` list. The provider is a narrow interface that returns the Contacts feature's
`ResolvedContact` (§6.2):

```typescript
export interface ContactsProvider {
    /** Group names available to PeopleSelector. */
    listGroups(): string[];
    /** Flattened people in a group (empty if the group is unknown or Contacts is unavailable). */
    getGroupContacts(groupName: string): ResolvedContact[];
    /** The current user's flattened MeProfile parsed from Me.md, or null if absent. */
    getMe(): MeProfile | null;
    /** Whether Contacts data is available at all (false ⇒ short-circuit people built-ins, §12). */
    isAvailable(): boolean;
}
```

Two implementations:

- **`LiveContactsProvider`** (VS Code) — wraps `ContactsFeature.getSnapshot()`. We add a convenience
  accessor `getGroupContacts(groupName)` to
  [contactsFeature.ts](../../../src/features/contacts/contactsFeature.ts) that filters
  `ResolvedContact[]` by `groupName`, plus a `getMe()` that parses `Me.md`. (`ResolvedContact`
  already carries `groupName`, `nickname`, `fullName`, resolved pronouns/career data, etc.)
- **`DiskContactsProvider`** (CLI) — reads the group `.md` files from disk and calls the existing
  **pure** `parseContactGroupDocument(text, kind)`, and reads `Me.md` via the **new pure**
  `parseMeProfileDocument(text)` (the `me` kind, §6.2) — both from
  [contactParser.ts](../../../src/features/contacts/contactParser.ts). To produce `ResolvedContact`
  (with `resolvedPronouns`, `resolvedCareerPath`, etc.) it also reads the reference-data files
  (`Pronouns.md`, `CareerLevels.md`, `CareerPaths.md`, `InterviewTypes.md`) from the `DataTypes/`
  subfolder using the existing pure parsers (`parsePronounsDocument`, `parseCareerLevelsDocument`,
  etc.) and calls `buildResolvedContact` from the extracted `contactResolution.ts` (§8.5). It
  discovers each group file's `ContactKind` from the blueprint manifest's `contacts.groups` entries
  (which map file names to kinds). No `vscode` dependency.

**Contacts disabled / absent (no wasted prompts).** When `isAvailable()` is `false` (Contacts disabled
or no data), the host-registered people built-ins **short-circuit before declaring any inputs**:
`PeopleSelector` and `Me` collect **no** picks and resolve to an error sentinel that renders as a
**single consolidated diagnostic** (e.g. `⚠️ template: Contacts is unavailable — PeopleSelector/Me
cannot resolve`), rather than prompting for a group and only then failing, and rather than scattering a
marker at every `{{me.*}}` reference (§12).

---

## 8. Engine architecture

### 8.1 Single core, two adapters

```
                ┌─────────────────────────────────────────────────────┐
                │     Template engine core (no vscode, no Contacts)    │
                │  templateParser · templateEngine · renderer          │
                │  pure built-ins (FreeText, IfWithin) · function loader │
                └───────────────┬───────────────────────┬──────────────┘
                                │ InputResolver         │ TemplateFunction[] (registered)
              ┌─────────────────┴───────────┐   ┌────────┴────────────────────────────┐
              │ VS Code host adapters        │   │ CLI adapters                        │
              │ VsCodeInputResolver          │   │ CliInputResolver                    │
              │ people built-ins ← Live-     │   │ people built-ins ← Disk-            │
              │   ContactsProvider           │   │   ContactsProvider                  │
              └──────────────────────────────┘   └─────────────────────────────────────┘
```

The core exposes a single entry point:

```typescript
export interface RenderOptions {
    templateText: string;
    inputResolver: InputResolver;
    /**
     * All non-core functions: the host-registered people/date built-ins
     * (PeopleSelector/Me/DeadlineSelector, closed over a ContactsProvider) followed by user
     * functions. The core adds its pure built-ins (FreeText, IfWithin) itself and never imports
     * ContactsProvider/ResolvedContact/MeProfile (§6.1, §7).
     */
    functions: TemplateFunction[];
    /** Overrides "now" for deterministic tests; defaults to new Date(). */
    now?: Date;
}

export interface RenderResult {
    /** Body with all substitutions applied and frontmatter removed. */
    text: string;
    /** The resolved scope: frontmatter name → result object (also returned for the CLI `invoke` verb). */
    scope: Record<string, unknown>;
    /** Non-fatal issues (unknown property, empty group, …). */
    diagnostics: string[];
}

export async function renderTemplate(options: RenderOptions): Promise<RenderResult>;
```

`InputResolver` is the only abstraction over UI:

```typescript
export interface InputResolver {
    /** Resolve a single input. Implementations decide interactive vs. param-driven. */
    resolve(input: TemplateInput, qualifiedKey: string): Promise<string | undefined>;
}
```

**Qualified key scheme.** The `qualifiedKey` passed to `InputResolver.resolve` is
`<frontmatterName>.<inputName>` — e.g. for a frontmatter entry `candidate: PeopleSelector(Team)` whose
function declares inputs named `group` and `person`, the keys are `candidate.group` and
`candidate.person`. When two entries use the same function (e.g. two `PeopleSelector` calls with
different frontmatter names), the frontmatter name prefix guarantees distinct keys. The CLI's `--params`
JSON uses the same keys. `describe` emits these qualified keys so callers can pre-populate `--params`.

- **`VsCodeInputResolver`** — `pick` → `showQuickPick`; `freeText` → `showInputBox`. Returning
  `undefined` (Escape) aborts the render.
- **`CliInputResolver`** — looks up `qualifiedKey` in the supplied `--params` JSON. If present, uses it.
  If absent and stdin is a TTY, prompts in-terminal (readline). If absent and non-interactive, fails
  with a precise "missing input" error naming the key.

### 8.2 Proposed module layout

Templating is **fully part of the Snippets feature**, so the engine lives under the snippets folder
(no separate feature toggle or blueprint feature entry). The sandbox is **extracted first** as a shared,
`vscode`-free module (see the prerequisite in §8.4):

```
src/features/snippets/
├── sandbox.ts                   ← NEW: vscode-free compile+evaluate (sucrase + new Function + BLOCKED_MODULES,
│                                  parameterized by the allowed module name/payload). Imported by
│                                  snippetCompiler.ts, functionLoader.ts, AND the CLI.
├── contactsProvider.ts          ← ContactsProvider interface (no vscode; references Contacts types — this is the
│                                  adapter seam, not the core). Imported by peopleFunctions.ts and both hosts.
├── peopleFunctions.ts           ← PeopleSelector, Me, DeadlineSelector factory: create(contacts) ⇒ TemplateFunction[]
│                                  (host-registered adapter pack; closes over ContactsProvider + dateUtils; no vscode)
├── liveContactsProvider.ts      ← LiveContactsProvider (imports vscode; wraps ContactsFeature)
├── vscodeInputResolver.ts       ← VS Code InputResolver adapter (imports vscode)
├── templateCommands.ts          ← insert / render-to-file / render-to-clipboard commands + the
│                                  memoria.expandTemplate handler the {template} completion invokes (§5.1)
└── templates/                   ← ENGINE CORE: every file here is vscode-free AND Contacts-type-free
    ├── templateTypes.ts         ← TemplateFunction, TemplateInput, TemplateArg, TemplateContext
    ├── templateParser.ts        ← frontmatter + body parsing, fence/escaping rules (pure, §4.2/§4.5)
    ├── templateEngine.ts        ← renderTemplate() multi-pass orchestration (pure; injected adapters)
    ├── expressionRenderer.ts    ← {{name}} / {{name.a.b.c}} substitution, shared by body + arguments (pure)
    ├── coreBuiltins.ts          ← FreeText, IfWithin (pure; no Contacts/date deps)
    └── functionLoader.ts        ← compile/evaluate user .ts files via sandbox.ts; built-in-name guard (§6.3)
```

The built-in `{template}` completion and the template commands are registered by `SnippetsFeature`,
which also loads template files and user functions alongside snippet files. The CLI imports
`sandbox.ts`, the `templates/` core (`templateParser`/`templateEngine`/`expressionRenderer`/
`coreBuiltins`/`functionLoader`), plus `contactsProvider.ts` and `peopleFunctions.ts` (building its own
`DiskContactsProvider`) — none of which import `vscode`. The `templates/` directory is the strict
engine core boundary: it contains no `vscode` imports and no Contacts types. Adapter files
(`contactsProvider.ts`, `peopleFunctions.ts`, `liveContactsProvider.ts`, `vscodeInputResolver.ts`,
`templateCommands.ts`) live at the `snippets/` level outside this boundary.

### 8.3 Where templates and functions live (shipped with the extension)

The extension ships a starter library into the workspace templates folder at initialization (via the
blueprint, §11). The folder is configured on the **Snippets** blueprint entry/manifest (§11). `Me()`
reads `Me.md` from the **Contacts people folder**, not the templates folder.

```
11-Templates/                  ← templatesFolder (Snippets manifest: snippets.templatesFolder)
├── People-Related/
│   ├── PerspectivesTemplate-known.md
│   ├── PerspectivesTemplate-stranger.md
│   └── Promo/
│       └── PromoFeedbackRequest.md
└── _functions/                ← user-extensible TemplateFunction .ts files
    └── example.ts

<people folder>/               ← Contacts feature folder (e.g. People/)
├── Team.md
├── Colleagues.md
└── Me.md                      ← consumed by Me() (user-edited; same dictionary format)
```

Users may add their own templates (any category subfolder) and functions; these are user-owned (not in
the manifest) and never overwritten by updates.

### 8.4 Prerequisite: extract a shared `vscode`-free sandbox

The "single engine, no duplication" promise depends on the user-function sandbox being callable from the
CLI, but today's compiler is **`vscode`-coupled**: `compileSnippetFile(fileUri: vscode.Uri, fs: typeof
vscode.workspace.fs)` requires VS Code types, and its private `createSafeRequire` **hardcodes the single
module id `"memoria-snippets"`** (see
[snippetCompiler.ts](../../../src/features/snippets/snippetCompiler.ts)). The CLI can supply neither a
`vscode.Uri` nor `vscode.workspace.fs`, and cannot import `"memoria-templates"`.

This is a **bounded but mandatory refactor that must land first, as its own PR**:

1. Extract the pure evaluation core into `src/features/snippets/sandbox.ts`:
   `compileSource(source: string, allow: { module: string; payload: Record<string, unknown> }):
   unknown[]` — the existing `transform(… ["typescript","imports"]) → new Function(…) →
   createSafeRequire(…)` mechanism, **parameterized** by the allowed module name and payload, with the
   same `BLOCKED_MODULES` set and **no `vscode` import** (today it appears only in type positions and is
   elided by esbuild; the extracted module drops it entirely).
2. Re-point `snippetCompiler.ts` to call `sandbox.ts` with `{ module: "memoria-snippets", payload: … }`;
   add `functionLoader.ts` calling it with `{ module: "memoria-templates", payload: … }`.
3. **Regression surface = Snippets.** Because this touches the compiler every snippet depends on
   (contact snippets, path-safe snippets, user snippets), the extraction PR must keep the existing
   Snippets unit/E2E suites green **before** any template code is added, so a regression is attributable
   and revertible on its own.

Only after this lands does "the CLI loads the same function files" become true (this is *not* free reuse;
it is the first work item).

### 8.5 Prerequisite: extract pure contact resolution

The `DiskContactsProvider` (§7) must return `ResolvedContact` (with `resolvedPronouns`,
`resolvedCareerPath`, etc.), but `buildResolvedContact` and the `ResolvedContact` type live in
[contactUtils.ts](../../../src/features/contacts/contactUtils.ts), which imports `vscode` for unrelated
URI helpers (`joinRelativePath`, `disposeAll`). The CLI cannot `require("vscode")`.

The pure contact parsers (`contactParser.ts`) and reference defaults (`referenceDefaults.ts`) are
already `vscode`-free. The extraction is:

1. Move the pure resolution functions (`buildResolvedContact`, `buildResolvedReferenceData`,
   `buildShortTitleLookup`) and their associated types/interfaces (`ResolvedContact`, `ContactGroupInfo`,
   `ResolvedContactsReferenceData`, `ResolvedCareerLevelReference`) from `contactUtils.ts` to a new
   `src/features/contacts/contactResolution.ts` — no `vscode` import. `contactUtils.ts` re-exports them
   for backward compatibility. Note: `buildResolvedContact` takes the **unresolved**
   `ContactsReferenceData` (from `types.ts`), not `ResolvedContactsReferenceData`. The
   `DiskContactsProvider` passes raw parsed reference data to `buildResolvedContact`, which resolves
   career levels internally; `ResolvedContactsReferenceData` and `ResolvedCareerLevelReference` are
   extracted because they are used by `buildResolvedReferenceData` and downstream consumers.
2. The CLI adapter imports from `contactResolution.ts`, `contactParser.ts`, and `referenceDefaults.ts` —
   all pure.

This is a smaller, bounded extraction (the functions are already logically pure) and can ship in the
same PR as the sandbox extraction or separately.

### 8.6 Prerequisite: ship `Me.md` stub in the Contacts blueprint

`Me()` reads from `Me.md` in the Contacts people folder (§6.2), but this file does not exist in the
current Contacts blueprint. A **stub `Me.md`** (with commented-out conventional fields: `FullName`,
`FirstName`, `TeamName`, `StartDate`, `Email`) must be added to the Contacts blueprint's shipped
resources and included in `fileManifest`. The Contacts blueprint's initialization copies it into the
people folder alongside `Team.md` and `Colleagues.md`. This is a change to the **Contacts** feature
blueprint, not to Snippets/templating, and should land before or alongside the templating work.

---

## 9. Node CLI (`dist/template-cli.cjs`)

A new **seventh** esbuild entry point in
[esbuild.config.mjs](../../../src/esbuild.config.mjs), bundled with `external: ["vscode"]`,
`platform: "node"`, `format: "cjs"`. It imports only the engine core and the CLI adapters.

### 9.1 Verbs

| Verb | Arguments | Output |
|---|---|---|
| `render` | `<templatePath> [--params <json>] [--out <file>] [--force] [--root <dir>]` | Rendered text to stdout (or `--out` file). Frontmatter stripped. `--out` **refuses to overwrite** an existing file unless `--force` is given (non-zero exit otherwise). |
| `invoke` | `<target> [--params <json>] [--root <dir>]` | Resolve a single function and print its result as JSON. `<target>` is **either** a raw call (`PeopleSelector(Team)`) **or** a `templatePath#name` reference resolving one frontmatter entry of a template (e.g. to read a recipient's custom `Email` field — there is no typed `email` field, §6.2). |
| `describe` | `<templatePath> [--root <dir>]` | JSON input schema for every frontmatter function (qualified keys, kinds, options) so a host can pre-collect values. |
| `list-templates` | `[--root <dir>]` | JSON array of available templates: `path` (relative, always present), `category`, and `title` (the first body `# H1`, or `null` when the template has none, §4.5). |

- `--params` is a JSON object mapping **qualified input keys** (`candidate.person`, `provider.group`,
  `deadline.choice`, `project.name`, …) to string values. `describe` reveals the exact keys.
- **`describe` and dynamic options** — for functions with `resolveOptions` (e.g. `PeopleSelector(Team |
  Managers)` where person options depend on the chosen group), `describe` emits the input with
  `kind: "pick"` and `dynamic: true` instead of a static `options` array. The caller must supply the
  earlier answers (via `--params`) and re-run `describe` to obtain the cascaded options, or supply the
  value directly without enumeration. Static-option inputs include the full `options` array as before.
- `--root` is the **workspace root** directory. Defaults to the workspace root from
  `engine-config.json` (§9.2), else the current directory. Templates are located at
  `<root>/<templatesFolder>` (where `templatesFolder` comes from `engine-config.json`, is overridden
  by `--templates-folder`, or — if neither is available — is read from
  `<root>/.memoria/blueprint.json` at `snippets.templatesFolder`). Contacts are located via the
  blueprint manifest at `<root>/.memoria/`. This ensures the CLI is usable without prior VS Code
  activation as long as the workspace has been initialized (the blueprint manifest exists).
- `--out` is resolved and **confined to `--root`** (the workspace tree): the CLI rejects an
  `--out` that escapes the root via `..` or an absolute path outside it, mirroring the path-safety the
  Snippets feature already enforces. Combined with the no-overwrite-without-`--force` rule above, a
  render can never silently clobber or write outside the workspace.
- **`invoke` raw-call parsing** — when `<target>` is a raw call (`PeopleSelector(Team)` rather than a
  `templatePath#name` reference), the CLI reuses `templateParser` in **call-only mode**: it parses the
  `FunctionName(args)` production without requiring the `name:` prefix, applying the same tokenizer and
  escaping rules (§4.2).
- **`invoke templatePath#name` dependency resolution** — when `<target>` is a `templatePath#name`
  reference, `invoke` runs the **full multi-pass resolver** for the template, resolving all upstream
  dependencies of the named entry (prompting for their inputs via `--params` or in-terminal). Only the
  named entry's result is printed as JSON; upstream entries are resolved but their results are not
  emitted. If the named entry has no dependencies, only that entry is resolved.
- `render` writes **only** to stdout (or `--out`); copying to the clipboard is the caller's choice (the
  SKILL's `Clipboard` channel pipes stdout to `Set-Clipboard`). This keeps stdout and clipboard as
  distinct output paths.
- Uses `CliInputResolver` + `DiskContactsProvider`. Exit code `0` on success; non-zero with a
  descriptive `stderr` message on missing inputs, parse errors, or unknown functions/templates.

### 9.2 Engine discovery (`engine-config.json`)

To let external callers find Node and the bundled CLI robustly, the extension writes
`.memoria/engine-config.json` on activation:

```json
{
    "version": "1.0.0",
    "node": "C:\\Program Files\\nodejs\\node.exe",
    "cli": "C:\\Users\\me\\.vscode\\extensions\\memoria-x.y.z\\dist\\template-cli.cjs",
    "workspaceRoot": "C:\\Users\\me\\My-Workspace",
    "templatesFolder": "11-Templates"
}
```

Callers **prefer** `engine-config.json`; if it is missing or stale they **fall back** to `node` on
`PATH` and resolve the CLI relative to the installed extension. (This satisfies the "prefer config,
fall back to PATH" decision.)

**Machine-local, not committed.** `engine-config.json` holds **absolute, version-stamped, per-machine
paths**, so it is the one file under `.memoria/` that is **gitignored** (`.memoria/engine-config.json`,
§11); the rest of `.memoria/` (e.g. `blueprint.json`) **stays committed**. It is rewritten on every
activation.

**Discovery is robust to staleness and version skew.** Because the file is regenerated per machine and
the extension updates in place, a caller must treat it as a **hint to validate, never a path to execute
blindly**:

- **Validate before use** — confirm `node` and `cli` exist and are executable; if either is missing,
  fall back to `node` on `PATH` + the CLI resolved relative to the installed extension.
- **Tolerate version skew** — when the recorded `cli` path is absent (extension upgraded, folder
  renamed `memoria-x.y.z` → `memoria-x.y.z+1`), **glob the newest** `…/extensions/memoria-*/dist/
  template-cli.cjs` rather than trusting the stale absolute path.
- **Check compatibility** — compare `version` (major) against the caller's expectation; on a mismatch,
  prefer re-discovery over running an incompatible CLI.
- **Never execute an unvalidated path** — the resolved `node`/`cli` are run only after these checks
  (§11, §13).

---

## 10. The SKILL (email / Teams / text)

The extension itself produces only **text** (stdout/clipboard) and **new files**. Sending is delegated
to a PowerShell SKILL so the extension stays free of mail/Graph concerns and no message is ever sent
automatically. The SKILL is **shipped as blueprint content** and deployed into `.vscode/skills/` at
workspace initialization (alongside templates, snippets, etc.).

`.vscode/skills/send-templated-message/`
```
SKILL.md
scripts/
└── Send-TemplatedMessage.ps1
```

`Send-TemplatedMessage.ps1` responsibilities:

1. **Locate the engine** — read `.memoria/engine-config.json`; fall back to `node` on `PATH` + CLI
   relative to the extension.
2. **Render text** — `& $node $cli render <template> --params <json>` and capture stdout.
3. **Resolve recipients/objects when needed** — `& $node $cli invoke 'PeopleSelector(Team)' --params <json>`
   (or `invoke 'People-Related/Promo/PromoFeedbackRequest.md#provider'`) to obtain the resolved
   contact, then read its **custom `Email` field** for addressing (there is no typed `email` field —
   `Email` is a free-form contact field, §6.2; if absent, the skill tells the user and skips addressing).
4. **Act**, based on a `-Channel` parameter:
   - `Stdout` — write the rendered text to stdout (for piping).
   - `Clipboard` — copy the rendered text via `Set-Clipboard`.
   - `File` — write the rendered text to a path; **refuses to overwrite** an existing file unless
     `-Force` is supplied (the CLI's `--out`/`--force` rule, §9.1), so a generated message never
     silently clobbers an existing file.
   - `Email` — open a **pre-filled** compose surface, never auto-send. **Prefer Outlook/MAPI** (full
     body, no length limit). Fall back to a `mailto:` link **only when** the URL-encoded subject+body
     stays under a safe length (~1800 chars, well below the ~2000-char URL ceiling); if it would exceed
     that, **copy the body to the clipboard, open an empty compose window, and tell the user** to paste
     (so a long message is never silently truncated).
   - `Teams` — open a **pre-filled** Teams deep link, never auto-send, with the **same length guard**:
     if the encoded deep link would exceed the safe length, copy the body to the clipboard, open the
     chat, and tell the user to paste.

`SKILL.md` documents when to use the skill, the exact CLI verbs it relies on, the `--params` schema (as
produced by `describe`), and the trust boundary (templates/functions are user-authored workspace files).

---

## 11. Storage, blueprints, and lifecycle

- **No separate feature** — templating is folded entirely into **Snippets**. The Snippets blueprint
  entry gains a `templatesFolder` field: a new `templatesFolder: string` property is added to
  `SnippetsManifestConfig` (alongside the existing `snippetsFolder`) and to `SnippetsFeatureEntry`.
  It is stored in `.memoria/blueprint.json` under `snippets.templatesFolder` (no separate `templates`
  feature entry or manifest section). This is a **schema change** to the existing manifest types.
- **Shipping** — at workspace initialization the blueprint copies the starter templates and
  `_functions/` examples into the templates folder, and the SKILL (`Send-TemplatedMessage.ps1` +
  `SKILL.md`) into `.vscode/skills/send-templated-message/` (§10); content hashes are recorded in
  `fileManifest` (reused from `BlueprintManifest`), enabling reset-to-default (§5.3). `Me.md` is
  shipped/managed by the **Contacts** blueprint in the people folder (an empty stub the user fills in),
  not by templating.
- **Loading** — when the Snippets feature starts, it loads user function `.ts` files (compiled via the
  shared sucrase sandbox), indexes available templates, and registers the `{template}` snippet and the
  template commands. A debounced `FileSystemWatcher` reloads on changes to template `.md` files and
  `_functions/*.ts`.
- **Disabled feature** — if Snippets is disabled, the `{template}` snippet and the template commands are
  unregistered, matching existing Snippets behavior. The CLI remains usable independently.
- **Engine config (gitignored)** — on activation the extension (re)writes `.memoria/engine-config.json`
  with absolute, version-stamped paths (§9.2). It is the **only** `.memoria/` file that is gitignored.
  The extension ensures the entry `.memoria/engine-config.json` (without a leading `/`, so it matches
  regardless of `.gitignore` placement) is present in a `.gitignore` file **at the workspace root**
  (appending it if missing; creating the file if necessary). If the workspace root is not the git
  repository root, a `.gitignore` in the workspace root subdirectory still takes effect for files under
  it. `blueprint.json` and everything else under `.memoria/` stay committed.
- **Stateless dual compilation** — the same template/function files are compiled twice (extension host
  and CLI) from disk, with **no shared runtime state** between them. Functions must therefore be
  **side-effect-free at module top level** (do work inside `resolve`, not at import); the loader treats
  each compilation as fresh, so a function behaves identically whether invoked in VS Code or via the CLI.
- **Removal / cleanup cascade** — disabling or removing templating is **Snippets' responsibility**
  because there is no separate feature: the `{template}` completion, template commands, file watchers,
  and the `memoria.expandTemplate` handler are all disposed with the Snippets feature. User-authored
  templates, `_functions/*.ts`, and `Me.md` are **never deleted** (they are user-owned workspace files);
  only the `snippets.templatesFolder` blueprint field and the machine-local `engine-config.json` are
  Memoria-managed, and reset-to-default only touches manifest-tracked seed files (§5.3).

---

## 12. Error handling

- **Parse errors** (malformed frontmatter line, unknown function): the render fails with a precise
  message naming the offending line; in VS Code a warning notification is shown, in the CLI a non-zero
  exit with `stderr`.
- **Unknown name/property in the body** (`{{foo.bar}}` where `foo` is undeclared or `bar` is missing):
  an inline marker `⚠️ template: unknown {{foo.bar}}` is emitted and the issue is added to
  `diagnostics`; the rest of the document still renders.
- **Non-text value in the body** (`{{name}}` resolves to an object/array — e.g. a bare
  `{{candidate}}` or `{{me}}` — with no `display()` to stringify it): an inline marker
  `⚠️ template: {{name}} is not text` is emitted and recorded in `diagnostics` instead of dumping
  `[object Object]`; the author is steered to a leaf path (`{{candidate.nickname}}`) or a function that
  defines `display()` (§6.1, §6.3).
- **Built-in name collision at load** — a user function whose `name` matches a reserved built-in (or
  another user function) is **rejected when functions load**, before any render: a precise error names
  the conflicting function (warning notification in VS Code, non-zero exit in the CLI). Built-ins are
  never silently overridden (§6.3).
- **Function throws during `resolve`**: the failure is reported (notification in VS Code, `stderr` in
  CLI) and the render aborts, mirroring snippet error handling.
- **Contacts unavailable / empty group** — when Contacts is disabled or has no data, the people
  built-ins **short-circuit before prompting** and surface a **single consolidated diagnostic**
  (e.g. `⚠️ template: Contacts is unavailable — PeopleSelector/Me cannot resolve`) rather than a marker
  at every `{{me.*}}` reference or a group prompt that only then fails (§7). An empty (but available)
  group likewise offers no picks with a clear inline error instead of crashing.
- **Invalid duration or date argument** — these errors arise at two stages:
  - **Parse-time** — an unrecognized duration unit (e.g. `3x`) or a non-numeric duration (e.g. `abc`)
    is rejected by the frontmatter parser before any function runs.
  - **Function-validation-time** — a syntactically valid duration used by a function that rejects it
    (e.g. `DeadlineSelector(4M)` — `4M` parses as a valid `number+unit` per §4.2, but
    `DeadlineSelector` rejects the `M` unit), or an invalid date string passed to `IfWithin` (anything
    that is not `YYYY-MM-DD`), is rejected when the function's `resolve` runs. The function throws a
    descriptive error, which the engine reports as a function failure (same path as “Function throws
    during `resolve`” above).

  In both cases the render fails with a precise message naming the offending argument and function.
- **Cancellation** (Escape in VS Code): `renderTemplate` aborts **immediately** when any
  `InputResolver.resolve()` returns `undefined`. Already-resolved entries in the partial scope are
  discarded; nothing is inserted, written, or copied. The CLI equivalent is a missing `--params` key
  in non-interactive mode (non-zero exit).

---

## 13. Security considerations

- **Trust model (defense-in-depth, not an isolation boundary)** — user function `.ts` files execute via
  sucrase + `new Function`, identical to the existing Snippets sandbox: only the `memoria-templates`
  module is importable and Node built-ins are blocked (see `BLOCKED_MODULES` in the shared `sandbox.ts`,
  §8.4). This is **defense-in-depth, not a true security sandbox** — `new Function` shares the host
  realm, so the real boundary is that templates and functions are **user-authored workspace files** at
  the same trust level as snippets, not untrusted third-party code. Reserved built-in names cannot be
  shadowed by user functions (§6.3), so a malicious file cannot silently impersonate `PeopleSelector`
  or `Me`.
- **`engine-config.json` is untrusted input** — although Memoria writes it, a caller (the SKILL, an
  external script) must **validate `node`/`cli` before executing them** and never run a path read
  blindly from the file (§9.2): confirm the binaries exist, tolerate version skew by globbing the
  newest installed CLI, and prefer re-discovery over running a stale/incompatible path.
- **CLI invocation** — the CLI runs functions in Node (a less restricted environment than the
  extension host). The SKILL documents that it must only be run against the user's own workspace
  files. `--params` values are treated as data and never `eval`'d.
- **No auto-send** — the extension never sends email/Teams; the SKILL only opens pre-filled compose
  surfaces, so no message leaves the machine without explicit user action.
- **Output safety** — rendered text is inserted as plain text; when used to build `mailto:` / Teams
  deep links the SKILL URL-encodes all interpolated values to avoid link/parameter injection.
- **No network calls** in v1 (Graph/auto-send explicitly out of scope).

---

## 14. Testing strategy

### 14.1 Unit tests (Vitest)

The engine core is pure and adapter-injected, so the bulk is unit-tested:
- `templateParser` — frontmatter grammar (identifiers, unions, number+units, quoted strings with
  embedded `{{…}}`, reference arguments); the **quote-aware/paren-aware tokenizer and escape sequences**
  (`\"`, `\\`, `\n`, `\t`; commas/parens inside quotes are literal, §4.2); **duration parsing**
  (`\d+[dwM]`; invalid unit = parse error, §4.2); the **call-only mode** for `invoke` raw calls (§9.1);
  the **frontmatter fence** (opening + closing `---` required, missing close = parse error, body `---`
  left verbatim, body-only templates, §4.5); body expression extraction; malformed input.
- `expressionRenderer` — `{{name}}` / `{{name.prop}}` / nested `{{a.b.c}}`, unknown name/path markers,
  the **non-text marker** when a value is an object/array with no `display()` (§12), frontmatter
  stripping, and argument substitution.
- `templateEngine` — multi-pass resolution (dependency order, **cross-referencing arguments whose
  dependencies live inside quoted strings**, §4.4), the **dependent-input cascade** (a later input's
  `resolveOptions` sees earlier answers via `ctx.answers`, §6.1), **deferred branch collection** (a
  discarded `IfWithin` branch never prompts), cycle/unsatisfiable detection, scope building,
  diagnostics, abort-on-cancel, with a **fake `InputResolver`** and **fake `ContactsProvider`**
  (deterministic `now`).
- `coreBuiltins` — `FreeText` (referencing label), `IfWithin` (inside/outside window, empty-string
  branch, deferred branch inputs, **month-unit `M` approximation (×30 days)**, **ISO 8601 date
  validation** (valid/invalid/non-date strings), **calendar-day granularity**); pure, no Contacts/date
  deps.
- `peopleFunctions` — `PeopleSelector` (single/union groups, empty group, extra-field flattening,
  Contacts-unavailable short-circuit), `Me` (Me.md present/absent, free-form fields flattened,
  **`Object.hasOwn` field-existence check**), `DeadlineSelector` (**delegates to
  `formatDueIn`/`formatDueBy`** — assert it calls the helpers, not bespoke phrasing; **rejects `M`
  unit**). Built against a fake `ContactsProvider`.
- `parseMeProfileDocument` — the new `me`-kind parser (no `#` heading required, **every field**
  included even when no template references it, label casing preserved), added beside the existing
  `parseContactGroupDocument` tests in [contactParser.test](../../../tests/unit-tests).
- `functionLoader` — compiling valid/invalid `.ts`, sandbox blocking of forbidden modules, and the
  **built-in name collision rejected at load** (a user fn named `Me`/`PeopleSelector`/… fails loudly,
  §6.3), user-defined conditional functions.
- `sandbox` — the extracted shared sandbox (§8.4): allowed-module parameterization
  (`memoria-snippets` vs `memoria-templates`), `BLOCKED_MODULES` enforcement, and a **Snippets-unchanged**
  regression assertion (existing snippet compilation still succeeds through it).
- CLI argument parsing, `invoke` both target forms, `--params` key resolution (including missing-input
  failure), and **`--out` refusing to overwrite without `--force`** + path confinement to `--root`
  (§9.1).

### 14.2 Coverage gate (85%)

The repository already enforces an **85%** threshold for statements, branches, functions, and lines via
Istanbul (see `coverage.thresholds` in [vitest.config.ts](../../../src/vitest.config.ts)); the build
fails below it. The new templating modules under `src/features/snippets/templates/` must keep the suite
at or above 85% **without lowering the thresholds or adding broad `exclude` entries**. Notes:
- Pure modules (`templateParser`, `expressionRenderer`, `templateEngine`, `coreBuiltins`,
  `peopleFunctions`, `functionLoader`, `sandbox`, the CLI argument layer) are expected to reach high
  coverage directly.
- `vscodeInputResolver.ts` and `templateCommands.ts` are thin VS Code glue. They are **unit-tested with
  the repo's existing `vscode` mocks** (like the rest of the feature code) and must **not** be added to
  the coverage `exclude` list the way `extension.ts` is — the `extension.ts` exclusion is a narrow,
  long-standing exception, not a template these files should follow. E2E (§14.3) is **additional**
  validation, **not a substitute** for unit coverage of their branches.
- Seed `resources/**` template/function files remain excluded (they are copied into the user workspace,
  not imported), matching the existing config.
- Verify locally with `npm run test:coverage` (unit) and `npm run test:coverage:all` (unit + E2E).

### 14.3 End-to-end tests (VS Code test runner)

E2E tests live under `tests/e2e-tests/features/templates/` (sibling to the existing
`tests/e2e-tests/features/snippets/`). At minimum, add **two** E2E tests covering the new functionality
end-to-end against a real Extension Host and a seeded workspace:

1. **Inline template expansion** — trigger the `{template}` snippet, drive the QuickPick cascade to a
   known selection (e.g. a seeded `Team` contact + a `DeadlineSelector` choice), and assert the inserted
   text matches the expected rendering **with the frontmatter stripped**.
2. **Render to clipboard (or new file)** — run `memoria.renderTemplateToClipboard` (and/or
   `memoria.renderTemplateToFile`) for a template that uses `Me()` + a flattened custom field, and
   assert the clipboard/document contents equal the expected text.

Both seed a minimal workspace (templates folder + `Team.md` / `Me.md`) using the existing E2E fixture
helpers, and assert that `.memoria/engine-config.json` is written on activation. A lightweight **CLI
smoke test** complements these: run `dist/template-cli.cjs render` / `invoke` / `describe` against the
same fixtures and assert stdout and exit codes, proving the extension and CLI share one engine.

---

## 15. Documentation updates

The extension ships user-facing docs under [src/resources/docs/](../../../src/resources/docs) (surfaced
via the in-product user guide), with one page per feature in
[src/resources/docs/features/](../../../src/resources/docs/features) and a
[features/index.md](../../../src/resources/docs/features/index.md) table of contents. Templating is part
of the Snippets feature, so its documentation lives in the existing
[features/snippets.md](../../../src/resources/docs/features/snippets.md) (extended with a "Templates"
section) rather than a new feature page.

The docs are **task-oriented**: they should explain **how to add and use** templating, not how the
engine works internally. Required additions:

1. **Use a template** — how to trigger the `{template}` snippet, what the QuickPick cascade does, and
   the three commands (insert at cursor, render to new file, render to clipboard).
2. **Author a template** — the file location (templates folder + category subfolders), the frontmatter
   syntax (`name: FunctionCall(args)`) **enclosed by an opening and closing `---` fence** (§4.5), the
   **quoting/escaping rules** for string arguments (`\"`, `\\`, `\n`, `\t`; commas/parens inside quotes
   are literal, §4.2), the body `{{name}}` / `{{name.prop}}` / nested-path syntax, the rule that
   frontmatter never appears in the output, and that a template's **optional title** is just its first
   `# H1` heading (no `title:` field; templates without an `# H1` have no title, §4.5). Include a
   complete, copyable example.
3. **Built-in functions reference** — a short table of `PeopleSelector`, `Me`, `DeadlineSelector`,
   `FreeText`, and `IfWithin` with their arguments, what each prompts for, and what they return
   (including the flattened contact fields — **typed fields are camelCase** (`nickname`, `fullName`),
   **custom fields keep their exact Markdown label** (`{{candidate.TeamName}}`) — and the `MeProfile`
   fields from `Me.md`).
4. **Add your own function** — a step-by-step: create a `.ts` file in the templates `_functions/`
   folder, `export default` a `TemplateFunction` (or array), declare `describeInputs`, implement
   `resolve`, and reference the result in a template. Include a minimal object-returning example **and**
   a conditional example (returning text or `""`), and note the sandbox limits (only `memoria-templates`
   is importable; Node built-ins are blocked).
5. **Set up `Me.md`** — where the file lives (the Contacts people folder), that fields are free-form and
   flattened and referenced by their **exact Markdown label** (`{{me.TeamName}}`, `{{me.StartDate}}`),
   and which fields the shipped templates expect.
6. **Use the SKILL (email / Teams / text)** — how the PowerShell SKILL produces text and opens a
   pre-filled email/Teams message, including the CLI verbs it relies on and the `--params` schema
   (pointing at `describe`).

Also update [features/index.md](../../../src/resources/docs/features/index.md) (and the changelog) to
mention templating, and add the new commands to the commands documentation under
[src/resources/docs/commands/](../../../src/resources/docs/commands). The SKILL's own `SKILL.md`
(§10) is the authoring reference for agents and is kept in sync with the CLI verbs.

---

## 16. Open questions

1. **Deadline phrasing / locale** — **Settled for v1:** `DeadlineSelector` introduces **no new phrasing
   logic** and **reuses `dateUtils.formatDueIn`/`formatDueBy`** for both the option preview and the
   resolved value (§6.2), accepting only `d` (day) and `w` (week) units. The `M` (month) unit is
   supported by `IfWithin` only, approximated as ×30 calendar days (§6.2) — this is sufficient for
   conditional checks like `IfWithin(4M, …)` without adding month phrasing to `dateUtils`.
   `DeadlineSelector` with month units and non-English locales are deferred to a future version.
2. **Cycle reporting** — **Settled:** the resolver detects stalls by **fixpoint** (§4.4 step 3) — if a
   full pass resolves nothing while entries remain, those entries are unsatisfiable or circular (direct
   `a↔b`, indirect `a→b→c→a`, self-reference, or a reference to a non-existent entry). The render then
   **fails** (notification in VS Code / non-zero exit + `stderr` in the CLI, §12) with an **actionable**
   message that (a) names the still-unresolved entries and (b) for each, names the **first reference it
   is blocked on** that never came into scope — e.g. *"unresolved: `a` (waiting on `b`), `b` (waiting on
   `a`)."* This is a diagnostics-quality change only; the render still aborts.
3. **Flatten collisions** — **Settled:** when an extra Markdown field collides with a known or resolved
   property, the **known property wins** and the colliding extra field is **skipped and recorded in
   `diagnostics`** (a non-fatal diagnostic, not a louder error). The render is unaffected; this matches
   the flattening rule in §6.2.

---

## 17. Out of scope (future)

- Microsoft Graph integration for true auto-send and richer recipient resolution.
- Arithmetic and function calls **inside the body `{{…}}`** (e.g. `{{candidate.level+1}}`) — compute in
  a function instead (§6.4). (Conditionals and cross-references via functions/arguments are in scope.)
- A template-authoring/preview UI and hover preview of templates before insertion.
- Template sharing / sync across machines.
