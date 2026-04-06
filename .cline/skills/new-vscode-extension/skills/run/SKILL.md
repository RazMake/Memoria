---
name: run
description: How to run and debug the VS Code extension in an Extension Development Host.
---

# Run / Debug

Launches the extension in a VS Code Extension Development Host for manual testing and debugging.

## Prerequisites

Build the extension first:

```bash
cd src
npm run build
```

## Launch from VS Code

1. Open the project root in VS Code.
2. Press **F5** (or Run → Start Debugging).
3. Select the **"Run Extension"** launch configuration if prompted.

This:
- Runs the **npm: build** task automatically (pre-launch).
- Opens a new VS Code window (Extension Development Host) with the extension loaded.
- Attaches the debugger — breakpoints in `src/*.ts` files work via source maps.

## Launch Configuration

The **"Run Extension"** config in `.vscode/launch.json`:

- **type**: `extensionHost`
- **args**: `--extensionDevelopmentPath=${workspaceFolder}/src`
- **preLaunchTask**: `npm: build`
- **outFiles**: `${workspaceFolder}/src/dist/**/*.js`

## Debugging Tips

- Set breakpoints in any `.ts` file under `src/`.
- Use the Debug Console to evaluate expressions.
- Reload the Extension Development Host (Ctrl+R in that window) to pick up changes after rebuilding.
