import * as assert from "assert";
import * as vscode from "vscode";
import { getWorkspaceFolder, uriExists, writeJsonFile, readJsonFile, deleteRecursive } from "../helpers";

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
//   - The "already initialized" guard (pre-writing .memoria/blueprint.json) completes
//     without driving the QuickPick UI.
//
// Full init flow (scaffold → manifest → decorations) is verifiable here because:
// the already-initialized guard path lets executeCommand return quickly without a QuickPick.

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

    test("command returns without error when workspace is already initialized", async () => {
        // Arrange — pre-write a .memoria/blueprint.json so the command sees an initialized workspace
        // and takes the early-return path before showing any QuickPick.
        const manifestUri = vscode.Uri.joinPath(memoriaDir, "blueprint.json");
        const existingManifest: BlueprintManifest = {
            blueprintId: "individual-contributor",
            blueprintVersion: "1.0.0",
            initializedAt: new Date().toISOString(),
            lastReinitAt: null,
            fileManifest: {},
        };
        await writeJsonFile(manifestUri, existingManifest);

        // Act — executing the command should return quickly (no QuickPick shown) without throwing.
        await vscode.commands.executeCommand("memoria.initializeWorkspace");

        // Assert — the pre-written manifest is preserved (command did not overwrite it).
        const manifest = await readJsonFile<BlueprintManifest>(manifestUri);
        assert.ok(manifest, "blueprint.json should still exist after already-initialized command run");
        assert.strictEqual(manifest.blueprintId, "individual-contributor", "blueprint name should be unchanged");
    });

    test(".memoria/ directory does not exist before any initialization", async () => {
        // Verify the fixture workspace starts clean (no leftover .memoria/ from previous runs).
        // The teardown hook removes .memoria/ after each test, so this should always pass.
        const exists = await uriExists(memoriaDir);
        assert.strictEqual(exists, false, ".memoria/ should not exist in a clean workspace");
    });
});
