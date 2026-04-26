$target = "src/resources/docs/media/snippets-contact.gif"

# Recording script: Contact snippets (@-trigger)
# ================================================
# Shows: Typing @ followed by a name, selecting a contact, choosing format
#
# Prerequisites:
#   - Initialized Memoria workspace with both Snippets and Contacts features enabled
#   - At least 3-4 contacts loaded in the sidebar
#   - A Markdown file open for editing
#   - Dark Modern theme, ~800×500px capture area
#
# Steps:
#   1. Open a Markdown file and position the cursor
#   2. Type "@" — the autocomplete popup appears with contact names
#   3. Continue typing a name fragment (e.g., "@jd") to filter
#   4. Select a contact from the list (e.g., "Jane Doe")
#   5. A QuickPick appears with format options (Nickname, Full Name, Full Name (title), etc.)
#   6. Select "Full Name (title)" — the formatted text is inserted
#   7. Hover over the inserted text — brief tooltip shows contact info
#   8. Press Ctrl+Shift+H to show the detailed contact hover with full profile
