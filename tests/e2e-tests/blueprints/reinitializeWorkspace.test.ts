import * as assert from "assert";
import * as vscode from "vscode";
import { getWorkspaceFolder, uriExists, deleteRecursive } from "../helpers";

// E2E tests for workspace re-initialization.
//
// Non-interactive strategy: The reinit command shows a blueprint QuickPick before checking
// initialization state, so its full flow cannot be driven programmatically in E2E.
// Unit tests cover reinit orchestration through BlueprintEngine and conflict resolution.
// These E2E tests verify:
//   - The new Phase 2 commands are registered in the Extension Host.
//   - The workspace fixture is clean before each test.

suite("Re-initialize workspace (E2E)", () => {
    let memoriaDir: vscode.Uri;

    suiteSetup(() => {
        const workspaceRoot = getWorkspaceFolder().uri;
        memoriaDir = vscode.Uri.joinPath(workspaceRoot, ".memoria");
    });

    teardown(async () => {
        await deleteRecursive(memoriaDir);
    });

    test("memoria.toggleDotFolders command is registered in the Extension Host", async () => {
        const commands = await vscode.commands.getCommands(true);
        assert.ok(
            commands.includes("memoria.toggleDotFolders"),
            "memoria.toggleDotFolders must be registered"
        );
    });

    test(".memoria/ directory does not exist in a clean workspace before any command is run", async () => {
        const exists = await uriExists(memoriaDir);
        assert.strictEqual(exists, false, ".memoria/ should not exist in a clean workspace");
    });
});

