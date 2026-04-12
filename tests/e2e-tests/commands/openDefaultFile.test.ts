import * as assert from "assert";
import * as vscode from "vscode";
import {
    getWorkspaceFolder,
    writeTextFile,
    writeJsonFile,
    deleteRecursive,
} from "../helpers";

// E2E tests for the "Memoria: Open default file(s)" command.
//
// Strategy: programmatically create three non-empty files and a .memoria/blueprint.json
// manifest that maps a folder to those files. Then execute the command with the folder
// URI and verify that exactly three editors are open side by side and that
// previously opened editors are closed.

suite("Open default file(s) command (E2E)", () => {
    let workspaceRoot: vscode.Uri;
    let memoriaDir: vscode.Uri;
    let testFolder: vscode.Uri;
    const fileNames = ["Alpha.md", "Beta.md", "Gamma.md"];

    suiteSetup(() => {
        workspaceRoot = getWorkspaceFolder().uri;
        memoriaDir = vscode.Uri.joinPath(workspaceRoot, ".memoria");
        testFolder = vscode.Uri.joinPath(workspaceRoot, "TestDefaults");
    });

    teardown(async () => {
        await vscode.commands.executeCommand("workbench.action.closeAllEditors");
        await deleteRecursive(memoriaDir);
        await deleteRecursive(testFolder);
    });

    test("opens three non-empty files side by side and closes pre-existing editors", async () => {
        // 1. Create a folder with three non-empty files.
        const fileRelPaths = fileNames.map((n) => `TestDefaults/${n}`);
        for (const relPath of fileRelPaths) {
            const uri = vscode.Uri.joinPath(workspaceRoot, relPath);
            await writeTextFile(uri, `Content of ${relPath}\n`);
        }

        // 2. Write a .memoria/blueprint.json manifest and a separate
        //    .memoria/default-files.json that maps the folder to the three files.
        const manifest = {
            blueprintId: "e2e-test",
            blueprintVersion: "1.0.0",
            initializedAt: new Date().toISOString(),
            lastReinitAt: null,
            fileManifest: {},
        };
        await writeJsonFile(
            vscode.Uri.joinPath(memoriaDir, "blueprint.json"),
            manifest
        );
        await writeJsonFile(
            vscode.Uri.joinPath(memoriaDir, "default-files.json"),
            {
                defaultFiles: {
                    "TestDefaults/": fileNames,
                },
            }
        );

        // 3. Open a dummy file so we can verify it gets closed by the command.
        const dummyUri = vscode.Uri.joinPath(workspaceRoot, ".gitkeep");
        const dummyDoc = await vscode.workspace.openTextDocument(dummyUri);
        await vscode.window.showTextDocument(dummyDoc, {
            viewColumn: vscode.ViewColumn.One,
            preview: false,
        });
        // Sanity-check: at least one editor is visible.
        assert.ok(
            vscode.window.visibleTextEditors.length >= 1,
            "Expected at least one editor open before running the command"
        );

        // 4. Execute the open default file command with the folder URI.
        await vscode.commands.executeCommand(
            "memoria.openDefaultFile",
            testFolder
        );

        // 5. Verify exactly three editors are visible.
        const editors = vscode.window.visibleTextEditors;
        assert.strictEqual(
            editors.length,
            3,
            `Expected 3 visible editors, got ${editors.length}: ${editors.map((e) => e.document.uri.path).join(", ")}`
        );

        // 6. Verify the dummy .gitkeep file is no longer among visible editors
        //    (it was closed by the command).
        const openPaths = editors.map((e) => e.document.uri.path);
        const gitkeepStillOpen = openPaths.some((p) => p.endsWith(".gitkeep"));
        assert.strictEqual(
            gitkeepStillOpen,
            false,
            "Pre-existing .gitkeep editor should have been closed"
        );

        // 7. Verify each opened file matches the expected names and is non-empty.
        for (const name of fileNames) {
            const editor = editors.find((e) => e.document.uri.path.endsWith(name));
            assert.ok(editor, `Editor for ${name} should be open`);
            assert.ok(
                editor!.document.getText().length > 0,
                `${name} should not be empty`
            );
        }

        // 8. Verify editors are in separate view columns (side by side).
        const columns = editors.map((e) => e.viewColumn);
        const uniqueColumns = new Set(columns);
        assert.strictEqual(
            uniqueColumns.size,
            3,
            `Expected 3 distinct view columns, got ${uniqueColumns.size}: [${columns.join(", ")}]`
        );
    });
});
