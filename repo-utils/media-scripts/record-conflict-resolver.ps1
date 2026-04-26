$target = "src/resources/docs/media/conflict-resolver.gif"

# Recording script: Reinitialization conflict resolver
# ======================================================
# Shows: Running Initialize workspace on an already-initialized workspace,
#        handling extra folders and modified files with diff editor
#
# Prerequisites:
#   - Initialized Memoria workspace (already has .memoria/ and folders)
#   - Some files modified from their blueprint originals
#   - Optionally, a folder that doesn't exist in the new blueprint
#   - Dark Modern theme, ~800×500px capture area
#
# Steps:
#   1. Show the Explorer with the current workspace structure
#   2. Open the Command Palette → "Memoria: Initialize workspace"
#   3. The reinit prompt appears — confirm to proceed
#   4. Select a blueprint (same or different)
#   5. Step 1: Extra folders checklist appears
#      - Show folders not in the new blueprint (all checked = kept by default)
#      - Uncheck one folder to move it to WorkspaceInitializationBackups/
#      - Confirm
#   6. Step 2: Modified files checklist appears
#      - Show conflicting files listed
#      - Check a file to open it in the diff editor
#      - Confirm
#   7. Diff editor opens — left side shows the old version, right side the new blueprint version
#   8. Show the WorkspaceInitializationBackups/ folder with backed-up files
#   9. Pause to let the viewer see the complete flow
