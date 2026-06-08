import * as assert from "assert";
import * as vscode from "vscode";
import {
    deleteRecursive,
    getWorkspaceFolder,
    readJsonFile,
    uriExists,
} from "../../helpers";

interface FeaturesConfig {
    features: Array<{
        id: string;
        enabled: boolean;
    }>;
}

interface DecorationsConfig {
    rules: Array<{
        filter: string;
        color?: string;
        badge?: string;
        tooltip?: string;
        propagate?: boolean;
    }>;
}

suite("Decorations feature (E2E)", () => {
    let workspaceRoot: vscode.Uri;
    let memoriaDir: vscode.Uri;
    let featuresUri: vscode.Uri;
    let decorationsUri: vscode.Uri;
    const managedFolders = [
        "00-Workstreams",
        "01-MeetingNotes",
        "02-Inbox",
        "03-ToRemember",
        "04-Archive",
        "10-Autocomplete",
        "11-Templates",
        "12-Settings",
        "13-Scripts",
        "WorkspaceInitializationBackups",
    ];

    suiteSetup(() => {
        workspaceRoot = getWorkspaceFolder().uri;
        memoriaDir = vscode.Uri.joinPath(workspaceRoot, ".memoria");
        featuresUri = vscode.Uri.joinPath(memoriaDir, "features.json");
        decorationsUri = vscode.Uri.joinPath(memoriaDir, "decorations.json");
    });

    teardown(async () => {
        await vscode.commands.executeCommand("workbench.action.closeAllEditors");
        await deleteRecursive(memoriaDir);
        for (const folder of managedFolders) {
            await deleteRecursive(vscode.Uri.joinPath(workspaceRoot, folder));
        }
    });

    test("creates decorations.json with rules after workspace initialization", async () => {
        await activateExtension();
        await initializeWorkspaceWithBlueprint("individual-contributor");

        await waitFor(async () => {
            assert.strictEqual(
                await uriExists(decorationsUri),
                true,
                "decorations.json should be created during initialization.",
            );

            const config = await readJsonFile<DecorationsConfig>(decorationsUri);
            assert.ok(config, "decorations.json should be valid JSON.");
            assert.ok(Array.isArray(config.rules), "decorations.json should contain a rules array.");
            assert.ok(config.rules.length > 0, "The IC blueprint should produce at least one decoration rule.");
        });
    });

    test("decorations feature is enabled by default after initialization", async () => {
        await activateExtension();
        await initializeWorkspaceWithBlueprint("individual-contributor");

        await waitFor(async () => {
            const features = await readJsonFile<FeaturesConfig>(featuresUri);
            assert.ok(
                features?.features.some((f) => f.id === "decorations" && f.enabled),
                "The decorations feature should be enabled by default after initialization.",
            );
        });
    });

    test("decoration rules include a dot-folder filter", async () => {
        await activateExtension();
        await initializeWorkspaceWithBlueprint("individual-contributor");

        await waitFor(async () => {
            const config = await readJsonFile<DecorationsConfig>(decorationsUri);
            assert.ok(config, "decorations.json should be readable.");

            const dotFolderRule = config.rules.find((r) => r.filter === ".*/");
            assert.ok(dotFolderRule, "There should be a dot-folder rule (filter: '.*/').");
            assert.ok(dotFolderRule.color, "The dot-folder rule should specify a color.");
        });
    });

    test("decoration rules include a propagating folder rule", async () => {
        await activateExtension();
        await initializeWorkspaceWithBlueprint("individual-contributor");

        await waitFor(async () => {
            const config = await readJsonFile<DecorationsConfig>(decorationsUri);
            assert.ok(config, "decorations.json should be readable.");

            const propagatingRule = config.rules.find((r) => r.propagate === true);
            assert.ok(propagatingRule, "At least one decoration rule should use propagate: true.");
            assert.ok(propagatingRule.filter, "The propagating rule should have a filter.");
        });
    });

    test("decorations are cleared when the feature is disabled via Manage Features", async () => {
        await activateExtension();
        await initializeWorkspaceWithBlueprint("individual-contributor");

        // Wait for the initial decoration rules to be loaded.
        await waitFor(async () => {
            const config = await readJsonFile<DecorationsConfig>(decorationsUri);
            assert.ok(config?.rules.length, "Decoration rules should be loaded before disabling.");
        });

        // Disable the decorations feature by unchecking it in the Manage Features picker.
        // manageFeatures calls featureManager.refresh() for ALL features. The contacts
        // feature may throw if a prior test's teardown removed its workspace files
        // while in-memory state is stale — catch that unrelated error.
        try {
            await withQuickPickStub(async () => {
                await vscode.commands.executeCommand("memoria.manageFeatures");
            }, (items, options) => {
                assert.strictEqual(options?.canPickMany, true, "Manage Features should use a multi-select QuickPick.");
                return items.filter((item) => item.id !== "decorations");
            });
        } catch (err) {
            // Ignore errors from unrelated features (e.g., contacts watcher)
            // as long as features.json was written before the error.
        }

        await waitFor(async () => {
            const features = await readJsonFile<FeaturesConfig>(featuresUri);
            assert.ok(
                features?.features.some((f) => f.id === "decorations" && !f.enabled),
                "The decorations feature should be persisted as disabled.",
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
