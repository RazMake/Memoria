# PRD: Contacts Manager Feature

**Date**: 2026-04-18
**Updated**: 2026-04-19
**Status**: Approved

## 1. TL;DR

Add a new Memoria feature — **Contacts** — that provides centralized people management via a **persistent sidebar panel** (own Activity Bar icon) for browsing, searching, and managing contacts. Contacts are organized into **groups**, where each group is stored as a single Markdown file whose filename matches the group name (e.g., `Team.md` for the "Team" group, `Colleagues.md` for the "Colleagues" group). Within each file, contacts use the existing `# key` / `- Field: value` dictionary format. Moving a contact between groups is a physical move of the record from one file to another.

The **people-manager** blueprint ships two contact groups: **Team** (Reports with career level tracking) and **Colleagues** (basic contact info). The **individual-contributor** blueprint ships only **Colleagues** — individual contributors do not manage reports and therefore have no access to `LevelId`, `LevelStartDate`, or the full career level details (`Id`, `InterviewType`); they only use career level `TitlePattern` for title generation.

Reference data (pronouns, career levels, career paths, interview types) ships with defaults and is user-editable. All contact and reference data files are watched; any external edit (e.g., the user editing Markdown directly) triggers an in-memory reload and sidebar refresh. The feature exposes a `ContactsService` for other features to query contact data.

---

## 2. Terminology

- **Contact group** — a named collection of contacts stored in a single Markdown file. The filename (without extension) is the group name. Blueprints define the initial set of groups; users can create additional **custom groups** at any time via the Add Person form (see §7.1).
- **Report** — a person with extended fields: `id` (H1 key), `Nickname`, `FullName`, `Title`, `CareerPathKey`, `LevelId`, `LevelStartDate`, `PronounsKey`. Only available in the **people-manager** blueprint (stored in `Team.md`).
- **Colleague** — a person with basic fields: `id` (H1 key), `Nickname`, `FullName`, `Title`, `CareerPathKey`, `PronounsKey`. Available in both blueprints (stored in `Colleagues.md`).
- **Custom group** — a user-created contact group. All custom groups use the Colleague field structure. Created via the "+ New Group" option in the Add Person form's group selector.
- **Career path** — a named track (e.g., "Software Engineer", "PM Manager") stored in `CareerPaths.md`. Each career path declares a `MinimumCareerLevel` (a numeric `Id` value from `CareerLevels.md`); the UX uses this to filter the career-level dropdown to only levels at or above the minimum.
- **Contacts** — the collective term for all people across all contact groups.

---

## 3. Goals / Non-goals

**Goals**

- Provide centralized people management that other features can reference.
- Support two distinct person types (Report, Colleague) with shared and type-specific fields.
  There can be any number of person types (aka. groups) defined by the user, and the structure of ALL custom groups matches Colleague.
- Allow users to customize reference data (pronouns, career levels, career paths, interview types) by editing Markdown files directly.
- Provide a rich, fully webview-based sidebar UI for browsing and managing contacts.
- Expose a `ContactsService` API for other features to look up contacts and reference data.

**Non-goals**

- Syncing with external HR/directory systems.
- Multi-user collaboration on the people list.
- Import/export functionality (users edit Markdown directly).
- Photo/avatar support.

---

## 4. Data Model

All data is stored in **Markdown files** using the established dictionary format: `# key` headings define record keys, and `- FieldName: value` bullet items define fields. This is the same format used by the shipped seed files (`Pronouns.md`, `CareerLevels.md`, `InterviewTypes.md`).

**One file per group:** Each contact group corresponds to a single `.md` file whose name matches the group. The blueprint declares which group files exist and what contact type they contain. When a contact is moved between groups, the record (heading + all fields) is physically removed from the source file and appended to the target file.

### 4.1 Person Types

**Report** (stored in `Team.md` — **people-manager only**):

| Field | Type | Required | Description |
|---|---|---|---|
| `# <id>` | H1 heading | Yes | Unique alias (e.g., corporate alias). Primary key across all contacts. |
| `Nickname` | `string` | Yes | Short display name or nickname. |
| `FullName` | `string` | Yes | Full display name. |
| `Title` | `string` | Yes | Job title. **Auto-generated** in normal form from `CareerPathKey` + `LevelId` using the career level's `TitlePattern` with the career path's `Name` (see §4.5). Stored in the file like any other field. If the user edits the file and writes a custom string that differs from the generated value, both the custom string and the generated value are presented in the UX (see §7.2). |
| `CareerPathKey` | `string` | Yes | References a key (H1 heading) in `CareerPaths.md`. |
| `LevelId` | `string` | Yes | References a key (H1 heading) in `CareerLevels.md`. Must be at or above the `MinimumCareerLevel` defined by the selected career path. |
| `LevelStartDate` | `string` | Yes | ISO date (YYYY-MM-DD) when the person started at this level. |
| `PronounsKey` | `string` | Yes | References a key (H1 heading) in `Pronouns.md`. |

Example (`Team.md`):
```markdown
# alias1
- Nickname: Alice
- FullName: Alice Anderson
- Title: Software Engineer 2
- CareerPathKey: sde
- LevelId: l3
- LevelStartDate: 2025-06-01
- PronounsKey: she/her

# alias2
- Nickname: Bob
- FullName: Bob Baker
- Title: Senior Software Engineer
- CareerPathKey: sde
- LevelId: l5
- LevelStartDate: 2024-11-15
- PronounsKey: he/him
```

**Colleague** (stored in `Colleagues.md`):

| Field | Type | Required | Description |
|---|---|---|---|
| `# <id>` | H1 heading | Yes | Unique alias. Primary key across all contacts. |
| `Nickname` | `string` | Yes | Short display name or nickname. |
| `FullName` | `string` | Yes | Full display name. |
| `Title` | `string` | Yes | Job title. Selected from a dropdown of generated titles (see §4.5). The user can also type a custom value by editing the file directly; custom values are preserved and added to the dropdown (see §7.1, §7.2). |
| `CareerPathKey` | `string` | Yes | References a key (H1 heading) in `CareerPaths.md`. |
| `PronounsKey` | `string` | Yes | References a key (H1 heading) in `Pronouns.md`. |

Example (`Colleagues.md`):
```markdown
# alias3
- Nickname: Carol
- FullName: Carol Chen
- Title: Principal Program Manager
- CareerPathKey: pm
- PronounsKey: she/her
```

### 4.2 Reference Data

Reference data files live under `DataTypes/` within the people folder. Each uses the same `# key` / `- Field: value` format.

**Pronouns** (`DataTypes/Pronouns.md`) — keyed by string (e.g., `he/him`, `she/her`, `they/them`):

| Field | Type | Description |
|---|---|---|
| `Subject` | `string` | e.g., "he", "she", "they" |
| `Object` | `string` | e.g., "him", "her", "them" |
| `PossessiveAdjective` | `string` | e.g., "his", "her", "their" |
| `Possessive` | `string` | e.g., "his", "hers", "theirs" |
| `Reflexive` | `string` | e.g., "himself", "herself", "themselves" |

**Career levels** (`DataTypes/CareerLevels.md`) — keyed by string (e.g., `l1`, `intern`):

| Field | Type | Description |
|---|---|---|
| `Id` | `number` | Numeric sort/display value (e.g., 0, 1, 5). **Not** the dictionary key — the H1 heading (e.g., `# l5`) is what `Report.LevelId` references. |
| `InterviewType` | `string` | References a key (H1 heading) in `InterviewTypes.md`. |
| `TitlePattern` | `string` | Template for generating a display title from the career path name. Uses `{CareerPath}` as a placeholder (e.g., `"Senior {CareerPath}"` → "Senior Software Engineer"). |

> **Key vs `Id` clarification:** The H1 heading (e.g., `# l5`) is used as the foreign key in `Report.LevelId`. The numeric `Id` field inside each entry is a display/sort value only — it does not serve as a lookup key.

> **Career levels have no standalone name.** Unlike career paths (which have a `Name` field), career levels only produce a human-readable display title when paired with a career path — by substituting `{CareerPath}` in `TitlePattern` with the path's `Name` (normal form) or `Short` (short form). For example, level `l5` has `TitlePattern: "Senior {CareerPath}"` — this is meaningless without a career path. Paired with `sde` (Name: "Software Engineer", Short: "SDE") it becomes "Senior Software Engineer" (normal) or "Senior SDE" (short); paired with `pm` (Name: "Program Manager", Short: "PM") it becomes "Senior Program Manager" (normal) or "Senior PM" (short). This pairing dependency drives UX ordering: the career path must be selected **before** the career level so that the level dropdown can display resolved titles (see §7.1).

**Interview types** (`DataTypes/InterviewTypes.md`) — keyed by string (e.g., `intern`, `junior`, `senior`):

| Field | Type | Description |
|---|---|---|
| `Name` | `string` | Display name (e.g., "Intern", "Junior", "Senior"). |

**Career paths** (`DataTypes/CareerPaths.md`) — keyed by string (e.g., `sde`, `em`, `pm`):

| Field | Type | Description |
|---|---|---|
| `Name` | `string` | Display name (e.g., "Software Engineer", "Program Manager", "PM Manager"). |
| `Short` | `string` | Abbreviated display name (e.g., "SDE", "EM", "PM"). Used in compact UX contexts where space is limited. |
| `MinimumCareerLevel` | `number` | The minimum career level `Id` for this path. The UX uses this to filter the career-level dropdown: only levels whose numeric `Id` is ≥ this value are shown. |

> **Career-path level filtering:** When a user selects a career path in the Add/Edit form, the career-level dropdown is filtered to show only levels whose `Id` is ≥ the path's `MinimumCareerLevel`. For example, if "Engineering Manager" has `MinimumCareerLevel: 5`, the dropdown hides levels with Id < 5 (e.g., intern, l1, l2). This prevents assigning a level that is below the minimum for the selected career path.

### 4.3 File Summary

All files live under the `peopleFolder` configured in the blueprint. The set of contact group files differs by blueprint:

**People-manager** (`06-Contacts/`):

| # | File | Content |
|---|---|---|
| 1 | `Team.md` | Report records (with `CareerPathKey`, `LevelId`, `LevelStartDate`) |
| 2 | `Colleagues.md` | Colleague records (with `CareerPathKey`) |
| 3 | `DataTypes/Pronouns.md` | Pronouns reference data |
| 4 | `DataTypes/CareerLevels.md` | Career levels reference data (full: `Id`, `InterviewType`, `TitlePattern`) |
| 5 | `DataTypes/InterviewTypes.md` | Interview types reference data |
| 6 | `DataTypes/CareerPaths.md` | Career paths reference data (`Name`, `Short`, `MinimumCareerLevel`) |

**Individual-contributor** (`05-Contacts/`):

| # | File | Content |
|---|---|---|
| 1 | `Colleagues.md` | Colleague records (with `CareerPathKey`) |
| 2 | `DataTypes/Pronouns.md` | Pronouns reference data |
| 3 | `DataTypes/CareerLevels.md` | Career levels reference data (`Id`, `TitlePattern` used for title generation; `InterviewType` is ignored) |
| 4 | `DataTypes/InterviewTypes.md` | Interview types reference data |
| 5 | `DataTypes/CareerPaths.md` | Career paths reference data (`Name`, `Short`, `MinimumCareerLevel`) |

> **Individual-contributor restriction:** The individual-contributor blueprint does not scaffold `Team.md` and the feature does not offer the Report contact type. Career levels are loaded and the `Id` and `TitlePattern` fields are used for title generation and dropdown population (same as people-manager). The `InterviewType` field is present in the seed file but not surfaced in the IC UI because ICs do not manage reports or track interview types.

### 4.4 Referential Integrity & Code-Only Defaults

Because reference data files are user-editable, a contact may reference a pronoun key, career level, career path, or interview type that no longer exists (e.g., the user deletes `# l5` from `CareerLevels.md` while a report still has `- LevelId: l5`). The extension enforces referential integrity via **code-only default instances** and an **on-save integrity check**.

**Code-only default instances** (defined in `src/features/contacts/referenceDefaults.ts`, never written to Markdown files):

| Reference type | Default key | Default values |
|---|---|---|
| Pronouns | `"unknown"` | `Subject: "they"`, `Object: "them"`, `PossessiveAdjective: "their"`, `Possessive: "theirs"`, `Reflexive: "themselves"` |
| Career level | `"unknown"` | `Id: 0`, `InterviewType: "unknown"`, `TitlePattern: "{CareerPath}"` |
| Interview type | `"unknown"` | `Name: "Unknown"` |
| Career path | `"unknown"` | `Name: "Unknown"`, `Short: "?"`, `MinimumCareerLevel: 0` |

These defaults exist **only in code** — they are not appended to the reference data files. They serve as fallback values for display and resolution when a referenced key is missing.

**Integrity check trigger:** Every time a contact group file is saved (via the extension's Add/Edit/Move operations **or** detected by the file watcher after an external edit), the extension runs an integrity check on that file:

1. For each contact record in the saved file, resolve `PronounsKey` against the loaded pronouns dictionary.
2. For each contact record, resolve `CareerPathKey` against the loaded career paths dictionary.
3. For Report records, also resolve `LevelId` against the loaded career levels dictionary.
4. For each career level entry, resolve `InterviewType` against the loaded interview types dictionary.
4. If any referenced key is **missing** from the corresponding reference data, the contact's field is **rewritten to the default key** (`"unknown"`) and the file is re-saved.
5. A warning notification is shown: *"Memoria: {count} contact(s) in {filename} referenced missing data types and were updated to defaults."*

The integrity check also runs on **all** contact group files when a reference data file changes (e.g., the user edits `Pronouns.md` and removes a key that contacts still reference).

> **Design rationale:** Auto-correcting to a known default is safer than silently displaying stale keys or crashing. The `"unknown"` key is intentionally not a valid user-created key (reference data keys are typically formatted like `he/him` or `l5`), making it easy to spot and fix.

### 4.5 Title Generation & Resolution

The `Title` field is **not free-text by default** in the UX — it is derived from reference data. The generated title list and UX behavior differ between Reports and Colleagues/custom groups.

**Generated title list:**
Title generation has two modes — **normal** and **short** — both derived from the same `TitlePattern` by substituting `{CareerPath}` with different career path fields:
- **Normal:** `{CareerPath}` → `CareerPath.Name` — e.g., `"Senior {CareerPath}"` → `"Senior Software Engineer"`. Used as the stored `Title` value, in forms, and in the canonical title dropdown.
- **Short:** `{CareerPath}` → `CareerPath.Short` — e.g., `"Senior {CareerPath}"` → `"Senior SDE"`. Used for compact display contexts (sidebar contact card).

For every combination of career path P and career level L where `L.Id ≥ P.MinimumCareerLevel`, a **title pair** `{ normal, short }` is produced. Because career levels have no standalone name (only a `TitlePattern` with a `{CareerPath}` placeholder), a career path is always required to produce a meaningful title string. The distinct set of all **normal** titles, plus the literal string `"CVP"`, forms the **canonical title list**. The corresponding short titles are sent alongside for display purposes. Both lists are recomputed whenever `CareerPaths.md` or `CareerLevels.md` changes and sent to the webview as part of the `update` message.

Example: Given career paths `[sde → Name: "Software Engineer" / Short: "SDE", pm → Name: "Program Manager" / Short: "PM"]` and career levels `[l1 → TitlePattern: "{CareerPath}", l5 → TitlePattern: "Senior {CareerPath}"]`:
- Normal titles: `["Software Engineer", "Senior Software Engineer", "Program Manager", "Senior Program Manager", "CVP"]`
- Short titles: `["SDE", "Senior SDE", "PM", "Senior PM", "CVP"]`

**Report Title behavior:**
- **On Add:** Title is **auto-computed** from the selected `CareerPathKey` + `LevelId` (normal form). The form shows the generated title as a read-only field. The user cannot type a custom value via the form. Changing `CareerPathKey` or `LevelId` immediately updates the displayed title.
- **On Edit (title matches generated value):** The title field remains **read-only**, showing the auto-computed value. Changing `CareerPathKey` or `LevelId` recalculates the title.
- **On Edit (title does NOT match generated value):** The user has edited the file directly and set a custom title. The UX shows a **dropdown with exactly two options**: (1) the custom string currently stored in the file, and (2) the value generated from `CareerPathKey` + `LevelId`. The user can pick either. Selecting the generated value "resets" the title to the computed one; selecting the custom string preserves the override.
- **Stored value:** The `Title` field is always written to the Markdown file as the **normal** (full) form — whether generated or custom. It is a regular string field in the data model. The short form is never persisted; it is derived at display time.

**Colleague / Custom group Title behavior:**
- **On Add:** Title is a **dropdown** populated with the canonical title list (all normal-form generated titles + `"CVP"`). The user selects a value.
- **On Edit (title is in the canonical list):** The dropdown is shown with the current value pre-selected.
- **On Edit (title is NOT in the canonical list):** The custom string is **added to the dropdown** as an additional option (at the top), so the user can keep it or switch to a canonical title.
- **Stored value:** The selected (or custom) string is written to the file verbatim (always the normal form).

**Short title resolution for display:** The sidebar contact card (see §8.1) uses the **short** title for compact display. Resolution works as follows:
- For any contact whose stored `Title` matches a canonical normal title, the corresponding short title is used.
- For custom titles (not in the canonical list), the full stored `Title` is displayed as-is (no short variant exists).
- `"CVP"` maps to itself in both forms.

**Custom titles from file edits:** Users can always edit contact files directly in a text editor and write any arbitrary string for `Title`. The extension preserves that string. When the file is reloaded (via file watcher), the in-memory model picks up the custom title. When the UX renders the edit form, it detects whether the stored title matches the expected set and adjusts the control accordingly (see above).

**Reactivity:** Whenever `CareerPaths.md`, `CareerLevels.md`, or any contact group file changes on disk, the title list is recomputed, in-memory contact data is reloaded, and the webview receives an `update` message with the refreshed data. This ensures the sidebar always reflects the current state.

---

## 5. Feature Declaration

The Contacts feature is declared as a **standalone** feature in the blueprint manifest. It follows the existing `FeatureEntry` pattern with a feature-specific `peopleFolder` field.

**Blueprint YAML — people-manager** (`people-manager/blueprint.yaml`):
```yaml
features:
  - id: "contacts"
    name: "Contacts"
    description: "Browse, search, and manage reports and colleagues."
    enabledByDefault: true
    peopleFolder: "06-Contacts/"
    groups:
      - file: "Team.md"
        type: "report"
      - file: "Colleagues.md"
        type: "colleague"
```

**Blueprint YAML — individual-contributor** (`individual-contributor/blueprint.yaml`):
```yaml
features:
  - id: "contacts"
    name: "Contacts"
    description: "Browse, search, and manage colleagues."
    enabledByDefault: true
    peopleFolder: "05-Contacts/"
    groups:
      - file: "Colleagues.md"
        type: "colleague"
```

**TypeScript type** (`src/blueprints/types.ts`):
```typescript
interface ContactGroup {
    file: string;              // e.g., "Team.md"
    type: "report" | "colleague";
}

interface ContactsFeatureEntry extends FeatureEntry {
    id: "contacts";
    peopleFolder: string;
    groups: ContactGroup[];    // Blueprint-defined groups (initial set)
}

// Expand the discriminated union:
type BlueprintFeature = DecorationsFeatureEntry | TaskCollectorFeatureEntry | ContactsFeatureEntry;
```

**Custom groups at runtime:** The `groups` array in the blueprint defines the initial set of contact groups. Users can create additional groups via the Add Person form (see §7.1). When a new group is created, the feature creates a new `.md` file in `peopleFolder` and adds a file watcher for it. Custom groups always use the `"colleague"` type (same field structure as `Colleagues.md`). The feature discovers custom groups by scanning `peopleFolder` for `.md` files that are not in the blueprint's `groups` array and are not inside `DataTypes/`. Custom group files are loaded on activation alongside blueprint-defined groups.

---

## 6. Lifecycle

The Contacts feature follows the existing `FeatureManager` callback pattern used by `BlueprintDecorationProvider` and `TaskCollectorFeature`.

| Transition | Behavior |
|---|---|
| **Activation** | Reads all contact group files (blueprint-defined + discovered custom groups) and reference data files from `peopleFolder`. Registers the sidebar `WebviewViewProvider`, file watchers on every loaded file, and injects real command handlers. Exposes `ContactsService` for other features. Sets context keys (see below). |
| **Deactivation** | Disposes `WebviewViewProvider` registration, file watchers, and clears command handler callbacks. `ContactsService` reference is set to `undefined` (consumers check availability at call time). Clears context keys. |
| **Manual disable** | Via `memoria.manageFeatures` → `enabled: false`. All UI removed, service set to `undefined`. Context keys cleared. |

**Context keys:** The feature manages two context keys via `vscode.commands.executeCommand('setContext', ...)`:
- `memoria.contactsActive` — set to `true` on activation, `false` on deactivation. Controls command palette visibility and view `when` clause.
- `memoria.contactsMultiGroup` — set to `true` when the total number of loaded contact groups (blueprint-defined + custom) is > 1, `false` otherwise. Updated on activation and whenever a custom group is created. Controls `memoria.movePerson` visibility.

**File watching:** The feature watches all contact group files and reference data files for external changes (e.g., user editing Markdown in a text editor, git operations). On any file change, the affected file is re-parsed and the in-memory data store is updated. The webview is then notified to refresh. Watches use a 500ms trailing-edge debounce to coalesce rapid edits. This ensures the sidebar always reflects the current state of files on disk.

**Integrity check on file change:**
- When a **contact group file** changes → the integrity check runs on that file (§4.4). Any dangling references are rewritten to the `"unknown"` default key.
- When a **reference data file** changes → the integrity check runs on **all** contact group files, since the removed key may be referenced by contacts in any group.

**Registration in `extension.ts`:**
```typescript
const contactsFeature = new ContactsFeature(manifest, context.extensionUri);
let contactsViewDisposable: vscode.Disposable | undefined;
featureManager.register("contacts", async (root, enabled) => {
    await contactsFeature.refresh(root, enabled);
    if (enabled && !contactsViewDisposable) {
        contactsViewDisposable = ContactsViewProvider.register(context, contactsFeature);
    } else if (!enabled && contactsViewDisposable) {
        contactsViewDisposable.dispose();
        contactsViewDisposable = undefined;
    }
});
```

---

## 7. Commands

Commands are registered **eagerly** in `extension.ts` using factory functions (matching the existing `create*Command()` pattern used by `createSyncTasksCommand`, `createManageFeaturesCommand`, etc.). Each factory returns a handler that checks whether the Contacts feature is active; if inactive, the handler shows an informational message. Context key `memoria.contactsActive` controls command palette visibility.

| Command | Title | When |
|---|---|---|
| `memoria.addPerson` | Memoria: Add Person | `memoria.contactsActive` |
| `memoria.editPerson` | Memoria: Edit Person | `memoria.contactsActive` |
| `memoria.deletePerson` | Memoria: Delete Person | `memoria.contactsActive` |
| `memoria.movePerson` | Memoria: Move Person | `memoria.contactsActive && memoria.contactsMultiGroup` |

**Command palette invocation (edit, delete, move):** When `memoria.editPerson`, `memoria.deletePerson`, or `memoria.movePerson` is invoked from the **command palette** (without sidebar context), the extension first shows a QuickPick listing all contacts across all groups (sorted alphabetically by `FullName`, with `Title` as description and group name as detail). The user selects a person, and the operation proceeds with that person. If the user cancels the QuickPick, the command is a no-op. When invoked from the **sidebar** (clicking an action icon on a card), the person context is passed directly — no QuickPick is shown.

### 7.1 Add Person Flow

1. User invokes `memoria.addPerson` or clicks "+" in the sidebar.
2. If multiple contact groups exist, the webview shows a **group selector** (e.g., Team / Colleagues / custom groups) at the top, plus a **"+ New Group"** option. If only one group exists, the selector is still shown (to allow creating new groups) but the existing group is pre-selected. Selecting **"+ New Group"** prompts for a group name (inline text input in the webview), creates a new `.md` file in `peopleFolder` with that name, registers a file watcher for it, and selects the new group in the form. The new group uses the `colleague` type (same fields as Colleagues). Group names must be unique (case-insensitive) across all existing group files; invalid or duplicate names show a validation error.
3. Form fields adjust based on the selected group's type: `colleague` type hides `LevelId`, `LevelStartDate`, and shows `Title` as a dropdown instead of a read-only field. For `report` type, the form field order enforces the career-path-before-level dependency: **CareerPathKey → LevelId → Title (read-only) → LevelStartDate**.
4. `CareerPathKey` is a dropdown populated from `CareerPaths.md` keys (H1 headings), displaying the `Name` field. This must be the first career-related field in the form because the `LevelId` dropdown and the `Title` field both depend on the selected career path.
5. `PronounsKey` is a dropdown populated from `Pronouns.md` keys (H1 headings).
6. `LevelId` (`report` type only) is a dropdown populated from `CareerLevels.md` keys. **The dropdown is disabled until a `CareerPathKey` is selected** — career levels have no standalone display name and can only show meaningful labels when paired with a career path. Once a career path is selected, each option displays the resolved title (the level's `TitlePattern` with the selected career path's `Name` substituted) and the level key — e.g., `"Senior Software Engineer (l5)"`. The dropdown is filtered to only show levels whose numeric `Id` is ≥ the career path's `MinimumCareerLevel`. Changing the career path re-filters the level dropdown and updates the resolved titles; if the currently selected level falls below the new minimum, it is cleared.
7. **Title field (Report — Add):** Title is displayed as a **read-only** computed field. The value is auto-generated by substituting `{CareerPath}` in the selected career level's `TitlePattern` with the selected career path's `Name`. Changing `CareerPathKey` or `LevelId` immediately recalculates the displayed title.
8. **Title field (Colleague / custom — Add):** Title is a **dropdown** populated with the canonical title list: all distinct titles generated from every valid career path × career level combination (using `TitlePattern`), plus the literal string `"CVP"` (see §4.5). The user selects a value.
9. On submit: validate `id` uniqueness across **all** contact group files → validate that `PronounsKey`, `CareerPathKey`, and `LevelId` (if Report) reference existing keys → validate that the selected level meets the career path's `MinimumCareerLevel` → append record to the selected group's Markdown file → refresh sidebar list. If a referenced key is missing at submit time, the form shows a validation error and does not save (unlike the post-save integrity check, which auto-corrects — the form prevents creating bad references in the first place).

### 7.2 Edit Person Flow

1. User clicks anywhere on a person's card in the sidebar or invokes `memoria.editPerson`.
2. The webview smoothly slides the list out and slides the form in. The form is optimized for narrow views: labels are placed ABOVE inputs (never side-by-side), and inputs take 100% width. A sticky header or footer holds the "Save" and "Cancel" (Back) actions to avoid scrolling to commit.
3. The `id` field is **read-only** during edit (to preserve referential integrity).
4. The **group** (which file the contact belongs to) is read-only during edit. Use Move to change groups.
5. **Title field (Report — Edit, title matches generated value):** Title is **read-only**, showing the auto-computed value from `CareerPathKey` + `LevelId`. Changing `CareerPathKey` or `LevelId` recalculates the title.
6. **Title field (Report — Edit, title does NOT match generated value):** The user has edited the file directly. The UX shows a **dropdown with exactly two options**: (a) the custom string currently stored in the file (visually distinguished, e.g., appended with `(Custom)`), and (b) the value generated from the current `CareerPathKey` + `LevelId` as the primary option. The user picks one. Selecting the generated value resets the title to the computed one; selecting the custom string preserves the override. If `CareerPathKey` or `LevelId` changes, the generated option updates accordingly.
7. **Title field (Colleague / custom — Edit, title is in canonical list):** The dropdown is shown with the current value pre-selected from the canonical title list.
8. **Title field (Colleague / custom — Edit, title is NOT in canonical list):** The custom string is **added to the dropdown** as an additional option (at the top, visually distinguished), so the user can keep it or switch to a canonical title.
9. On submit: validate → write updated record to Markdown file → refresh.

### 7.3 Delete Person Flow

1. User clicks delete icon on a person's card in the sidebar, or invokes `memoria.deletePerson` via command palette.
2. **Inline confirmation (Sidebar):** To avoid blocking modal popups and save clicks, the card's background turns a faint error color and the text is replaced with an inline prompt: *"Delete? [Confirm] [Cancel]"*. (If invoked via command palette, a QuickPick confirmation is used).
3. On confirm: remove record (heading + fields) from Markdown file → refresh sidebar.

### 7.4 Move Person Flow

Moving a contact between groups is a **physical file operation**: the record (heading + all fields) is removed from the source group file and appended to the target group file. This command is only available when more than one contact group exists (including custom groups). When only one group exists, the move command is hidden.

1. User clicks move icon on a person's card or invokes `memoria.movePerson`. 
   - **1-Click toggle (Sidebar with exactly 2 groups):** If there are exactly two groups total (e.g., Team and Colleagues), clicking the hover icon acts as an instant toggle. The person is moved immediately to the other group without a QuickPick, reducing it to a 1-click action with a transient toast notification (e.g., *"Moved to Colleagues"*, plus an Undo affordance if possible).
   - **QuickPick (3+ groups or command palette):** If invoked from the command palette or if more than 2 groups exist, a QuickPick shows available target groups (excluding the person's current group).
2. If moving **Report → Colleague**: fields `LevelId` and `LevelStartDate` are preserved under a `_droppedFields` nested list on the Colleague record (see example below). The `Title` value is preserved as-is (it becomes a regular Colleague title string — if it was generated from the career level pattern, it now appears in the Colleague's Title dropdown as a canonical or custom value).
3. If moving **Colleague → Report**: form opens pre-filled with existing fields. User must provide `LevelId` and `LevelStartDate`. If the colleague has a `_droppedFields` block containing those keys, they are pre-populated. The `Title` is recalculated in **normal form** from the newly provided `CareerPathKey` + `LevelId` (the previous Colleague title is discarded).
4. On submit: remove record from source group file, append to target group file. If all entries inside `_droppedFields` were consumed (restored to named fields), the entire `_droppedFields` block is removed. If unconsumed entries remain (from prior moves), only the consumed ones are removed and the rest are preserved → refresh.

Example — Report moved to Colleague retains dropped fields:
```markdown
# alias1
- Nickname: Alice
- FullName: Alice Anderson
- Title: Software Engineer 2
- CareerPathKey: sde
- PronounsKey: she/her
- _droppedFields:
  - LevelId: l3
  - LevelStartDate: 2025-06-01
```

The `_droppedFields` block is **internal bookkeeping** — users should not manually edit it. The underscore prefix signals this convention. The extension preserves the block transparently across edits; it is only created/consumed during Move operations.

---

## 8. Sidebar Panel

The sidebar is a **fully webview-based panel** registered as a `WebviewViewProvider` in the Activity Bar. Both the contact list and the add/edit form are rendered within the same webview.

### 8.1 Panel Layout

**Focus:** High-density, narrow-view optimization with frictionless 1-click interactions. Avatars/images are explicitly avoided.

1. **Sticky Header** — Top search bar (`<vscode-text-field>`) that filters instantly on `keyup`. A prominent "+" (Add) button next to it.
2. **Contact list (Accordions)** — Scrollable list grouped by contact file, rendered as collapsible sections (e.g., "Team (5)", "Colleagues (12)"). 
3. **Ultra-Compact Contact Card (2-Line Flexbox)** — Optimized for narrow sidebars:
   - **Line 1 (Identity):** **Nickname** (bold, `var(--vscode-foreground)`) followed by `(FullName)` (muted, `var(--vscode-descriptionForeground)`). Text overflows with ellipsis if too long.
   - **Line 2 (Role):** **Short title** (secondary color). Uses the short-form title derived from `CareerPath.Short` (see §4.5). Falls back to the full stored `Title` if no short variant exists (custom titles). Text overflows with ellipsis. *Pronouns are intentionally hidden from the list view to maximize space.*
   - **Hover Fast-Actions:** On row hover (with a subtle background highlight), a solid background block slides in from the right edge containing action icons: `[✎ Edit] [⇄ Move] [🗑 Delete]`.
   - **Click Efficiency:** Clicking anywhere on the row opens the Edit form.
4. **Add/Edit form** — Smoothly slides in from the right over the list rather than an abrupt re-render. Heavily optimized for narrow widths: labels must sit *above* their inputs (`100%` width), and Save/Cancel buttons sit in a sticky container at the top or bottom of the panel.

### 8.2 Search

The search input filters the contact list by `FullName`, `Nickname`, `id`, or `Title`. The search matches against both the stored normal-form `Title` and the derived short title, so searching "SDE" will find contacts whose short title contains "SDE" even if their stored title is "Software Engineer". Filtering is instant (client-side, no debounce needed since the dataset is small).

### 8.3 Message Protocol

**Extension → Webview** (`ToWebviewMessage`):
```typescript
{ type: 'update'; groups: { name: string; type: string; contacts: UIContact[] }[]; pronouns: string[]; careerLevels: UICareerLevel[]; careerPaths: UICareerPath[]; canonicalTitles: CanonicalTitle[] }
// UICareerLevel: { key: string; id: number; titlePattern: string; interviewType: string }
// UICareerPath: { key: string; name: string; short: string; minimumCareerLevel: number }
// CanonicalTitle: { normal: string; short: string }  — paired title variants
// Note: UICareerLevel has no 'name' field — display labels are resolved client-side
// by substituting {CareerPath} in titlePattern with the selected career path's name.
{ type: 'editPerson'; person: UIContact }
{ type: 'addPerson' }
```

The `canonicalTitles` array contains the full generated title list as `{ normal, short }` pairs (all distinct titles from career path × career level combinations + `"CVP"` — see §4.5). It is recomputed and resent whenever reference data changes. The webview uses the **normal** titles to populate the Title dropdown for Colleague/custom groups and to determine whether a Report's stored title is custom or generated. The **short** titles are used for compact display on the sidebar contact card.

**Webview → Extension** (`ToExtensionMessage`):
```typescript
{ type: 'ready' }
{ type: 'savePerson'; person: PersonFormData }
{ type: 'deletePerson'; id: string }
{ type: 'movePerson'; id: string; targetGroup: string }
{ type: 'openForm'; id?: string }  // id present = edit, absent = add
```

---

## 9. `package.json` Contributions

### 9.1 View Container & View

```json
"viewContainers": {
    "activitybar": [{
        "id": "memoria-contacts",
        "title": "Contacts",
        "icon": "$(person)"
    }]
},
"views": {
    "memoria-contacts": [{
        "type": "webview",
        "id": "memoria.contactsView",
        "name": "Contacts",
        "when": "memoria.contactsActive"
    }]
}
```

### 9.2 Commands

```json
"commands": [
    { "command": "memoria.addPerson", "title": "Add Person", "category": "Memoria" },
    { "command": "memoria.editPerson", "title": "Edit Person", "category": "Memoria" },
    { "command": "memoria.deletePerson", "title": "Delete Person", "category": "Memoria" },
    { "command": "memoria.movePerson", "title": "Move Person", "category": "Memoria" }
]
```

### 9.3 Command Palette Visibility

```json
"menus": {
    "commandPalette": [
        { "command": "memoria.addPerson", "when": "memoria.contactsActive" },
        { "command": "memoria.editPerson", "when": "memoria.contactsActive" },
        { "command": "memoria.deletePerson", "when": "memoria.contactsActive" },
        { "command": "memoria.movePerson", "when": "memoria.contactsActive && memoria.contactsMultiGroup" }
    ]
}
```

### 9.4 Activation Event

Add `onView:memoria.contactsView` to the existing `activationEvents` array.

---

## 10. Architecture & Code Layout

| File | Description |
|---|---|
| `src/features/contacts/contactsFeature.ts` | Feature class: lifecycle (`refresh`/`start`/`stop`), file watching, `ContactsService` API. |
| `src/features/contacts/contactParser.ts` | Pure functions: parse Markdown dictionary files into typed records; serialize records back to Markdown. |
| `src/features/contacts/referenceDefaults.ts` | Code-only default instances for pronouns, career level, career path, and interview type (`"unknown"` key). Used as fallback when referenced keys are missing. |
| `src/features/contacts/integrityCheck.ts` | Pure function: given a parsed contact file and loaded reference data, returns a list of corrections (contact id + field + old key → `"unknown"`). The feature class applies corrections and re-saves. |
| `src/features/contacts/titleGenerator.ts` | Pure function: given loaded career paths and career levels, generates the canonical title list as `{ normal, short }` pairs (all distinct titles from valid path × level combinations + `"CVP"`). Also provides `generateTitle(careerPath, careerLevel)` returning `{ normal, short }` for a specific pair. |
| `src/features/contacts/contactsViewProvider.ts` | `WebviewViewProvider` for the sidebar panel. Manages webview HTML, message dispatch, and state updates. |
| `src/features/contacts/types.ts` | TypeScript types: `Report`, `Colleague`, `Pronouns`, `CareerLevel`, `CareerPath`, `InterviewType`, message protocol types. |
| `src/features/contacts/webview/main.ts` | Webview entry point: DOM setup, message listener, search, list rendering, form rendering. |
| `src/features/contacts/webview/state.ts` | Client-side state store for the webview. |
| `src/features/contacts/webview/styles.ts` | CSS injection using VS Code theme variables. |
| `src/features/contacts/webview/types.ts` | Webview-side types (`UIContact`, `UICareerLevel`, `UICareerPath`, `VsCodeApi`). |
| `src/commands/contactCommands.ts` | Factory functions: `createAddPersonCommand`, `createEditPersonCommand`, `createDeletePersonCommand`, `createMovePersonCommand`. |
| `src/blueprints/types.ts` | **Modified** — add `ContactsFeatureEntry` to `BlueprintFeature` union. |
| `src/extension.ts` | **Modified** — instantiate `ContactsFeature`, register with `FeatureManager`, register commands. |
| `src/package.json` | **Modified** — add commands, view container, view, activation event, menu entries. |
| `src/resources/blueprints/individual-contributor/blueprint.yaml` | **Modified** — add `contacts` feature entry. |
| `src/resources/blueprints/people-manager/blueprint.yaml` | **Modified** — add `contacts` feature entry. |
| `src/esbuild.config.mjs` | **Modified** — add second build pass for `dist/contacts-webview.js` (same pattern as Todo Editor webview). |

---

## 11. Implementation Phases

### Phase 1 — Data Layer & Parsing

- Define TypeScript types for all data models (`types.ts`).
- Implement `contactParser.ts`: parse/serialize Markdown dictionary files.
- Implement `referenceDefaults.ts`: code-only default instances for each reference type.
- Implement `titleGenerator.ts`: canonical title list generation as `{ normal, short }` pairs from career paths × career levels, and single-title pair generation for Reports.
- Implement `integrityCheck.ts`: detect dangling references and produce correction lists.
- Add `ContactsFeatureEntry` to `BlueprintFeature` union.
- Add `contacts` feature entries to both blueprint YAML files.
- Unit tests for parser round-trips, edge cases, integrity check scenarios, and title generation.

### Phase 2 — Feature Class & Service

- Implement `ContactsFeature`: lifecycle, file reading, file watching with debounce, integrity check on file change.
- Expose `ContactsService` API (lookup by id, get all reports/colleagues, resolve pronouns/levels/career paths — with code-only defaults as fallback).
- Register feature with `FeatureManager` in `extension.ts`.
- Unit tests for feature activation/deactivation, service methods, and integrity auto-correction.

### Phase 3 — Commands

- Implement command factory functions in `contactCommands.ts`.
- Register commands eagerly in `extension.ts`.
- Add `package.json` command contributions and menu entries.
- QuickPick fallback for palette invocation.
- Unit tests for command logic (add, edit, delete, move including `_droppedFields` handling).

### Phase 4 — Sidebar Webview

- Implement `ContactsViewProvider` (sidebar `WebviewViewProvider`).
- Build webview (list view, search, form view, message protocol).
- Add esbuild pass for `dist/contacts-webview.js`.
- Add `package.json` view container and view contributions.
- E2E tests for feature activation/deactivation and sidebar lifecycle.

---

## 12. Unit Tests

`tests/unit-tests/features/contacts/contactParser.test.ts`:

| Category | Tests |
|---|---|
| **Parse round-trip** | Parse Markdown → serialize → identical text for all 6 file types. |
| **Reports** | Parse `Team.md` with multiple records; verify all fields extracted. |
| **Colleagues** | Parse `Colleagues.md`; verify colleague-specific fields only. |
| **Reference data** | Parse `Pronouns.md`, `CareerLevels.md`, `CareerPaths.md`, `InterviewTypes.md`; verify key-value extraction. |
| **Empty files** | Parse empty `.md` files → empty arrays, no errors. |
| **Id uniqueness** | Validate that duplicate `# id` headings across files are detected. |
| **Add record** | Append a new record → serialized Markdown has correct format. |
| **Remove record** | Remove a record by id → heading and all fields removed. |
| **Update record** | Update fields on existing record → only changed fields differ. |
| **Move (Report→Colleague)** | Dropped fields serialized as `_droppedFields` nested block. |
| **Move (Colleague→Report)** | `_droppedFields` entries consumed and removed; unconsumed entries preserved. |
| **`_droppedFields` round-trip** | Parse a record with `_droppedFields` block → serialize → identical text. |
| **Malformed input** | Missing fields, extra whitespace, unknown fields → graceful handling. |

`tests/unit-tests/features/contacts/integrityCheck.test.ts`:

| Category | Tests |
|---|---|
| **All valid** | Contact with valid `PronounsKey`, `CareerPathKey`, and `LevelId` → no corrections returned. |
| **Missing pronouns** | Contact references `PronounsKey: "xe/xem"` not in pronouns data → correction to `"unknown"` returned. |
| **Missing career path** | Contact references `CareerPathKey: "data-scientist"` not in career paths data → correction to `"unknown"` returned. |
| **Missing career level** | Report references `LevelId: "l99"` not in career levels data → correction to `"unknown"` returned. |
| **Missing interview type** | Career level references `InterviewType: "staff"` not in interview types data → correction to `"unknown"` returned. |
| **Multiple contacts, mixed** | File with 3 contacts: one valid, one with missing pronouns, one with missing career path → exactly 2 corrections returned. |
| **Default key resolves to code-only default** | `ContactsService.resolvePronouns("unknown")` returns the code-only default instance (Subject: "they", etc.). |
| **Colleague has no LevelId** | Colleague record is never checked for `LevelId` → no false corrections. |

`tests/unit-tests/features/contacts/titleGenerator.test.ts`:

| Category | Tests |
|---|---|
| **Basic generation** | Given 2 career paths and 3 career levels, generates correct Cartesian product of `{ normal, short }` title pairs using `TitlePattern` substitution with `Name` and `Short` respectively. |
| **MinimumCareerLevel filtering** | Career path with `MinimumCareerLevel: 5` excludes levels with `Id < 5` from generated titles. |
| **Deduplication** | Two career paths that produce the same normal title string (e.g., both map to "Senior Software Engineer") → title pair appears only once in the list. |
| **CVP included** | Generated list always includes `{ normal: "CVP", short: "CVP" }` as the last entry. |
| **Empty inputs** | No career paths or no career levels → returns `[{ normal: "CVP", short: "CVP" }]` only. |
| **Single title for Report** | `generateTitle(careerPath, careerLevel)` returns `{ normal, short }` with correct substitutions (e.g., `"Senior {CareerPath}"` + SDE/"Software Engineer" → `{ normal: "Senior Software Engineer", short: "Senior SDE" }`). |
| **Unknown defaults** | When career path or career level is the code-only `"unknown"` default, `generateTitle` returns `{ normal: "Unknown", short: "?" }` (from default `TitlePattern: "{CareerPath}"` + default path `Name: "Unknown"` / `Short: "?"`). |
| **Ref data change recomputes** | Changing a career level's `TitlePattern` and regenerating the list produces updated title pairs. |
| **Short title uses Short field** | Verify that the short variant substitutes `CareerPath.Short` (not `Name`) in `TitlePattern`. |

`tests/unit-tests/commands/contactCommands.test.ts`:

| Category | Tests |
|---|---|
| **Add** | Factory returns handler that delegates to feature; inactive feature shows info message. |
| **Edit** | QuickPick shown when no context; direct dispatch with context. |
| **Delete** | Confirmation dialog shown; cancel is no-op. |
| **Move** | Report→Colleague and Colleague→Report logic paths. |
| **Custom group** | Factory returns handler that creates new group file and updates context keys. |

---

## 13. E2E Tests

`tests/e2e-tests/features/contacts/contacts.test.ts`:

| Test | Description |
|---|---|
| **Feature gate — enabled** | Initialize workspace → verify `contacts` feature is enabled → assert view container is registered. |
| **Feature gate — disabled** | Disable `contacts` in `features.json` → trigger refresh → assert view container is not visible. |
| **Add report** | Invoke `memoria.addPerson` → write `Team.md` → verify record appears in file. |
| **Add colleague** | Invoke `memoria.addPerson` → write `Colleagues.md` → verify record appears in file. |
| **Edit person** | Modify a field via `memoria.editPerson` → verify file updated on disk. |
| **Delete person** | Invoke `memoria.deletePerson` → verify record removed from file. |
| **Move Report→Colleague** | (people-manager) Move a report → verify record removed from `Team.md`, appended to `Colleagues.md` with `_droppedFields` block. |
| **Move Colleague→Report** | (people-manager) Move a colleague with `_droppedFields` → verify fields restored in `Team.md`, `_droppedFields` block removed. |
| **Move hidden (single group)** | When only one group exists, verify `memoria.movePerson` is not visible in command palette. |
| **Custom group creation** | Invoke Add Person → select "+ New Group" → provide name → verify new `.md` file created in `peopleFolder`, group appears in sidebar, and `memoria.contactsMultiGroup` context key is updated. |
| **File watcher** | Edit `Colleagues.md` externally → verify in-memory data reloads and sidebar refreshes (no stale state). |
| **Id uniqueness** | Attempt to add a person with an existing id in any group file → verify rejection (no duplicate written). |
| **Single-group UX** | (individual-contributor) Verify group selector is shown with single group pre-selected and "+ New Group" option available; only Colleagues group shown in sidebar. |
| **Integrity — contact save** | Add a contact with valid refs → delete the referenced pronoun from `Pronouns.md` → trigger file watcher → verify the contact's `PronounsKey` is rewritten to `"unknown"` in the group file. |
| **Integrity — ref data change** | Seed `Team.md` with a report referencing `LevelId: l1` → remove `# l1` from `CareerLevels.md` → verify `Team.md` is rewritten with `LevelId: unknown`. |
| **Integrity — career path removed** | Seed `Colleagues.md` with a contact referencing `CareerPathKey: pm` → remove `# pm` from `CareerPaths.md` → verify `Colleagues.md` is rewritten with `CareerPathKey: unknown`. |
| **Title — Report auto-generated** | Add a report with `CareerPathKey: sde`, `LevelId: l5` → verify `Title` in `Team.md` matches the generated value from the level's `TitlePattern`. |
| **Title — Colleague dropdown** | Add a colleague → verify `Title` in `Colleagues.md` is one of the canonical generated titles or `"CVP"`. |
| **Title — custom preserved** | Edit `Team.md` directly, set a report's Title to a custom string → verify in-memory data reloads with the custom title preserved. |
| **Title — ref data change updates titles** | Edit `CareerLevels.md` to change a `TitlePattern` → verify the canonical title list sent to the webview is updated. |

---

## 14. Verification Checklist

1. `npm run build` → `dist/extension.js` and `dist/contacts-webview.js` emit with no errors.
2. Initialize workspace with `people-manager` blueprint → Contacts Activity Bar icon appears.
3. Click Contacts icon → sidebar panel opens with empty state message.
4. `Memoria: Add Person` → form opens in sidebar; group selector shows Team / Colleagues.
5. Select Team (Report type) → `CareerPathKey`, `LevelId` and `LevelStartDate` fields visible.
6. Switch to Colleagues (Colleague type) → `LevelId` and `LevelStartDate` fields hidden; `CareerPathKey` still visible.
7. Select a career path → `LevelId` dropdown filters to levels at or above the path's `MinimumCareerLevel`.
8. (Report Add) Title field shows auto-computed read-only value based on selected `CareerPathKey` + `LevelId`. Changing either recalculates the title.
9. (Colleague Add) Title field is a dropdown with canonical titles (generated from all career path × level combinations + `"CVP"`).
10. Submit a new Report → record appended to `Team.md`; person appears in sidebar list under "Team"; `Title` matches the generated value.
11. Submit a new Colleague → record appended to `Colleagues.md`; `Title` matches the selected dropdown value.
12. Initialize workspace with `individual-contributor` blueprint → Contacts icon appears; only Colleagues group available; group selector pre-selects Colleagues with "+ New Group" option; Move command hidden.
13. Click edit icon on a contact → form pre-filled; `id` and type are read-only.
14. Click delete icon → confirmation dialog → person removed from file and sidebar.
15. (People-manager) Move Report→Colleague → record physically removed from `Team.md` and appended to `Colleagues.md`; `_droppedFields` block present.
16. (People-manager) Move Colleague→Report (with `_droppedFields`) → form pre-populated; on submit, `_droppedFields` block removed.
17. (Single-group) Move command is not visible in command palette or sidebar.
18. Create custom group via "+ New Group" in Add Person form → new `.md` file created; group appears in sidebar accordion.
19. Search contacts → list filters by name/title/id.
20. Edit `Colleagues.md` in text editor → sidebar refreshes automatically.
21. Disable Contacts via `Memoria: Manage Features` → sidebar icon disappears; commands show info message.
22. Re-enable Contacts → sidebar and commands restored.
23. Delete a pronoun key from `Pronouns.md` that a contact references → sidebar refreshes → contact shows "unknown" pronouns → re-open the contact group file → `PronounsKey` rewritten to `unknown`.
24. Delete a career level key from `CareerLevels.md` that a report references → `LevelId` rewritten to `unknown` in `Team.md`.
25. Delete a career path key from `CareerPaths.md` that a contact references → `CareerPathKey` rewritten to `unknown` in the contact's group file.
26. Edit `Team.md` directly, set a report's Title to "Custom VP Title" → open edit form → Title shows dropdown with ["Custom VP Title", generated value]. Select generated value → Title resets to computed value in file.
27. Edit `Colleagues.md` directly, set a colleague's Title to "My Special Title" → open edit form → Title dropdown includes "My Special Title" at the top plus all canonical titles.
28. Edit `CareerLevels.md` to change a `TitlePattern` → sidebar refreshes → Report titles (both normal and short forms) and Colleague title dropdown reflect the updated pattern; sidebar card short titles update accordingly.
29. `npm test` → all unit tests pass (including integrity check and title generator tests).
30. `npm run test:integration` → all E2E tests pass.

---

## 15. Documentation Updates

### 15.1 User Guide

Add `src/resources/docs/features/contacts.md`:

- **What it is**: A sidebar panel for managing team contacts and colleagues.
- **Person types**: Explain Report vs. Colleague and their fields.
- **Reference data**: How to customize pronouns, career levels, career paths, and interview types by editing the Markdown files in `DataTypes/`.
- **Commands**: List all 4 commands with descriptions.
- **Custom groups**: How to create new contact groups via the Add Person form.
- **Moving between types**: Explain the Report↔Colleague move behavior and `_droppedFields` preservation.

### 15.2 Memory Bank

Update `.memory-bank/` after implementation:

- **`activeContext.md`**: Reflect Contacts as current work focus.
- **`progress.md`**: Mark Contacts feature as implemented.
- **`systemPatterns.md`**: Add `ContactsFeature`, `ContactsViewProvider`, and `ContactsService` to architecture diagram.

---

## 16. Decisions

- **One file per contact group.** Each contact group maps to a single Markdown file whose name matches the group. This makes the file system the source of truth for group membership — moving a contact between groups is a physical cut-and-paste between files, which is transparent and diffable.
- **Markdown over JSON for data storage.** All data files use the `# key` / `- Field: value` Markdown dictionary format established by the shipped seed files. This keeps data human-readable, diff-friendly, and consistent with the rest of the Memoria workspace.
- **Fully webview-based sidebar** (vs. TreeView for list + separate webview for form). A single webview provides smoother transitions between list and form views, richer layout control, and a more cohesive UX. The contact dataset is small enough that client-side rendering is performant.
- **Ultra-Compact, Native UX (No Images).** The side view is aggressively constrained (no horizontal avatars) to support incredibly narrow widths (200-250px). Information stacks into a dense 2-line flexbox prioritizing Nickname, Full Name, and Title. Labels sit strictly *above* inputs in the form view.
- **Frictionless Interactions (Click Reduction).** The UI actively prevents modal popups. Delete actions shift the row's background to a warning state and resolve inline. Move operations (when exactly 2 groups are present) bypass the traditional QuickPick, mutating into a 1-click instantaneous toggle with a toast notification to avoid context switching.
- **Factory function command pattern.** Commands use the same `create*Command()` factory pattern as existing commands (`createSyncTasksCommand`, etc.) rather than a placeholder/injection pattern. Factories receive the `ContactsFeature` instance and check feature state internally.
- **`_droppedFields` block for Move bookkeeping.** When moving Report→Colleague, type-specific fields are preserved as a `- _droppedFields:` entry with nested `- Key: value` lines (e.g., `- _droppedFields:\n  - LevelId: l3\n  - LevelStartDate: 2025-06-01`). This uses a single reserved key with a nested list, keeping the Markdown readable and clearly signaling internal-only data. The parser must handle this nested structure as a special case.
- **`ContactsService` via direct object reference.** Other features access contacts data by receiving the `ContactsFeature` instance directly (same pattern as `TaskCollectorFeature.syncNow()`), not via a service registry.
- **`id` immutability during edit.** The `id` (H1 heading) cannot be changed via the edit form to preserve referential integrity. Users must delete and re-create to change an id.
- **Individual-contributor has no Report type.** ICs do not manage reports and should not see `LevelId`, `LevelStartDate`, or interview type details. The blueprint declares only one contact group (`Colleagues`), so the Move command is hidden by default. Users can still create custom groups via "+ New Group", which enables the Move command dynamically.
- **Code-only defaults for referential integrity.** Rather than rejecting or silently ignoring dangling references, the extension auto-corrects them to a well-known `"unknown"` default key. The defaults live only in code (`referenceDefaults.ts`) — they are never written to the reference data Markdown files. This keeps user-editable files clean while ensuring the in-memory model always resolves to valid objects.
- **Title field: generated in normal/short variants from reference data, custom values preserved.** Title generation uses `TitlePattern` with two substitution modes: **normal** (using `CareerPath.Name`, e.g., "Senior Software Engineer") and **short** (using `CareerPath.Short`, e.g., "Senior SDE"). The normal form is the stored `Title` value and is used in forms and the canonical title dropdown. The short form is derived at display time for the compact sidebar card and is never persisted. Report titles are auto-computed from `CareerPathKey` + `LevelId` (via `TitlePattern`), making the field read-only during normal Add/Edit. Colleague titles are selected from a canonical list of normal-form titles. In both cases, the `Title` field is stored in the Markdown file as the normal-form plain string. Users can always override it by editing the file directly — the extension detects the mismatch and adapts the UX (showing a two-option dropdown for Reports, or adding the custom value to the Colleague dropdown). Custom titles have no short variant and display as-is in the sidebar.
- **Immediate reactivity to file changes.** All contact group files and reference data files are watched. Any change triggers an in-memory reload, title list recomputation, and webview refresh. This ensures the sidebar always reflects the current state of files on disk, whether changes come from the extension's own operations, direct file edits, or git operations.

---

## 17. Resolved Questions

- **Sorting in sidebar.** Alphabetical by `FullName` for v1. Configurable sorting is deferred to a future iteration.
- **InterviewTemplates folder.** The blueprint scaffolds an `InterviewTemplates/` folder inside the contacts folder. This folder is scaffolded but unmanaged by the Contacts feature. Interview template management is deferred to a future PRD.
- **Cross-feature integration.** Concrete `ContactsService` consumers will be defined when those features are built. The service API is designed to be stable; specific integration points are out of scope for this PRD.
- **`"CVP"` as a hardcoded canonical title.** Accepted for v1. Making this configurable is deferred.
