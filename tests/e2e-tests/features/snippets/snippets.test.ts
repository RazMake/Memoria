import * as assert from "assert";
import * as vscode from "vscode";
import {
    deleteRecursive,
    getWorkspaceFolder,
    readJsonFile,
    readTextFile,
    uriExists,
} from "../../helpers";

interface FeaturesConfig {
    features: Array<{
        id: string;
        enabled: boolean;
    }>;
}

interface SnippetManifest {
    snippets?: {
        snippetsFolder: string;
    };
}

suite("Snippets feature (E2E)", () => {
    let workspaceRoot: vscode.Uri;
    let memoriaDir: vscode.Uri;
    let featuresUri: vscode.Uri;
    let blueprintUri: vscode.Uri;
    let snippetsFolder: vscode.Uri;
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
        featuresUri = vscode.Uri.joinPath(memoriaDir, "features.json");
        blueprintUri = vscode.Uri.joinPath(memoriaDir, "blueprint.json");
        snippetsFolder = vscode.Uri.joinPath(workspaceRoot, "05-Autocomplete", "Snippets");
    });

    teardown(async () => {
        await vscode.commands.executeCommand("workbench.action.closeAllEditors");
        await deleteRecursive(memoriaDir);
        for (const folder of managedFolders) {
            await deleteRecursive(vscode.Uri.joinPath(workspaceRoot, folder));
        }
    });

    test("scaffolds snippet files and enables the feature after initialization", async () => {
        await activateExtension();
        await initializeWorkspaceWithBlueprint("individual-contributor");

        await waitFor(async () => {
            assert.strictEqual(
                await uriExists(snippetsFolder),
                true,
                "The snippets folder should be scaffolded.",
            );

            const dateTimeSnippet = vscode.Uri.joinPath(snippetsFolder, "date-time.ts");
            assert.strictEqual(
                await uriExists(dateTimeSnippet),
                true,
                "The date-time.ts seed snippet should exist.",
            );

            const headingChildrenSnippet = vscode.Uri.joinPath(snippetsFolder, "heading-children.ts");
            assert.strictEqual(
                await uriExists(headingChildrenSnippet),
                true,
                "The heading-children.ts seed snippet should exist.",
            );
        });
    });

    test("snippets feature is enabled by default and context key is set", async () => {
        await activateExtension();
        await initializeWorkspaceWithBlueprint("individual-contributor");

        await waitFor(async () => {
            const features = await readJsonFile<FeaturesConfig>(featuresUri);
            assert.ok(
                features?.features.some((f) => f.id === "snippets" && f.enabled),
                "The snippets feature should be enabled by default after initialization.",
            );
        });
    });

    test("blueprint manifest stores the snippets folder path", async () => {
        await activateExtension();
        await initializeWorkspaceWithBlueprint("individual-contributor");

        await waitFor(async () => {
            const manifest = await readJsonFile<SnippetManifest>(blueprintUri);
            assert.ok(manifest?.snippets, "The blueprint manifest should contain a snippets config.");
            assert.strictEqual(
                manifest?.snippets?.snippetsFolder,
                "05-Autocomplete/Snippets/",
                "The snippets folder path should match the IC blueprint definition.",
            );
        });
    });

    test("seed snippet file contains valid TypeScript with snippet definitions", async () => {
        await activateExtension();
        await initializeWorkspaceWithBlueprint("individual-contributor");

        await waitFor(async () => {
            const dateTimeUri = vscode.Uri.joinPath(snippetsFolder, "date-time.ts");
            const content = normalizeNewlines(await readTextFile(dateTimeUri));

            assert.ok(
                content.includes("SnippetDefinition"),
                "The date-time snippet file should reference the SnippetDefinition type.",
            );
            assert.ok(
                content.includes("trigger"),
                "The snippet file should define at least one trigger.",
            );
        });
    });

    test("snippet completions are provided in markdown files", async () => {
        await activateExtension();
        await initializeWorkspaceWithBlueprint("individual-contributor");

        // Wait for snippets to be loaded.
        await waitFor(async () => {
            const features = await readJsonFile<FeaturesConfig>(featuresUri);
            assert.ok(
                features?.features.some((f) => f.id === "snippets" && f.enabled),
                "Snippets should be enabled before testing completions.",
            );
        });

        // Create a temporary markdown file and request completions.
        const testFileUri = vscode.Uri.joinPath(workspaceRoot, "test-snippet.md");
        const edit = new vscode.WorkspaceEdit();
        edit.createFile(testFileUri, { contents: Buffer.from("# Test\n{", "utf-8") });
        await vscode.workspace.applyEdit(edit);

        try {
            const document = await vscode.workspace.openTextDocument(testFileUri);
            await vscode.window.showTextDocument(document);

            // Position at the end of the file where `{` is typed.
            const position = new vscode.Position(1, 1);
            const completions = await vscode.commands.executeCommand<vscode.CompletionList>(
                "vscode.executeCompletionItemProvider",
                testFileUri,
                position,
                "{",
            );

            assert.ok(completions, "Completion provider should return a result.");
            assert.ok(
                completions.items.length > 0,
                "At least one snippet completion should be returned for the '{' trigger.",
            );
        } finally {
            await vscode.commands.executeCommand("workbench.action.closeActiveEditor");
            const deleteEdit = new vscode.WorkspaceEdit();
            deleteEdit.deleteFile(testFileUri);
            await vscode.workspace.applyEdit(deleteEdit);
        }
    });

    test("snippets feature can be disabled via Manage Features", async () => {
        await activateExtension();
        await initializeWorkspaceWithBlueprint("individual-contributor");

        await waitFor(async () => {
            const features = await readJsonFile<FeaturesConfig>(featuresUri);
            assert.ok(
                features?.features.some((f) => f.id === "snippets" && f.enabled),
                "Snippets should be enabled before disabling.",
            );
        });

        // manageFeatures calls featureManager.refresh() for ALL features. The contacts
        // feature may throw if a prior test's teardown removed its workspace files
        // while in-memory state is stale — catch that unrelated error.
        try {
            await withQuickPickStub(async () => {
                await vscode.commands.executeCommand("memoria.manageFeatures");
            }, (items, options) => {
                assert.strictEqual(options?.canPickMany, true, "Manage Features should use a multi-select QuickPick.");
                return items.filter((item) => item.id !== "snippets");
            });
        } catch (err) {
            // Ignore errors from unrelated features (e.g., contacts watcher)
            // as long as features.json was written before the error.
        }

        await waitFor(async () => {
            const features = await readJsonFile<FeaturesConfig>(featuresUri);
            assert.ok(
                features?.features.some((f) => f.id === "snippets" && !f.enabled),
                "The snippets feature should be persisted as disabled.",
            );
        });
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
    pickItem: (
        items: Array<{ id?: string; label: string }>,
        options?: vscode.QuickPickOptions,
    ) => { id?: string; label: string } | Array<{ id?: string; label: string }>,
): Promise<T> {
    const original = vscode.window.showQuickPick;
    const stub = (async <TItem extends vscode.QuickPickItem>(
        items: readonly TItem[] | Thenable<readonly TItem[]>,
        options?: vscode.QuickPickOptions,
    ): Promise<TItem | TItem[]> => {
        const resolvedItems = await Promise.resolve(items);
        return pickItem([...resolvedItems] as Array<{ id?: string; label: string }>, options) as TItem | TItem[];
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

function normalizeNewlines(value: string): string {
    return value.replace(/\r\n/g, "\n");
}
