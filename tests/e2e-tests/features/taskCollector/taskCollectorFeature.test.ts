import * as assert from "assert";
import * as vscode from "vscode";
import {
    deleteRecursive,
    getWorkspaceFolder,
    readJsonFile,
    readTextFile,
    uriExists,
    writeTextFile,
} from "../../helpers";

interface FeaturesConfig {
    features: Array<{
        id: string;
        enabled: boolean;
    }>;
}

interface StoredTaskIndex {
    collectorPath: string;
    tasks: Record<string, unknown>;
}

suite("TaskCollectorFeature (E2E)", () => {
    let workspaceRoot: vscode.Uri;
    let memoriaDir: vscode.Uri;
    let collectorUri: vscode.Uri;
    let featuresUri: vscode.Uri;
    let configUri: vscode.Uri;
    let indexUri: vscode.Uri;
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
        collectorUri = vscode.Uri.joinPath(workspaceRoot, "00-Workstreams", "All.todo.md");
        featuresUri = vscode.Uri.joinPath(memoriaDir, "features.json");
        configUri = vscode.Uri.joinPath(memoriaDir, "task-collector.json");
        indexUri = vscode.Uri.joinPath(memoriaDir, "tasks-index.json");
    });

    teardown(async () => {
        await vscode.commands.executeCommand("workbench.action.closeAllEditors");
        await deleteRecursive(memoriaDir);
        for (const folder of managedFolders) {
            await deleteRecursive(vscode.Uri.joinPath(workspaceRoot, folder));
        }
    });

    test("creates the collector config, enables the feature by default, and writes the task index after initialization", async () => {
        await activateExtension();
        await initializeWorkspaceWithBlueprint("individual-contributor");

        await waitFor(async () => {
            assert.strictEqual(await uriExists(collectorUri), true, "Collector file should be created");

            const features = await readJsonFile<FeaturesConfig>(featuresUri);
            assert.ok(
                features?.features.some((feature) => feature.id === "taskCollector" && feature.enabled),
                "Task collector should be enabled by default"
            );

            const config = await readJsonFile<Record<string, unknown>>(configUri);
            assert.ok(config, "Task collector config should be written during initialization");

            const index = await readJsonFile<StoredTaskIndex>(indexUri);
            assert.ok(index, "Task index should be written");
            assert.strictEqual(index?.collectorPath, "00-Workstreams/All.todo.md", "Index should store the collector path");
            // The seed All.todo.md contains one sample task. After bootstrap sync the
            // collector may contain additional collector-owned entries depending on timing.
            assert.ok(Object.keys(index?.tasks ?? {}).length >= 1, "Fresh initialization should have at least the seed task in the index");
        });
    });

    test("writes the default collector skeleton to the blueprint-owned collector path", async () => {
        await activateExtension();
        await initializeWorkspaceWithBlueprint("individual-contributor");

        await waitFor(async () => {
            const collector = normalizeNewlines(await readTextFile(collectorUri));
            // The seed file contains the sample task from the blueprint.
            assert.ok(
                collector.includes("# To do") && collector.includes("# Completed"),
                "Collector should contain the expected section headings after startup sync",
            );
        });
    });

    test("pulls source tasks into the collector when memoria.syncTasks is executed", async () => {
        await activateExtension();
        await initializeWorkspaceWithBlueprint("individual-contributor");
        await waitForTaskCollectorReady();

        const sourceUri = vscode.Uri.joinPath(workspaceRoot, "03-Inbox", "notes.md");
        await writeTextFile(sourceUri, "");
        await saveDocumentWithContent(sourceUri, "- [ ] Buy milk\n");

        await vscode.commands.executeCommand("memoria.syncTasks");

        await waitFor(async () => {
            const collector = normalizeNewlines(await readTextFile(collectorUri));
            assert.ok(collector.includes("- [ ] Buy milk"), "Source task should appear in collector after sync");
        });

        const index = await readJsonFile<StoredTaskIndex>(indexUri);
        assert.ok(Object.keys(index?.tasks ?? {}).length >= 1, "Task index should contain at least the source task");
    });

    test("updates the collector when a source task is edited and saved via the editor", async () => {
        await activateExtension();
        await initializeWorkspaceWithBlueprint("individual-contributor");
        await waitForTaskCollectorReady();

        const sourceUri = vscode.Uri.joinPath(workspaceRoot, "03-Inbox", "notes.md");
        await writeTextFile(sourceUri, "");
        await saveDocumentWithContent(sourceUri, "- [ ] Buy milk\n");
        await vscode.commands.executeCommand("memoria.syncTasks");
        await waitFor(async () => {
            const collector = normalizeNewlines(await readTextFile(collectorUri));
            assert.ok(collector.includes("- [ ] Buy milk"), "Initial task should be in collector");
        });

        // Revert the source document model so its mtime matches disk — syncTasks may
        // have written back to the source (e.g. subtask completion), leaving the model stale.
        await vscode.commands.executeCommand("vscode.open", sourceUri);
        await vscode.commands.executeCommand("workbench.action.files.revert");

        await saveDocumentWithContent(sourceUri, "- [ ] Buy oat milk\n");

        await waitFor(async () => {
            const collector = normalizeNewlines(await readTextFile(collectorUri));
            assert.ok(collector.includes("- [ ] Buy oat milk"), "Edited task should appear in collector after save-triggered sync");
            assert.ok(!collector.includes("- [ ] Buy milk\n"), "Old task text should no longer appear in collector");
        });
    });

    test("moves an unchecked task from # Completed back to # To do and updates the source", async () => {
        await activateExtension();
        await initializeWorkspaceWithBlueprint("individual-contributor");
        await waitForTaskCollectorReady();

        // Create a checked task in a source file and sync it into the collector
        const sourceUri = vscode.Uri.joinPath(workspaceRoot, "03-Inbox", "done.md");
        await writeTextFile(sourceUri, "");
        await saveDocumentWithContent(sourceUri, "- [x] Finished task\n");
        await vscode.commands.executeCommand("memoria.syncTasks");

        await waitFor(async () => {
            const collector = normalizeNewlines(await readTextFile(collectorUri));
            assert.ok(
                collector.includes("[x] Finished task"),
                `Completed task should be in collector. Content: ${JSON.stringify(collector)}`,
            );
        });

        // Uncheck the task in the collector's # Completed section
        const collectorBefore = normalizeNewlines(await readTextFile(collectorUri));
        const unchecked = collectorBefore.replace("[x] Finished task", "[ ] Finished task");
        assert.notStrictEqual(unchecked, collectorBefore, "Replacement should change the content");
        await saveDocumentWithContent(collectorUri, unchecked);

        await waitFor(async () => {
            const collector = normalizeNewlines(await readTextFile(collectorUri));
            const activeSection = collector.split(/^# Completed$/m)[0];
            assert.ok(activeSection.includes("- [ ] Finished task"), "Unchecked task should move to # To do section");
        });

        const sourceContent = normalizeNewlines(await readTextFile(sourceUri));
        assert.ok(sourceContent.includes("- [ ] Finished task"), "Source file should reflect the unchecked state");
    });

    test("keeps the collector and task index intact when memoria.syncTasks runs on an empty initialized workspace", async () => {
        await activateExtension();
        await initializeWorkspaceWithBlueprint("individual-contributor");
        await waitForTaskCollectorReady();

        await vscode.commands.executeCommand("memoria.syncTasks");

        const collector = normalizeNewlines(await readTextFile(collectorUri));
        // Collector should contain both headings and remain well-formed.
        assert.ok(collector.includes("# To do"), "Collector should have To do section");
        assert.ok(collector.includes("# Completed"), "Collector should have Completed section");
        const index = await readJsonFile<StoredTaskIndex>(indexUri);
        assert.ok(index, "Task index should still exist after an explicit sync");
    });
});

async function activateExtension(): Promise<void> {
    const extension = vscode.extensions.getExtension("RazMake.memoria");
    assert.ok(extension, "Extension should be installed");
    await extension.activate();
}

async function initializeWorkspaceWithBlueprint(blueprintId: string): Promise<void> {
    await withQuickPickStub(async () => {
        await vscode.commands.executeCommand("memoria.initializeWorkspace");
    }, (items) => {
        const picked = items.find((item) => item.id === blueprintId) ?? items[0];
        assert.ok(picked, `Blueprint '${blueprintId}' should be available in the picker`);
        return picked;
    });
}

async function waitForTaskCollectorReady(): Promise<void> {
    const workspaceRoot = getWorkspaceFolder().uri;
    const indexUri = vscode.Uri.joinPath(workspaceRoot, ".memoria", "tasks-index.json");

    await waitFor(async () => {
        const index = await readJsonFile<StoredTaskIndex>(indexUri);
        assert.ok(index, "Task collector should bootstrap its index before source edits are made");
    });

    // Revert the collector model so its mtime matches disk — the startup sync writes
    // the collector via TaskWriter which can leave the document model stale.
    const collectorUri = vscode.Uri.joinPath(workspaceRoot, "00-Workstreams", "All.todo.md");
    try {
        await vscode.workspace.openTextDocument(collectorUri);
        await vscode.commands.executeCommand("vscode.open", collectorUri);
        await vscode.commands.executeCommand("workbench.action.files.revert");
        await vscode.commands.executeCommand("workbench.action.closeActiveEditor");
    } catch {
        // Collector may not exist yet in some tests — safe to ignore.
    }
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

function normalizeNewlines(value: string): string {
    return value.replace(/\r\n/g, "\n");
}

async function saveDocumentWithContent(uri: vscode.Uri, content: string): Promise<void> {
    const document = await vscode.workspace.openTextDocument(uri);
    const editor = await vscode.window.showTextDocument(document);
    await editor.edit((editBuilder) => {
        const fullRange = new vscode.Range(
            document.positionAt(0),
            document.positionAt(document.getText().length),
        );
        editBuilder.replace(fullRange, content);
    });
    await document.save();
}
