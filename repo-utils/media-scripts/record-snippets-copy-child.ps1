$target = "src/resources/docs/media/snippets-copy-child.gif"

# Recording script: Copy Child Heading snippet
# ===============================================
# Shows: Using {copy-child} to duplicate a sub-heading section
#
# Prerequisites:
#   - Initialized Memoria workspace with Snippets feature enabled
#   - A Markdown file with a heading that has several sub-headings below it
#   - Dark Modern theme, ~800×500px capture area
#
# Steps:
#   1. Open a Markdown file with a structure like:
#      ## Weekly Notes
#      ### Week 15
#      - Some notes...
#      ### Week 14
#      - Older notes...
#   2. Position the cursor at the end of the "## Weekly Notes" heading line
#   3. Type "{copy-child}" — the autocomplete popup appears with "Copy Child Heading"
#   4. Select the snippet
#   5. A QuickPick appears listing the sub-headings ("Week 15", "Week 14")
#   6. Select "Week 15"
#   7. The full content of the "### Week 15" section is inserted at the cursor
#   8. Pause to show the duplicated section in the document
