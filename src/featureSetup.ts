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

export function registerFeatureHandlers(
    context: vscode.ExtensionContext,
    featureManager: FeatureManager,
    decorationProvider: BlueprintDecorationProvider,
    taskCollectorFeature: TaskCollectorFeature,
    contactsFeature: ContactsFeature,
    snippetsFeature: SnippetsFeature,
): void {
    let contactsViewDisposable: vscode.Disposable | undefined;
    let snippetCompletionDisposable: vscode.Disposable | undefined;
    let snippetHoverDisposable: vscode.Disposable | undefined;
    let snippetHoverCommandDisposable: vscode.Disposable | undefined;

    context.subscriptions.push({
        dispose: () => {
            contactsViewDisposable?.dispose();
            contactsViewDisposable = undefined;
        },
    });

    featureManager.register("decorations", (root, enabled) =>
        decorationProvider.refresh(root, enabled, getWorkspaceRoots())
    );

    featureManager.register("taskCollector", async (root, enabled) => {
        await taskCollectorFeature.refresh(root, enabled, getWorkspaceRoots());
    });

    featureManager.register("contacts", async (root, enabled) => {
        await contactsFeature.refresh(root, enabled);

        if (enabled && !contactsViewDisposable) {
            const provider = new ContactsViewProvider(contactsFeature, context.extensionUri);
            const registration = ContactsViewProvider.register(context, provider);
            contactsViewDisposable = {
                dispose: () => {
                    registration.dispose();
                    provider.dispose();
                },
            };
            return;
        }

        if (!enabled && contactsViewDisposable) {
            contactsViewDisposable.dispose();
            contactsViewDisposable = undefined;
        }
    });

    featureManager.register("snippets", async (root, enabled) => {
        await snippetsFeature.refresh(root, enabled);
        await vscode.commands.executeCommand("setContext", "memoria.snippetsActive", enabled && root !== null);

        if (enabled && !snippetCompletionDisposable) {
            const completionProvider = new SnippetCompletionProvider(snippetsFeature);
            snippetCompletionDisposable = vscode.languages.registerCompletionItemProvider(
                { scheme: "file" },
                completionProvider,
                "{", "@",
            );
            const hoverProvider = new SnippetHoverProvider(snippetsFeature);
            snippetHoverDisposable = vscode.languages.registerHoverProvider(
                { scheme: "file" },
                hoverProvider,
            );
            snippetHoverCommandDisposable = vscode.commands.registerCommand(
                "memoria.showDetailedContactHover",
                () => hoverProvider.showDetailedHover(),
            );
            return;
        }

        if (!enabled && snippetCompletionDisposable) {
            snippetCompletionDisposable.dispose();
            snippetCompletionDisposable = undefined;
            snippetHoverDisposable?.dispose();
            snippetHoverDisposable = undefined;
            snippetHoverCommandDisposable?.dispose();
            snippetHoverCommandDisposable = undefined;
        }
    });
}
