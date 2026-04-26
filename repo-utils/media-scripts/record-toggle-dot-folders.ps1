$target = "src/resources/docs/media/toggle-dot-folders.gif"

# Recording script: Toggle dot-folders
# ======================================
# Shows: Before/after dot-folder visibility in Explorer
#
# Prerequisites:
#   - Initialized Memoria workspace with visible dot-folders (.memoria/, .github/, .vscode/)
#   - Dark Modern theme, ~800×500px capture area
#
# Steps:
#   1. Show the Explorer with dot-folders visible (.memoria/, .github/, etc.)
#   2. Open the Command Palette (Ctrl+Shift+P)
#   3. Type "Memoria: Toggle dot-folders" and select it
#   4. Dot-folders disappear from the Explorer (first run hides all)
#   5. Pause to show the clean Explorer without dot-folders
#   6. Open the Command Palette again
#   7. Run "Memoria: Toggle dot-folders" again
#   8. Multi-select picker appears — show checking/unchecking individual folders
#   9. Confirm — some dot-folders reappear, others stay hidden
