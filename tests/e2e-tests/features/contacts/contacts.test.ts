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

interface BlueprintManifest {
    contacts?: {
        peopleFolder: string;
        groups: Array<{
            file: string;
            type: "report" | "colleague";
        }>;
    };
}

interface FeaturesConfig {
    features: Array<{
        id: string;
        enabled: boolean;
    }>;
}

suite("Contacts feature (E2E)", () => {
    let workspaceRoot: vscode.Uri;
    let memoriaDir: vscode.Uri;
    let blueprintUri: vscode.Uri;
    let featuresUri: vscode.Uri;
    let contactsRoot: vscode.Uri;
    let colleaguesUri: vscode.Uri;
    let pronounsUri: vscode.Uri;
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
        blueprintUri = vscode.Uri.joinPath(memoriaDir, "blueprint.json");
        featuresUri = vscode.Uri.joinPath(memoriaDir, "features.json");
        contactsRoot = vscode.Uri.joinPath(workspaceRoot, "05-Autocomplete", "Contacts");
        colleaguesUri = vscode.Uri.joinPath(contactsRoot, "Colleagues.md");
        pronounsUri = vscode.Uri.joinPath(contactsRoot, "DataTypes", "Pronouns.md");
    });

    teardown(async () => {
        await vscode.commands.executeCommand("workbench.action.closeAllEditors");
        await deleteRecursive(memoriaDir);
        for (const folder of managedFolders) {
            await deleteRecursive(vscode.Uri.joinPath(workspaceRoot, folder));
        }
    });

    test("initializes contacts config and scaffolds the contacts workspace files", async () => {
        await activateExtension();
        await initializeWorkspaceWithBlueprint("individual-contributor");

        await waitFor(async () => {
            assert.strictEqual(await uriExists(contactsRoot), true, "The contacts folder should be scaffolded.");
            assert.strictEqual(await uriExists(colleaguesUri), true, "The Colleagues.md group file should exist.");
            assert.strictEqual(await uriExists(pronounsUri), true, "The Pronouns.md reference file should exist.");

            const manifest = await readJsonFile<BlueprintManifest>(blueprintUri);
            assert.ok(manifest?.contacts, "The blueprint manifest should persist the contacts config.");
            assert.strictEqual(manifest?.contacts?.peopleFolder, "05-Autocomplete/Contacts/", "The contacts peopleFolder should match the blueprint.");
            assert.deepStrictEqual(
                manifest?.contacts?.groups,
                [{ file: "Colleagues.md", type: "colleague" }],
                "The bundled individual-contributor blueprint should declare one colleague group.",
            );

            const features = await readJsonFile<FeaturesConfig>(featuresUri);
            assert.ok(
                features?.features.some((feature) => feature.id === "contacts" && feature.enabled),
                "The contacts feature should be enabled by default after initialization.",
            );
        });
    });

    test("shows the inactive contacts message after contacts is disabled via Manage Features", async () => {
        await activateExtension();
        await initializeWorkspaceWithBlueprint("individual-contributor");

        await withQuickPickStub(async () => {
            await vscode.commands.executeCommand("memoria.manageFeatures");
        }, (items, options) => {
            assert.strictEqual(options?.canPickMany, true, "Manage Features should use a multi-select QuickPick.");
            return items.filter((item) => item.id !== "contacts");
        });

        const messages = await captureInformationMessages(async () => {
            await vscode.commands.executeCommand("memoria.addPerson");
        });

        assert.ok(
            messages.some((message) => message.includes("Contacts is not enabled for this workspace")),
            "Invoking Add Person while the feature is disabled should show the inactive contacts message.",
        );

        const features = await readJsonFile<FeaturesConfig>(featuresUri);
        assert.ok(
            features?.features.some((feature) => feature.id === "contacts" && !feature.enabled),
            "The contacts feature should be persisted as disabled after the Manage Features command runs.",
        );
    });

    test("rewrites contacts to unknown when referenced pronouns are removed", async () => {
        await activateExtension();
        await initializeWorkspaceWithBlueprint("individual-contributor");

        await waitFor(async () => {
            assert.strictEqual(await uriExists(pronounsUri), true, "The reference data should exist before watcher tests run.");
        });

        await writeTextFile(colleaguesUri, [
            "# alias1",
            "- Nickname: Alice",
            "- FullName: Alice Anderson",
            "- Title: Senior Software Engineer",
            "- CareerPathKey: sde",
            "- PronounsKey: they/them",
        ].join("\n"));

        await writeTextFile(pronounsUri, [
            "# he/him",
            "- Subject: he",
            "- Object: him",
            "- PossessiveAdjective: his",
            "- Possessive: his",
            "- Reflexive: himself",
            "",
            "# she/her",
            "- Subject: she",
            "- Object: her",
            "- PossessiveAdjective: her",
            "- Possessive: hers",
            "- Reflexive: herself",
        ].join("\n"));

        await waitFor(async () => {
            const colleagues = normalizeNewlines(await readTextFile(colleaguesUri));
            assert.ok(
                colleagues.includes("PronounsKey: unknown"),
                `The contacts watcher should rewrite missing pronouns to unknown. Content: ${JSON.stringify(colleagues)}`,
            );
        }, 8_000);
    });
});

async function activateExtension(): Promise<void> {
    const extension = vscode.extensions.getExtension("RazMake.memoria");
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

async function captureInformationMessages(action: () => Promise<void>): Promise<string[]> {
    const original = vscode.window.showInformationMessage;
    const messages: string[] = [];

    const stub = (async <T extends string>(message: string): Promise<T | undefined> => {
        messages.push(message);
        return undefined;
    }) as unknown as typeof vscode.window.showInformationMessage;

    (vscode.window as typeof vscode.window & {
        showInformationMessage: typeof vscode.window.showInformationMessage;
    }).showInformationMessage = stub;

    try {
        await action();
    } finally {
        (vscode.window as typeof vscode.window & {
            showInformationMessage: typeof vscode.window.showInformationMessage;
        }).showInformationMessage = original;
    }

    return messages;
}

function normalizeNewlines(value: string): string {
    return value.replace(/\r\n/g, "\n");
}