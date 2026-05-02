# Media Assets

GIF animations and screenshots used in the User Guide.

VS Code's markdown preview webview restricts resource loading to the markdown file's own directory (`localResourceRoots`). Images must live in a `media/` subfolder **within the same directory** as the markdown file that references them — `../media/` paths are blocked.

## File locations

| File | Location | Referenced by |
|------|----------|---------------|
| `initialize-workspace.gif` | `docs/media/` | `getting-started.md` |
| `initialize-workspace.gif` | `docs/commands/media/` | `commands/initialize-workspace.md` |
| `conflict-resolver.gif` | `docs/commands/media/` | `commands/initialize-workspace.md` |
| `explorer-decorations.gif` | `docs/features/media/` | `features/decorations.md` |
| `contacts-sidebar.gif` | `docs/features/media/` | `features/contacts.md` |
| `task-collector-sync.gif` | `docs/features/media/` | `features/task-collector.md` |
| `snippets-autocomplete.gif` | `docs/features/media/` | `features/snippets.md` |
| `todo-editor.gif` | _(not yet used)_ | — |

## Recording tips

- Use [ScreenToGif](https://www.screentogif.com/) on Windows
- Target resolution: ~800×500px
- Keep GIFs under 2MB each to avoid bloating the `.vsix`
- Use a clean VS Code theme (e.g., Dark Modern) for consistency
