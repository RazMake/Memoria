# Contacts Commands

The Contacts feature exposes four commands for managing people from the Command Palette.

## Add Person

Opens the Contacts sidebar form in **Add** mode.

- Lets you choose a group
- Supports creating a new custom group inline
- Validates ids and reference keys before saving

## Edit Person

Opens the Contacts sidebar form for an existing person.

- Preserves the contact id as read-only
- Keeps the current group fixed during edit
- Adapts the title field based on report or colleague behavior

## Delete Person

Removes a person from the backing Markdown file.

- From the sidebar, deletion is confirmed inline on the row
- From the Command Palette, Memoria first asks you to choose a person and then confirm the deletion

## Move Person

Moves a person between contact group files.

- Report-only fields are preserved under `_droppedFields` when moving into a colleague-style group
- Moving into a report group restores those fields when possible and asks for any missing report-only data
- The command is hidden until at least two groups exist

---

[⬅️ **Back** to Commands](index.md) 💠 [Contacts Feature](../features/contacts.md)
