# VS Code Extension Lifecycle

A concise reference for how VS Code extensions are loaded, activated, and deactivated.

## Extension Host Process

Extensions run in a separate **Extension Host** process, isolated from the main VS Code UI process. This ensures:

- A misbehaving extension cannot crash VS Code.
- Extensions can be activated and deactivated independently.
- Remote workspaces can run extensions in a different environment.

## Lifecycle Flow

```
VS Code starts
  └─→ Reads package.json manifests for all installed extensions
       └─→ Activation event fires (e.g., onStartupFinished, onCommand, onLanguage)
            └─→ Extension Host loads the module specified by "main" in package.json
                 └─→ Calls activate(context: ExtensionContext)
                      └─→ Extension is running (commands, providers, watchers active)
                           └─→ VS Code shuts down or extension is disabled
                                └─→ Calls deactivate()
```

## Activation Events

Declared in `package.json` under `activationEvents`. Common triggers:

| Event | When it fires |
|---|---|
| `onStartupFinished` | After VS Code finishes startup (does not slow startup) |
| `onCommand:<id>` | When the specified command is invoked |
| `onLanguage:<lang>` | When a file of the specified language is opened |
| `onView:<id>` | When the specified view is expanded in the sidebar |
| `workspaceContains:<glob>` | When the workspace contains a matching file |
| `*` | On VS Code startup (avoid — delays startup) |

**Implicit activation** (since VS Code 1.74.0): If your extension declares contribution points (commands, views, etc.) in `package.json`, VS Code can activate it automatically when those contributions are invoked — without explicit `activationEvents` entries.

## activate(context)

Called once when the extension is first activated. Receives an `ExtensionContext` with:

- **`subscriptions`**: Push disposables here; VS Code disposes them on deactivation.
- **`extensionPath`**: Absolute path to the extension directory.
- **`storageUri`** / **`globalStorageUri`**: Persistent storage locations.
- **`secrets`**: Secure credential storage.

**Subscriptions pattern** — register commands, providers, and watchers by pushing to `context.subscriptions`:

```ts
context.subscriptions.push(
    vscode.commands.registerCommand("myExt.doThing", handler),
    vscode.languages.registerHoverProvider("typescript", hoverProvider),
    vscode.workspace.onDidChangeConfiguration(onConfigChange)
);
```

## deactivate()

Called when VS Code shuts down or the extension is disabled/uninstalled.

- Return `void` for synchronous cleanup, or a `Promise` for async cleanup.
- All disposables pushed to `context.subscriptions` are disposed automatically.
- Use this for resources not tracked by subscriptions (open connections, timers, etc.).

## package.json Manifest

Key fields that drive the lifecycle:

| Field | Purpose |
|---|---|
| `main` | Entry point JS file (e.g., `./dist/extension.js`) |
| `engines.vscode` | Minimum VS Code version required |
| `activationEvents` | When to activate the extension |
| `contributes` | Static declarations: commands, views, settings, keybindings |

## Lazy Loading

Extensions are **not loaded at startup** by default. They are loaded only when their activation event fires. This keeps VS Code fast — only the extensions relevant to the current task are running.
