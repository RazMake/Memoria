---
description: Use WorkIQ to initialize Team.md, Peers.md and Colleagues.md with current organization's members and structure.
name: "Initialize Contacts"
agent: "agent"
tools: [read/readFile, agent, edit/editFiles]
---

Use the `WorkIQ` agent to query current organization members and produce updated content for three contact files:
- [Team.md](../../06-Autocomplete/Contacts/Team.md) - file is initialized with sample `report` contacts.
- [Peers.md](../../06-Autocomplete/Contacts/Peers.md) - this file is initialized with sample `colleague` contacts.
- [Colleagues.md](../../06-Autocomplete/Contacts/Colleagues.md) - this file is initialized with sample `colleague` contacts.

## Step 1 — Discover the org structure

1. Find out **who I am** (my alias, full name, title, manager).
2. Find out **who reports directly to me**.
3. Find out **who reports directly to my manager, is a manager (has direct reports)**, but does not report to me. Also exlude myself.
4. Find out **who reports (recursively, all levels) to my manager**, excluding myself and people reporting to me.

## Step 1.5 — Verify manager classification

Before updating files, validate every person who reports directly to my manager:
- Query whether the person has direct reports.
- If the answer is yes, also request the list of their direct reports as evidence.
- Treat a person as a manager for this workflow if they have one or more direct reports, even if their title does not contain "Manager".
- If the first query says a person has no direct reports but their title suggests people management or leadership, re-check that person specifically before placing them in `Colleagues.md`.
- After classification, confirm that no alias appears in more than one contact file.
- Confirm that everyone in `Peers.md` has at least one direct report, and everyone excluded from `Peers.md` has no direct reports according to the verified org data.

## Step 2 — Update Team.md content

List every person who **reports directly to me**.  

Look at `Team.md` for the expected schema and content format.

## Step 3 — Update Peers.md content

List every person who **reports directly to my manager, is a manager (has direct reports)**, but does not report to me, and is not myself.  

Look at `Peers.md` for the expected schema and content format.

## Step 4 — Update Colleagues.md content

List every person who **reports (recursively) to my manager**, **excluding**:
- Me
- Anyone who reports directly to me (_already in Team.md_)
- Anyone who reports directly to my manager and has direct reports (_already in Peers.md_)

Look at `Colleagues.md` for the expected schema and content format.

## Career information mapping

Use the data type files to find necessary field values:
- [CareerLevels.md](../../06-Autocomplete/Contacts/DataTypes/CareerLevels.md)
- [CareerPaths.md](../../06-Autocomplete/Contacts/DataTypes/CareerPaths.md)

- `LevelId` and `LevelStartDate` (only exists in the `Team.md` file) - cannot be filled automatically as this information is not public. Add them to the file, but leave them empty.
- `CareerPathKey` - the values for this field are all headings (H1) from the `CareerPaths.md`. Use the title of the person's position to map it to a career path. For example, if the title contains "Software Engineer", then the `CareerPathKey` would be `sde`. If the title contains "Engineering Manager", then the `CareerPathKey` would be `em`, and so on. If there is no match, set the field to **unknown**.
- `Title` - set it to the person's title in the org.
- `PronounsKey` - infer this information based on the person's name. The user can always fix an incorrect assumption later.
- `FullName` - set it to the person's full name in the org.
- `Nickname` - set it to the person's first name. The user can change it to something else later.
- the heading for each contact is the person's alias, which is their email prefix (the part before the @ in their email address).
