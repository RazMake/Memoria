# Contacts

The Contacts feature adds a dedicated **Contacts** sidebar to Memoria for browsing, searching, and maintaining the people records stored in your blueprint's contacts folder.

## What it manages

Contacts are stored as Markdown dictionaries in the blueprint-owned people folder:

- **People Manager** workspaces use `06-Autocomplete/Contacts/`
- **Individual Contributor** workspaces use `05-Autocomplete/Contacts/`

Each contact group is a single Markdown file such as `Team.md`, `Peers.md`, or `Colleagues.md`. Reference data lives under `DataTypes/` in the same folder.

## Person types

- **Report**: Available only in the People Manager blueprint. Reports track the shared profile fields plus career level tracking (`LevelId`, `LevelStartDate`), team-member details (`EmployeeId`, `BandRank`, `OverallRank`), and an auto-generated title.
- **Colleague**: Available in both bundled blueprints. Colleagues track the shared profile fields and choose a title from the generated title list.
- **Custom groups**: You can create additional groups from the sidebar form. Custom groups always use the colleague field set.

## Contact fields

Every contact is a Markdown dictionary whose heading (H1) is the person's **id** (typically their alias / email prefix).

### Shared fields (all person types)

| Field | Description |
| --- | --- |
| `Nickname` | Short, friendly name (for example, `Alice`). |
| `FullName` | The person's full name. |
| `Title` | Job title. For reports this is auto-generated from the career path and level (a custom title can be stored instead). |
| `CareerPathKey` | References a career path defined in `CareerPaths.md`. |
| `PronounsKey` | References a pronouns profile defined in `Pronouns.md`. |

### Report-only fields (Team members)

These fields exist only on **Report** records in the People Manager blueprint:

| Field | Description |
| --- | --- |
| `LevelId` | References a career level defined in `CareerLevels.md`. |
| `LevelStartDate` | ISO date (`YYYY-MM-DD`) when the person started at the current level. |
| `EmployeeId` | The personnel number of the team member, used to look up their Connect, perspectives, Connect history, and similar records. |
| `BandRank` | The team member's rank within their band. Used during people discussions. |
| `OverallRank` | The team member's overall rank within the team, representing the developer's capability. Used when balancing work across the team. |

`EmployeeId`, `BandRank`, and `OverallRank` are private and are not populated automatically during contact initialization — fill them in yourself (in the sidebar form or by editing `Team.md` directly).

## Sidebar workflow

The sidebar is optimized for narrow widths:

- Search by nickname, full name, id, or title
- Browse contacts grouped by their backing Markdown file
- Click a contact row to edit it
- Use the inline actions to edit, move, or delete
- Use the `+` button to add a new contact or create a new group

![Contacts sidebar](media/contacts-sidebar.gif)

## Reference data

Reference data is stored in editable Markdown files under `DataTypes/`:

- `Pronouns.md`
- `CareerLevels.md`
- `CareerPaths.md`
- `InterviewTypes.md`

The sidebar reloads when these files change. If a contact or career level points to a missing reference entry, Memoria rewrites the missing key to `unknown` so the data remains usable.

## Moving between groups

Moving a person physically moves the record between group files.

- **Report -> Colleague** keeps the report-only fields (`LevelId`, `LevelStartDate`, `EmployeeId`, `BandRank`, `OverallRank`) under `_droppedFields`
- **Colleague -> Report** restores those dropped fields when available and asks for any missing report-only data before saving

## Commands

- `Memoria: Add Person`
- `Memoria: Edit Person`
- `Memoria: Delete Person`
- `Memoria: Move Person`

These commands are available only while the Contacts feature is active.

## Tips

- Use `Memoria: Manage features` to enable or disable Contacts without reloading VS Code.
- Edit the Markdown files directly if you prefer bulk changes or need to preserve a custom title not present in the generated list.
- If the sidebar seems stale after a large external edit, save the file again or reload the window so the watcher can re-scan the contacts folder.

---

[⬅️ **Back** to Features](index.md) 💠 [Commands](../commands/index.md) 💠 [Getting Started](../getting-started.md)
