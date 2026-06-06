import * as vscode from "vscode";
import { getWorkspaceRoots } from "./blueprints/workspaceUtils";
import { BlueprintDecorationProvider } from "./features/decorations/blueprintDecorationProvider";
import { ContactsFeature } from "./features/contacts/contactsFeature";
import { ContactsViewProvider } from "./features/contacts/contactsViewProvider";
import { FeatureManager } from "./features/featureManager";
import { SnippetsFeature } from "./features/snippets/snippetsFeature";
import { SnippetCompletionProvider } from "./features/snippets/snippetCompletionProvider";
import { SnippetHoverProvider } from "./features/snippets/snippetHoverProvider";
import { TaskCollectorFeature } from "./features/taskCollector/taskCollectorFeature";
import { BackupFeature } from "./features/backup/backupFeature";

/**
 * Manages a disposable resource that is created on enable and disposed on disable.
 * Eliminates the duplicated if-enabled/if-disabled toggle pattern across feature handlers.
 */
function createToggle(): {
    enable: (factory: () => vscode.Disposable) => void;
    disable: () => void;
    dispose: () => void;
} {
    let disposable: vscode.Disposable | undefined;
    return {
        enable(factory) {
            if (!disposable) {
                disposable = factory();
            }
        },
        disable() {
            disposable?.dispose();
            disposable = undefined;
        },
        dispose() {
            disposable?.dispose();
            disposable = undefined;
        },
    };
}

export function registerFeatureHandlers(
    context: vscode.ExtensionContext,
    featureManager: FeatureManager,
    decorationProvider: BlueprintDecorationProvider,
    taskCollectorFeature: TaskCollectorFeature,
    contactsFeature: ContactsFeature,
    snippetsFeature: SnippetsFeature,
    backupFeature: BackupFeature,
): void {
    const contactsToggle = createToggle();
    const snippetsToggle = createToggle();

    context.subscriptions.push({ dispose: () => contactsToggle.dispose() });
    context.subscriptions.push({ dispose: () => snippetsToggle.dispose() });

    featureManager.register("decorations", (root, enabled) =>
        decorationProvider.refresh(root, enabled, getWorkspaceRoots())
    );

    featureManager.register("taskCollector", async (root, enabled) => {
        await taskCollectorFeature.refresh(root, enabled, getWorkspaceRoots());
    });

    featureManager.register("contacts", async (root, enabled) => {
        await contactsFeature.refresh(root, enabled);

        if (enabled) {
            contactsToggle.enable(() => {
                const provider = new ContactsViewProvider(contactsFeature, context.extensionUri);
                const registration = ContactsViewProvider.register(context, provider);
                return vscode.Disposable.from(registration, provider);
            });
        } else {
            contactsToggle.disable();
        }
    });

    featureManager.register("snippets", async (root, enabled) => {
        await snippetsFeature.refresh(root, enabled);
        await vscode.commands.executeCommand("setContext", "memoria.snippetsActive", enabled && root !== null);

        if (enabled) {
            snippetsToggle.enable(() => {
                const completionProvider = new SnippetCompletionProvider(snippetsFeature);
                const hoverProvider = new SnippetHoverProvider(snippetsFeature);
                return vscode.Disposable.from(
                    vscode.languages.registerCompletionItemProvider(
                        { scheme: "file" },
                        completionProvider,
                        "{", "@",
                    ),
                    vscode.languages.registerHoverProvider(
                        { scheme: "file" },
                        hoverProvider,
                    ),
                    vscode.commands.registerCommand(
                        "memoria.showDetailedContactHover",
                        () => hoverProvider.showDetailedHover(),
                    ),
                );
            });
        } else {
            snippetsToggle.disable();
        }
    });

    featureManager.register("backup", async (root, enabled) => {
        await backupFeature.refresh(root, enabled);
    });
}
