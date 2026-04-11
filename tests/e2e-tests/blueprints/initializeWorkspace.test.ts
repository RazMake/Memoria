import * as assert from "assert";
import * as vscode from "vscode";
import { getWorkspaceFolder, uriExists, deleteRecursive } from "../helpers";

// Minimal shape of .memoria/blueprint.json — kept local to avoid crossing the rootDir boundary.
interface BlueprintManifest {
    blueprintId: string;
    blueprintVersion: string;
    initializedAt: string;
    lastReinitAt: string | null;
    fileManifest: Record<string, string>;
}
// E2E tests for the Initialize workspace command.
//
// Non-interactive strategy: QuickPick selection logic is fully covered by unit tests.
// These E2E tests verify observable outcomes that unit tests cannot cover:
//   - Command registration in the live Extension Host.
//
// Note: In Phase 2, the blueprint QuickPick is shown for every invocation (before checking
// initialization state), so tests that call executeCommand must be limited to registration
// checks or scenarios where the command returns before or immediately after the QuickPick
// (e.g., QuickPick resolves to undefined without user interaction in the test host).

suite("Initialize workspace command", () => {
    let workspaceRoot: vscode.Uri;
    let memoriaDir: vscode.Uri;

    suiteSetup(() => {
        workspaceRoot = getWorkspaceFolder().uri;
        memoriaDir = vscode.Uri.joinPath(workspaceRoot, ".memoria");
    });

    teardown(async () => {
        // Clean up any .memoria/ folder created during tests so suites are idempotent.
        await deleteRecursive(memoriaDir);
    });

    test("memoria.initializeWorkspace command is registered in the Extension Host", async () => {
        const commands = await vscode.commands.getCommands(true);
        assert.ok(
            commands.includes("memoria.initializeWorkspace"),
            "memoria.initializeWorkspace must be registered"
        );
    });

    test(".memoria/ directory does not exist before any initialization", async () => {
        // Verify the fixture workspace starts clean (no leftover .memoria/ from previous runs).
        // The teardown hook removes .memoria/ after each test, so this should always pass.
        const exists = await uriExists(memoriaDir);
        assert.strictEqual(exists, false, ".memoria/ should not exist in a clean workspace");
    });
});
