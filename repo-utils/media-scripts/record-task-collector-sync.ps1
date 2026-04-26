$target = "src/resources/docs/media/task-collector-sync.gif"

# Recording script: Task Collector two-way sync
# ================================================
# Shows: Adding tasks in source files and seeing them collected; checking off in collector
#
# Prerequisites:
#   - Initialized Memoria workspace with Task Collector enabled
#   - A Markdown source file open alongside the collector file (split view)
#   - Dark Modern theme, ~800×500px capture area
#
# Steps:
#   1. Show split view: source Markdown file on the left, collector (All.todo.md) on the right
#   2. In the source file, type a new task: "- [ ] Review the proposal"
#   3. Save the source file (Ctrl+S)
#   4. The collector file updates — new task appears in the "# To do" section
#   5. In the collector file, check off a task: change `- [ ]` to `- [x]`
#   6. Save the collector file
#   7. The task moves to the "# Completed" section with a date stamp
#   8. Switch to the source file — the corresponding task is now `- [x]`
#   9. Pause to show the two-way sync result
