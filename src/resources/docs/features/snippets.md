# Snippets

Text expansion for Markdown files via autocomplete. Type a trigger pattern and select it from the completion list to insert dynamic or static text.

## How it works

Snippet files are TypeScript files (`.ts`) stored in the blueprint's Snippets folder:

- **Individual Contributor** workspaces use `05-Autocomplete/Snippets/`
- **People Manager** workspaces use `06-Autocomplete/Snippets/`

When the snippets feature is active, Memoria compiles each `.ts` file in the snippets folder using an in-memory TypeScript transpiler, extracts the exported `SnippetDefinition` array, and registers them as completion items. Changes to snippet files are picked up automatically via a file watcher — no restart required.

## Trigger syntax

Snippets are activated by typing their trigger string in a Markdown file:

- **`{trigger}`** — Curly-brace triggers for general-purpose snippets (e.g., `{date}`, `{time}`, `{now}`)
- **`@id`** — At-sign triggers for contact snippets (e.g., `@jdoe`)

As you type, VS Code's autocomplete list shows matching snippets. Selecting one either inserts the text directly (static snippets) or runs the expansion function (dynamic snippets).

## Built-in snippets

The blueprint seeds a `date-time.ts` file with three snippets:

| Trigger | Label | Description |
|---------|-------|-------------|
| `{date}` | Date | Inserts the current date — prompts for format (`YYYY-MM-dd`, `MM/dd/YYYY`, `dd MMM YYYY`, `YYYY`) |
| `{time}` | Time | Inserts the current time — prompts for format (`HH`, `HHs`, `hh`) |
| `{now}` | Date & Time | Inserts the current date and time (`YYYY-MM-dd HH:mm`) |

The `{date}` snippet is also **path-safe**, meaning it can be used by other features (e.g., the Todo Editor) even when snippets are disabled.

## Creating custom snippets

Add a new `.ts` file to the Snippets folder. Each file must export a `SnippetDefinition` array (default export or named export):

```typescript
import type { SnippetDefinition, SnippetContext } from "memoria-snippets";

const snippets: SnippetDefinition[] = [
    {
        trigger: "{greeting}",
        label: "Greeting",
        description: "Inserts a greeting",
        glob: "**/*.md",
        expand(ctx: SnippetContext): string {
            return "Hello, world!";
        },
    },
];

export default snippets;
```

### SnippetDefinition fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `trigger` | `string` | Yes | The text that activates the snippet (e.g., `{date}`) |
| `label` | `string` | Yes | Display name shown in the completion list |
| `description` | `string` | No | Detail text shown alongside the label |
| `glob` | `string` | Yes | File glob pattern — the snippet only appears in matching files |
| `body` | `string` | No | Static text to insert (used when there is no `expand` function) |
| `expand` | `(ctx) => string` | No | Dynamic expansion function — receives a `SnippetContext` |
| `parameters` | `SnippetParameter[]` | No | Prompts the user with a QuickPick for each parameter before expansion |
| `pathSafe` | `boolean` | No | When `true`, the snippet is available to other features even if snippets are disabled |
| `filterText` | `string` | No | Custom text used for filtering in the completion list |

### The `memoria-snippets` module

Snippet files can import from the virtual `memoria-snippets` module, which exposes date/time utilities:

- `formatDate(date, format)` — Formats a `Date` (`"YYYY-MM-dd"`, `"MM/dd/YYYY"`, `"dd MMM YYYY"`, `"YYYY"`)
- `formatTime(date, format)` — Formats a `Date` (`"HH"`, `"HHs"`, `"hh"`)
- `elapsedSince(dateStr, now?)` — Returns `{ years, months, totalMonths }` between a date string and now
- `formatElapsed(elapsed)` — Formats an `ElapsedTime` as a human-readable string (e.g., `"1 year, 3 months"`)

> **Security:** Snippet files run in a sandboxed environment. Node.js built-in modules (`fs`, `child_process`, `net`, etc.) are blocked.

## Snippet parameters and prompts

When a snippet defines `parameters`, selecting it from autocomplete opens a QuickPick dialog for each parameter before the expansion runs:

```typescript
{
    trigger: "{date}",
    label: "Date",
    parameters: [
        { name: "format", options: ["YYYY-MM-dd", "MM/dd/YYYY"], default: "YYYY-MM-dd" },
    ],
    expand(ctx: SnippetContext): string {
        return formatDate(new Date(), ctx.params.format ?? "YYYY-MM-dd");
    },
}
```

If the snippet has a single parameter and there is selected text in the editor, the selection is used as the parameter value automatically — no prompt is shown.

## Contact snippets

When the [Contacts](contacts.md) feature is also active, Memoria automatically generates `@`-trigger snippets for every contact. These are not stored in files — they are built at runtime from the contacts data.

Typing `@` followed by a contact's id, nickname, or full name shows matching contacts in the completion list. Selecting one prompts for a format:

- Nickname
- Full Name
- Nickname (title)
- Full Name (title)
- Id
- Nickname (id)
- _(Reports only)_ Nickname (level), Full Name (level), Full Name (level, for X months - since MM-dd-YYYY)

Contact snippets update automatically when contacts are added, edited, or removed.

## Detailed contact hover

When contact snippets are active, hovering over expanded contact text shows a brief tooltip. Press **Ctrl+Shift+H** (macOS: **Cmd+Shift+H**) to show a detailed contact hover with full profile information.

The keybinding is only active when `editorTextFocus` is true and the snippets feature is running.

## Reset snippet command

Right-click a `.ts` file in the Explorer and select **Reset snippet to default** to restore it to the version bundled with the blueprint. This is available only for snippet files that were originally seeded by the blueprint.

The command is also accessible from the Command Palette as **Memoria: Reset snippet to default**.

## Integration with the Todo Editor

Snippets marked with `pathSafe: true` (such as `{date}`) are available to the Todo Editor for generating dates in task completion timestamps, even when the snippets feature itself is disabled.

## Toggling

1. Open the Command Palette (`Ctrl+Shift+P`)
2. Run **Memoria: Manage features**
3. Check or uncheck **Snippets**

Changes take effect immediately — no restart required.

## Troubleshooting

- **Snippets not appearing in autocomplete?** Make sure the feature is enabled via **Memoria: Manage features** and that you are editing a Markdown file matching the snippet's `glob` pattern.
- **Snippet file errors?** Check the VS Code notification area — Memoria shows a warning if a snippet file fails to compile. Only the `memoria-snippets` module can be imported; other modules will cause an error.
- **Contact snippets missing?** The Contacts feature must also be enabled and have at least one contact loaded.
- **Still not working?** Try reloading VS Code (`Ctrl+Shift+P` → **Developer: Reload Window**).

---

[⬅️ **Back** to Features](index.md) 💠 [Commands](../commands/index.md) 💠 [Getting Started](../getting-started.md)
