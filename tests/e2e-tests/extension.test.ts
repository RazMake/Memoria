import * as assert from "assert";
import * as vscode from "vscode";

// E2E tests run inside a real Extension Host — use the real vscode API, not mocks.
suite("Extension Lifecycle", () => {
    test("extension is present", () => {
        const ext = vscode.extensions.getExtension("TODO_PUBLISHER_ID.memoria");
        assert.ok(ext, "Extension should be installed");
    });

    test("extension activates", async () => {
        const ext = vscode.extensions.getExtension("TODO_PUBLISHER_ID.memoria");
        assert.ok(ext, "Extension should be installed");
        await ext.activate();
        assert.strictEqual(ext.isActive, true, "Extension should be active after activation");
    });

    test("commands are registered", async () => {
        const commands = await vscode.commands.getCommands(true);
        assert.ok(commands.includes("memoria.initializeWorkspace"), "memoria.initializeWorkspace should be registered");
    });
});
