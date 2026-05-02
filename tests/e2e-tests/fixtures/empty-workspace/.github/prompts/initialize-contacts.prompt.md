---
description: Use WorkIQ to initialize Peers.md and Colleagues.md with current organization's members and structure.
name: "Initialize Contacts"
agent: "agent"
tools: [read/readFile, agent, edit/editFiles]
---

Use the `WorkIQ` agent to query current organization members and produce updated content for three contact files:
- [Peers](../05-Autocomplete/Contacts/Peers.md)
- [Colleagues.md](../05-Autocomplete/Contacts/Colleagues.md).

## Step 1 — Discover the org structure

1. Find out **who I am** (my alias, full name, title, manager).
2. Find out **who reports direcly to my manager**. Also exlude myself.
4. Find out **who reports (recursively, all levels) to my manager's manager**, excluding the people reporting to my manager.

## Step 2 — Update Peers.md content

List every person who **reports direcly to my manager, excluding myself**.  

Look at [Peers.md](../05-Autocomplete/Contacts/Peers.md) for the expected schema and content format.

## Step 3 — Update Colleagues.md content

List every person who **reports (recursively) to my manager's manager**, **excluding**:
- Anyone who reports direcly to my manager (_already in Peers.md_)

Look at [Colleagues.md](../05-Autocomplete/Contacts/Colleagues.md) for the expected schema and content format.

## Career information mapping

Use the data type files to find necessary field values:
- [CareerLevels.md](../data-types/CareerLevels.md)
- [CareerPaths.md](../data-types/CareerPaths.md)

- `CareerPathKey` - the values for this field are all headings (H1) from the `CareerPaths.md`. Use the title of the person's position to map it to a career path. For example, if the title contains "Software Engineer", then the `CareerPathKey` would be `sde`. If the title contains "Engineering Manager", then the `CareerPathKey` would be `em`, and so on. If there is no match, set the field to **unkown**.
- `Title` - set it to the person's title in the org.
- `PronounsKey` - infer this information based on the person's name. The user can always fix an incorrect assumption later.
- `FullName` - set it to the person's full name in the org.
- `Nickname` - set it to the person's first name. The user can change it to something else later.
- the heading for each contact is the person's alias, which is their email prefix (the part before the @ in their email address).
