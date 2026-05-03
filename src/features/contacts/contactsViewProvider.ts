import * as vscode from "vscode";
import type {
    Contact,
    ContactsViewContact,
    ContactsViewFormRequest,
    ContactsViewSnapshot,
    ContactsViewToExtensionMessage,
    ContactsViewToWebviewMessage,
} from "./types";
import type {
    ContactsFeature,
    ContactsFormOpenRequest,
    ContactsSnapshot,
    ResolvedContact,
} from "./contactsFeature";
import { mapSnapshot, mapFormRequest, buildWritableContact, isToExtensionMessage, disposeAll } from "./contactsViewMapping";
import { getHtmlForWebview, getNonce } from "./contactsViewHtml";

const CONTACTS_WEBVIEW_BUNDLE = "contacts-webview.js";

export class ContactsViewProvider implements vscode.WebviewViewProvider, vscode.Disposable {
    static readonly viewType = "memoria.contactsView";

    private view: vscode.WebviewView | null = null;
    private ready = false;
    private latestSnapshot: ContactsViewSnapshot;
    private pendingOpenRequest: ContactsViewFormRequest | null = null;
    private readonly featureSubscriptions: vscode.Disposable[];
    private viewSubscriptions: vscode.Disposable[] = [];

    constructor(
        private readonly feature: ContactsFeature,
        private readonly extensionUri: vscode.Uri,
    ) {
        this.latestSnapshot = mapSnapshot(feature.getSnapshot());
        this.featureSubscriptions = [
            this.feature.onDidUpdate((snapshot) => {
                this.latestSnapshot = mapSnapshot(snapshot);
                void this.postWhenReady({
                    type: "update",
                    snapshot: this.latestSnapshot,
                });
            }),
            this.feature.onDidRequestFormOpen((request) => {
                this.pendingOpenRequest = mapFormRequest(request);
                void this.revealView();
                void this.postWhenReady({
                    type: "open",
                    request: this.pendingOpenRequest,
                });
            }),
        ];
    }

    static register(context: vscode.ExtensionContext, provider: ContactsViewProvider): vscode.Disposable {
        return vscode.window.registerWebviewViewProvider(ContactsViewProvider.viewType, provider, {
            webviewOptions: {
                retainContextWhenHidden: true,
            },
        });
    }

    dispose(): void {
        disposeAll(this.featureSubscriptions);
        this.featureSubscriptions.length = 0;
        this.disposeView();
    }

    resolveWebviewView(
        view: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ): void {
        this.disposeView();

        this.view = view;
        this.ready = false;

        const distUri = vscode.Uri.joinPath(this.extensionUri, "dist");
        view.webview.options = {
            enableScripts: true,
            localResourceRoots: [distUri],
        };

        const nonce = getNonce();
        const scriptUri = view.webview.asWebviewUri(vscode.Uri.joinPath(distUri, CONTACTS_WEBVIEW_BUNDLE));
        view.webview.html = getHtmlForWebview(view.webview, nonce, scriptUri);

        this.viewSubscriptions = [
            view.webview.onDidReceiveMessage((message: unknown) => {
                void this.handleMessage(message);
            }),
            view.onDidDispose(() => {
                this.disposeView();
            }),
        ];
    }

    private async handleMessage(message: unknown): Promise<void> {
        if (!isToExtensionMessage(message)) {
            return;
        }

        switch (message.type) {
            case "ready":
                this.ready = true;
                await this.postWhenReady({
                    type: "update",
                    snapshot: this.latestSnapshot,
                });

                if (this.pendingOpenRequest) {
                    await this.postWhenReady({
                        type: "open",
                        request: this.pendingOpenRequest,
                    });
                }
                break;
            case "open":
                await this.handleOpenMessage(message);
                break;
            case "save":
                await this.handleSaveMessage(message);
                break;
            case "delete":
                await this.handleDeleteMessage(message.contactId);
                break;
            case "move":
                await this.handleMoveMessage(message.contactId, message.targetGroupFile);
                break;
        }
    }

    private async handleOpenMessage(message: Extract<ContactsViewToExtensionMessage, { type: "open" }>): Promise<void> {
        switch (message.mode) {
            case "add":
                this.feature.requestAddContactForm(message.preferredGroupFile);
                break;
            case "edit":
                if (!message.contactId) {
                    await this.reportError("Memoria: A contact is required to open the edit form.");
                    return;
                }

                this.feature.requestEditContactForm(message.contactId);
                break;
            case "move": {
                if (!message.contactId) {
                    await this.reportError("Memoria: A contact is required to open the move form.");
                    return;
                }

                const targetGroupFile = message.targetGroupFile ?? this.getDefaultMoveTarget(message.contactId);
                if (!targetGroupFile) {
                    await this.reportError("Memoria: No destination group is available for this move.");
                    return;
                }

                this.feature.requestMoveContactForm(message.contactId, targetGroupFile);
                break;
            }
        }
    }

    private async handleSaveMessage(message: Extract<ContactsViewToExtensionMessage, { type: "save" }>): Promise<void> {
        const sourceContact = message.sourceContactId
            ? this.findContact(message.sourceContactId)
            : null;

        try {
            const groupFile = await this.resolveSaveGroupFile(message, sourceContact);
            const contact = buildWritableContact(message.contact, sourceContact);

            switch (message.mode) {
                case "add":
                    await this.feature.addContact(groupFile, contact);
                    break;
                case "edit":
                    if (!sourceContact) {
                        throw new Error("The contact being edited no longer exists.");
                    }

                    await this.feature.editContact(sourceContact.id, groupFile, contact);
                    break;
                case "move":
                    if (!sourceContact) {
                        throw new Error("The contact being moved no longer exists.");
                    }

                    await this.feature.moveContact(sourceContact.id, groupFile, contact);
                    break;
            }

            this.pendingOpenRequest = null;

            await this.postWhenReady({
                type: "saved",
                mode: message.mode,
                contactId: contact.id,
                groupFile,
            });

            const label = contact.nickname || contact.fullName || contact.id || "contact";
            const group = this.latestSnapshot.groups.find((entry) => entry.file === groupFile);
            const groupName = group?.name ?? null;
            if (message.mode === "move" && groupName) {
                vscode.window.showInformationMessage(`Moved ${label} to ${groupName}.`);
            } else if (message.mode === "add") {
                vscode.window.showInformationMessage(`Saved ${label}.`);
            } else {
                vscode.window.showInformationMessage(`Updated ${label}.`);
            }
        } catch (error) {
            await this.reportError(
                `Memoria: Could not save person - ${error instanceof Error ? error.message : String(error)}`
            );
        }
    }

    private async handleDeleteMessage(contactId: string): Promise<void> {
        try {
            await this.feature.deleteContact(contactId);
        } catch (error) {
            await this.reportError(
                `Memoria: Could not delete person - ${error instanceof Error ? error.message : String(error)}`
            );
        }
    }

    private async handleMoveMessage(contactId: string, requestedTargetGroupFile?: string): Promise<void> {
        const contact = this.findContact(contactId);
        if (!contact) {
            await this.reportError(`Memoria: Contact "${contactId}" was not found.`);
            return;
        }

        const targetGroupFile = requestedTargetGroupFile ?? this.getDefaultMoveTarget(contact.id);
        if (!targetGroupFile) {
            await this.reportError("Memoria: No destination group is available for this move.");
            return;
        }

        const targetGroup = this.latestSnapshot.groups.find((group) => group.file === targetGroupFile);
        if (!targetGroup) {
            await this.reportError(`Memoria: Contact group "${targetGroupFile}" was not found.`);
            return;
        }

        if (contact.kind === "colleague" && targetGroup.type === "report") {
            this.feature.requestMoveContactForm(contact.id, targetGroupFile);
            return;
        }

        try {
            await this.feature.moveContact(contact.id, targetGroupFile);
            await this.postWhenReady({
                type: "saved",
                mode: "move",
                contactId: contact.id,
                groupFile: targetGroupFile,
            });

            const label = contact.nickname || contact.fullName || contact.id || "contact";
            vscode.window.showInformationMessage(`Moved ${label} to ${targetGroup.name}.`);
        } catch (error) {
            await this.reportError(
                `Memoria: Could not move person - ${error instanceof Error ? error.message : String(error)}`
            );
        }
    }

    private async resolveSaveGroupFile(
        message: Extract<ContactsViewToExtensionMessage, { type: "save" }>,
        sourceContact: ContactsViewContact | null,
    ): Promise<string> {
        if (message.mode === "edit") {
            if (!sourceContact) {
                throw new Error("The contact being edited no longer exists.");
            }

            return sourceContact.groupFile;
        }

        if (message.newGroupName?.trim()) {
            const createdGroup = await this.feature.createCustomGroup(message.newGroupName);
            return createdGroup.file;
        }

        if (!message.groupFile?.trim()) {
            throw new Error("A destination group is required.");
        }

        if (message.mode === "move" && sourceContact && sourceContact.groupFile === message.groupFile) {
            throw new Error("Source and target contact groups are the same.");
        }

        return message.groupFile;
    }

    private findContact(contactId: string): ContactsViewContact | null {
        return this.latestSnapshot.contacts.find((contact) => contact.id === contactId) ?? null;
    }

    private getDefaultMoveTarget(contactId: string): string | null {
        const contact = this.findContact(contactId);
        if (!contact) {
            return null;
        }

        return this.latestSnapshot.groups.find((group) => group.file !== contact.groupFile)?.file ?? null;
    }

    private async postWhenReady(message: ContactsViewToWebviewMessage): Promise<void> {
        if (!this.view || !this.ready) {
            return;
        }

        await this.view.webview.postMessage(message);
    }

    private async revealView(): Promise<void> {
        if (this.view) {
            const currentView = this.view as vscode.WebviewView & {
                show?: (preserveFocus?: boolean) => void;
            };
            currentView.show?.(true);
            return;
        }

        await vscode.commands.executeCommand("workbench.view.extension.memoria-contacts");
    }

    private async reportError(message: string): Promise<void> {
        vscode.window.showErrorMessage(message);
        await this.postWhenReady({
            type: "error",
            message,
        });
    }

    private disposeView(): void {
        disposeAll(this.viewSubscriptions);
        this.viewSubscriptions.length = 0;
        this.view = null;
        this.ready = false;
    }
}
