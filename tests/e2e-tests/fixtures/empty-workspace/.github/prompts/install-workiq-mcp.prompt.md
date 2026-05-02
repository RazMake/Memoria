---
description: "Install the WorkIQ MCP server at workspace level. Use when setting up a new workspace or when the WorkIQ MCP server is missing."
name: "Install WorkIQ MCP Server"
agent: "agent"
tools: [vscode, execute, read, agent, edit, 'workiq/*']
---

Install the WorkIQ MCP server at workspace level by following these idempotent steps exactly.

## Step 1 — Verify Node.js is available

Run `node --version` and `npx --version`. If either command fails, stop and notify the user that Node.js (LTS) must be installed from https://nodejs.org before continuing.

## Step 2 — Ensure `.vscode/` directory exists

Create the `.vscode/` directory at the workspace root if it does not already exist.

## Step 3 — Update `.vscode/mcp.json`

Check whether `.vscode/mcp.json` exists:

- **If it does NOT exist**, create it with the following content:
  ```json
  {
    "inputs": [],
    "servers": {
      "workiq": {
        "type": "stdio",
        "command": "npx",
        "args": ["-y", "@microsoft/workiq", "mcp"],
        "tools": ["*"]
      }
    }
  }
  ```

- **If it DOES exist**, check whether a `"workiq"` key already exists under `"servers"`:
  - If it already exists, skip to Step 4 — no changes needed.
  - If it does NOT exist, add the following entry inside `"servers"`, preserving valid JSON (correct commas between sibling entries):
    ```json
    "workiq": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@microsoft/workiq", "mcp"],
      "tools": ["*"]
    }
    ```

## Step 4 — Validate the JSON

Run the following command to confirm the file is valid JSON:
```
node -e "JSON.parse(require('fs').readFileSync('.vscode/mcp.json','utf8')); console.log('valid')"
```
If it fails, inspect the file for missing or extra commas/brackets and fix them, then re-validate.

## Step 5 — Verify the server is working

Use the **run_vscode_command** tool to execute `mcp.restartServer` with argument `"workiq"`, which reloads the server without requiring manual user action.

Then call a WorkIQ tool directly as a smoke test — ask it for the current user's name or alias (e.g. "Who am I?"). 

- If the call **succeeds**, the server is confirmed working. Report the result to the user along with whether the config was freshly installed or already present.
- If the call **fails or times out**, attempt to debug the problem and fix it. Common issues might include:
  - Network problems preventing `npx` from fetching the package.
  - Permission issues with the `.vscode/` directory or `mcp.json` file.
  - Problems with the MCP server startup (check for error messages in the output).
- If Node.js was missing, report that installation is blocked and no verification was attempted.
