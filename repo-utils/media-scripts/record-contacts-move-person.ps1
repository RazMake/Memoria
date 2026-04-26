$target = "src/resources/docs/media/contacts-move-person.gif"

# Recording script: Move person between contact groups
# ======================================================
# Shows: Moving a contact between groups, with field handling
#
# Prerequisites:
#   - Initialized People Manager workspace with Contacts enabled
#   - At least 2 groups (e.g., Team.md with reports, Colleagues.md)
#   - A report-type contact in Team.md to move
#   - Dark Modern theme, ~800×500px capture area
#
# Steps:
#   1. Open the Contacts sidebar, show a report in Team.md group
#   2. Hover over the contact row to reveal inline actions
#   3. Click the "Move" action (or use Command Palette → "Memoria: Move Person")
#   4. Select the destination group (e.g., Colleagues.md)
#   5. Show the confirmation — report-only fields will be preserved as _droppedFields
#   6. Confirm the move
#   7. Contact disappears from Team.md and appears in Colleagues.md
#   8. (Optional) Move the contact back — show that dropped fields are restored
