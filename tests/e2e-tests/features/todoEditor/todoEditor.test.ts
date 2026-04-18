import * as assert from "assert";
import * as vscode from "vscode";
import {
    deleteRecursive,
    getWorkspaceFolder,
    readJsonFile,
    readTextFile,
    uriExists,
    writeJsonFile,
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

suite("TodoEditor (E2E)", () => {
    let workspaceRoot: vscode.Uri;
    let memoriaDir: vscode.Uri;
    let featuresUri: vscode.Uri;
    let configUri: vscode.Uri;
    let indexUri: vscode.Uri;
    let collectorUri: vscode.Uri;
    const managedFolders = [
        "00-Tasks",
        "00-Workstreams",
        "01-ToRemember",
        "02-MeetingNotes",
        "03-Inbox",
        "04-Archive",
        "WorkspaceInitializationBackups",
    ];

    suiteSetup(() => {
        workspaceRoot = getWorkspaceFolder().uri;
        memoriaDir = vscode.Uri.joinPath(workspaceRoot, ".memoria");
        featuresUri = vscode.Uri.joinPath(memoriaDir, "features.json");
        configUri = vscode.Uri.joinPath(memoriaDir, "task-collector.json");
        indexUri = vscode.Uri.joinPath(memoriaDir, "tasks-index.json");
        collectorUri = vscode.Uri.joinPath(workspaceRoot, "00-Tasks", "All-Tasks.md");
    });

    teardown(async () => {
        await vscode.commands.executeCommand("workbench.action.closeAllEditors");
        await deleteRecursive(memoriaDir);
        for (const folder of managedFolders) {
            await deleteRecursive(vscode.Uri.joinPath(workspaceRoot, folder));
        }
    });

    test("feature gate — enabled: *.todo.md opens in the custom editor", async () => {
        await activateExtension();
        await initializeWorkspaceWithBlueprint("individual-contributor");
        await waitForTaskCollectorReady();

        // Write a minimal .todo.md file
        const todoUri = vscode.Uri.joinPath(workspaceRoot, "00-Tasks", "All-Tasks.todo.md");
        await writeTextFile(todoUri, "# To do\n\n- [ ] Sample task\n\n# Completed\n");

        await vscode.commands.executeCommand("vscode.open", todoUri);

        await waitFor(async () => {
            const tab = findActiveTab();
            assert.ok(tab, "A tab should be open");
            assert.ok(
                tab.input instanceof vscode.TabInputCustom,
                `Expected a custom editor tab but got ${tab.input?.constructor?.name}`,
            );
            assert.strictEqual(
                (tab.input as vscode.TabInputCustom).viewType,
                "memoria.todoEditor",
                "The custom editor should use the memoria.todoEditor viewType",
            );
        });
    });

    test("feature gate — disabled: *.todo.md still opens in the custom editor", async () => {
        await activateExtension();
        await initializeWorkspaceWithBlueprint("individual-contributor");
        await waitForTaskCollectorReady();

        // Disable taskCollector in features.json
        const features = await readJsonFile<FeaturesConfig>(featuresUri);
        assert.ok(features, "features.json should exist after initialization");
        const updated: FeaturesConfig = {
            features: features.features.map((f) =>
                f.id === "taskCollector" ? { ...f, enabled: false } : f,
            ),
        };
        await writeJsonFile(featuresUri, updated);

        // Trigger feature refresh
        await vscode.commands.executeCommand("memoria.manageFeatures");

        // Small delay for the feature callback to finish
        await delay(500);

        const todoUri = vscode.Uri.joinPath(workspaceRoot, "00-Tasks", "All-Tasks.todo.md");
        await writeTextFile(todoUri, "# To do\n\n- [ ] Sample task\n\n# Completed\n");

        await vscode.commands.executeCommand("vscode.open", todoUri);

        // The custom editor is registered eagerly — it stays available even when
        // the taskCollector background sync feature is disabled.
        await waitFor(async () => {
            const tab = findActiveTab();
            assert.ok(tab, "A tab should be open");
            assert.ok(
                tab.input instanceof vscode.TabInputCustom,
                "The custom editor should still open when taskCollector is disabled (editor is always registered)",
            );
            assert.strictEqual(
                (tab.input as vscode.TabInputCustom).viewType,
                "memoria.todoEditor",
                "The custom editor should use the memoria.todoEditor viewType",
            );
        });
    });

    test("external edit reconciliation: WorkspaceEdit appends a task without error", async () => {
        await activateExtension();
        await initializeWorkspaceWithBlueprint("individual-contributor");
        await waitForTaskCollectorReady();

        const todoUri = vscode.Uri.joinPath(workspaceRoot, "00-Tasks", "All-Tasks.todo.md");
        await writeTextFile(todoUri, "# To do\n\n- [ ] Existing task\n\n# Completed\n");

        await vscode.commands.executeCommand("vscode.open", todoUri);
        await waitFor(async () => {
            const tab = findActiveTab();
            assert.ok(tab, "A tab should be open for the todo file");
        });

        // Apply an external WorkspaceEdit that appends a new task
        const edit = new vscode.WorkspaceEdit();
        const currentContent = await readTextFile(todoUri);
        const insertPosition = normalizeNewlines(currentContent).indexOf("# Completed");
        assert.ok(insertPosition > -1, "Should find the # Completed header");

        // We need to open the text document to get proper positions
        const doc = await vscode.workspace.openTextDocument(todoUri);
        const completedPos = doc.positionAt(insertPosition);
        edit.insert(todoUri, completedPos, "- [ ] Appended task\n\n");
        const applied = await vscode.workspace.applyEdit(edit);
        assert.ok(applied, "WorkspaceEdit should be applied successfully");

        // Verify the edit is reflected in the file
        await waitFor(async () => {
            const content = normalizeNewlines(await readTextFile(todoUri));
            assert.ok(
                content.includes("- [ ] Appended task"),
                `Expected appended task in file content. Got: ${JSON.stringify(content)}`,
            );
            assert.ok(
                content.includes("- [ ] Existing task"),
                "Original task should still be present",
            );
        });
    });

    test("task index consistency after sync", async () => {
        await activateExtension();
        await initializeWorkspaceWithBlueprint("individual-contributor");
        await waitForTaskCollectorReady();

        // Write a source file with a task
        const sourceUri = vscode.Uri.joinPath(workspaceRoot, "03-Inbox", "project-notes.md");
        await writeTextFile(sourceUri, "# Notes\n\n- [ ] Implement feature X\n");

        // Run sync
        await vscode.commands.executeCommand("memoria.syncTasks");

        // Verify the task appears in the index
        await waitFor(async () => {
            const index = await readJsonFile<StoredTaskIndex>(indexUri);
            assert.ok(index, "Task index should exist");
            const taskCount = Object.keys(index.tasks).length;
            assert.strictEqual(taskCount, 1, `Task index should contain exactly 1 task, found ${taskCount}`);
        });

        // Verify the collector file was updated
        await waitFor(async () => {
            const collector = normalizeNewlines(await readTextFile(collectorUri));
            assert.ok(
                collector.includes("Implement feature X"),
                `Collector should contain the synced task. Got: ${JSON.stringify(collector)}`,
            );
        });
    });

    test("source file missing — graceful degradation on edit", async () => {
        await activateExtension();
        await initializeWorkspaceWithBlueprint("individual-contributor");
        await waitForTaskCollectorReady();

        // Seed a todo.md with a collected task referencing a non-existent source
        const todoUri = vscode.Uri.joinPath(workspaceRoot, "00-Tasks", "All-Tasks.todo.md");
        const todoContent = [
            "# To do",
            "",
            "- [ ] Task from missing file",
            "  <!-- source: 03-Inbox/deleted-file.md -->",
            "",
            "# Completed",
            "",
        ].join("\n");
        await writeTextFile(todoUri, todoContent);

        // Confirm the referenced source does NOT exist
        const missingSourceUri = vscode.Uri.joinPath(workspaceRoot, "03-Inbox", "deleted-file.md");
        assert.strictEqual(
            await uriExists(missingSourceUri),
            false,
            "Source file should not exist for this test",
        );

        // Open the file and apply an edit — should not throw
        await vscode.commands.executeCommand("vscode.open", todoUri);
        await waitFor(async () => {
            const tab = findActiveTab();
            assert.ok(tab, "A tab should be open");
        });

        // Apply an edit to the .todo.md (e.g., modify the task body)
        const doc = await vscode.workspace.openTextDocument(todoUri);
        const edit = new vscode.WorkspaceEdit();
        const fullRange = new vscode.Range(
            doc.positionAt(0),
            doc.positionAt(doc.getText().length),
        );
        const updatedContent = todoContent.replace(
            "Task from missing file",
            "Updated task from missing file",
        );
        edit.replace(todoUri, fullRange, updatedContent);
        const applied = await vscode.workspace.applyEdit(edit);
        assert.ok(applied, "Edit should apply without error");

        // Verify the file was updated
        await waitFor(async () => {
            const content = normalizeNewlines(await readTextFile(todoUri));
            assert.ok(
                content.includes("Updated task from missing file"),
                `File should contain the edited task. Got: ${JSON.stringify(content)}`,
            );
        });

        // Confirm no unhandled error — if we got here, the provider handled the missing source gracefully
    });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
        assert.ok(index, "Task collector should bootstrap its index before tests proceed");
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

function normalizeNewlines(value: string): string {
    return value.replace(/\r\n/g, "\n");
}

function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function findActiveTab(): vscode.Tab | undefined {
    for (const group of vscode.window.tabGroups.all) {
        const active = group.activeTab;
        if (active) {
            return active;
        }
    }
    return undefined;
}
