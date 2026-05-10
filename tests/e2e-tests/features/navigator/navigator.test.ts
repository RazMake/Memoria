import * as assert from "assert";
import * as vscode from "vscode";
import {
    deleteRecursive,
    getWorkspaceFolder,
    readJsonFile,
    uriExists,
} from "../../helpers";

interface DefaultFilesConfig {
    defaultFiles: Record<string, {
        filesToOpen: string[];
        closeCurrentlyOpenedFilesFirst?: boolean;
        openSideBySide?: boolean;
    }>;
}

suite("Navigator / Default Files (E2E)", () => {
    let workspaceRoot: vscode.Uri;
    let memoriaDir: vscode.Uri;
    let defaultFilesUri: vscode.Uri;
    let workstreamsFolder: vscode.Uri;
    let collectorUri: vscode.Uri;
    const managedFolders = [
        "00-Workstreams",
        "01-ToRemember",
        "02-MeetingNotes",
        "03-Inbox",
        "04-Archive",
        "05-Autocomplete",
        "WorkspaceInitializationBackups",
    ];

    suiteSetup(() => {
        workspaceRoot = getWorkspaceFolder().uri;
        memoriaDir = vscode.Uri.joinPath(workspaceRoot, ".memoria");
        defaultFilesUri = vscode.Uri.joinPath(memoriaDir, "default-files.json");
        workstreamsFolder = vscode.Uri.joinPath(workspaceRoot, "00-Workstreams");
        collectorUri = vscode.Uri.joinPath(workstreamsFolder, "All.todo.md");
    });

    teardown(async () => {
        await vscode.commands.executeCommand("workbench.action.closeAllEditors");
        await deleteRecursive(memoriaDir);
        for (const folder of managedFolders) {
            await deleteRecursive(vscode.Uri.joinPath(workspaceRoot, folder));
        }
    });

    test("creates default-files.json after workspace initialization", async () => {
        await activateExtension();
        await initializeWorkspaceWithBlueprint("individual-contributor");

        await waitFor(async () => {
            assert.strictEqual(
                await uriExists(defaultFilesUri),
                true,
                "default-files.json should be created during initialization.",
            );

            const config = await readJsonFile<DefaultFilesConfig>(defaultFilesUri);
            assert.ok(config, "default-files.json should be valid JSON.");
            assert.ok(config.defaultFiles, "default-files.json should contain a defaultFiles map.");
            assert.ok(
                Object.keys(config.defaultFiles).length > 0,
                "The IC blueprint should define at least one default file entry.",
            );
        });
    });

    test("default-files.json maps the Workstreams folder to All.todo.md", async () => {
        await activateExtension();
        await initializeWorkspaceWithBlueprint("individual-contributor");

        await waitFor(async () => {
            const config = await readJsonFile<DefaultFilesConfig>(defaultFilesUri);
            assert.ok(config, "default-files.json should be readable.");

            const workstreamsEntry = config.defaultFiles["00-Workstreams/"];
            assert.ok(workstreamsEntry, "There should be an entry for the 00-Workstreams/ folder.");
            assert.ok(
                workstreamsEntry.filesToOpen.includes("All.todo.md"),
                "The Workstreams entry should include All.todo.md in filesToOpen.",
            );
        });
    });

    test("openDefaultFile command opens the configured file for the Workstreams folder", async () => {
        await activateExtension();
        await initializeWorkspaceWithBlueprint("individual-contributor");

        // Wait for the collector file to exist (scaffolded during init).
        await waitFor(async () => {
            assert.strictEqual(
                await uriExists(collectorUri),
                true,
                "The collector file should exist before testing openDefaultFile.",
            );
        });

        // Close all editors first to verify the command opens the right file.
        await vscode.commands.executeCommand("workbench.action.closeAllEditors");

        // Execute the openDefaultFile command with the Workstreams folder URI.
        await vscode.commands.executeCommand("memoria.openDefaultFile", workstreamsFolder);

        // Give the editor a moment to open. All.todo.md opens in the custom
        // TodoEditor, so activeTextEditor is undefined — check tabs instead.
        await waitFor(async () => {
            const allTabs = vscode.window.tabGroups.all.flatMap((g) => g.tabs);
            const todoTab = allTabs.find((tab) => {
                const input = tab.input;
                return input instanceof vscode.TabInputCustom && input.uri.path.endsWith("All.todo.md");
            });
            assert.ok(
                todoTab,
                `All.todo.md should be open in a tab, but found: ${allTabs.map((t) => t.label).join(", ")}`,
            );
        });
    });

    test("openDefaultFile is a no-op when invoked without a folder URI", async () => {
        await activateExtension();
        await initializeWorkspaceWithBlueprint("individual-contributor");

        await vscode.commands.executeCommand("workbench.action.closeAllEditors");

        // Execute without arguments — should silently return.
        await vscode.commands.executeCommand("memoria.openDefaultFile");

        // Verify no editor was opened.
        assert.strictEqual(
            vscode.window.activeTextEditor,
            undefined,
            "No editor should be opened when openDefaultFile is called without a folder URI.",
        );
    });
});

async function activateExtension(): Promise<void> {
    const extension = vscode.extensions.getExtension("RazMake.memoria-notebook");
    assert.ok(extension, "The extension should be installed in the test host.");
    await extension.activate();
}

async function initializeWorkspaceWithBlueprint(blueprintId: string): Promise<void> {
    await withQuickPickStub(async () => {
        await vscode.commands.executeCommand("memoria.initializeWorkspace");
    }, (items) => {
        const picked = items.find((item) => item.id === blueprintId) ?? items[0];
        assert.ok(picked, `Blueprint '${blueprintId}' should be available in the picker.`);
        return picked;
    });
}

async function waitFor(assertion: () => Promise<void>, timeoutMs = 5_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    let lastError: unknown = new Error("Condition was not met before the timeout elapsed.");

    while (Date.now() < deadline) {
        try {
            await assertion();
            return;
        } catch (error) {
            lastError = error;
            await new Promise((resolve) => setTimeout(resolve, 50));
        }
    }

    throw lastError;
}

async function withQuickPickStub<T>(
    action: () => Promise<T>,
    pickItem: (items: Array<{ id?: string; label: string }>) => { id?: string; label: string },
): Promise<T> {
    const original = vscode.window.showQuickPick;
    const stub = (async <TItem extends vscode.QuickPickItem>(
        items: readonly TItem[] | Thenable<readonly TItem[]>,
    ): Promise<TItem> => {
        const resolvedItems = await Promise.resolve(items);
        return pickItem([...resolvedItems] as Array<{ id?: string; label: string }>) as TItem;
    }) as unknown as typeof vscode.window.showQuickPick;

    (vscode.window as typeof vscode.window & {
        showQuickPick: typeof vscode.window.showQuickPick;
    }).showQuickPick = stub;

    try {
        return await action();
    } finally {
        (vscode.window as typeof vscode.window & {
            showQuickPick: typeof vscode.window.showQuickPick;
        }).showQuickPick = original;
    }
}
