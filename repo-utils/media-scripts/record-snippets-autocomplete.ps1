$target = "src/resources/docs/media/snippets-autocomplete.gif"

# Recording script: Snippets autocomplete (date/time)
# =====================================================
# Shows: Typing snippet triggers, selecting from autocomplete, choosing format
#
# Prerequisites:
#   - Initialized Memoria workspace with Snippets feature enabled
#   - A Markdown file open for editing
#   - Dark Modern theme, ~800×500px capture area
#
# Steps:
#   1. Open a Markdown file and position the cursor in the body
#   2. Type "{date}" — the autocomplete popup appears with "Date" snippet
#   3. Select the "Date" snippet from the list
#   4. A QuickPick appears with format options (YYYY-MM-dd, MM/dd/YYYY, etc.)
#   5. Select "YYYY-MM-dd" — the current date is inserted (e.g., "2026-04-26")
#   6. Press Enter to start a new line
#   7. Type "{time}" — select the "Time" snippet
#   8. Choose a time format — current time is inserted
#   9. Press Enter, type "{now}" — select "Date & Time" — full timestamp inserted
#  10. Pause to show the three expanded snippets
