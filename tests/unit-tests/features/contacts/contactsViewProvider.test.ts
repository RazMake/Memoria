import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ContactsFeature, ContactsSnapshot } from "../../../../src/features/contacts/contactsFeature";
import type { Contact, ContactsViewContact, ContactsViewToWebviewMessage } from "../../../../src/features/contacts/types";
import * as vscode from "vscode";

vi.mock("vscode", () => ({
    Uri: {
        joinPath: vi.fn((_base: unknown, ...segments: string[]) => ({
            toString: () => segments.join("/"),
        })),
    },
    window: {
        registerWebviewViewProvider: vi.fn(() => ({ dispose: vi.fn() })),
        showInformationMessage: vi.fn(),
        showErrorMessage: vi.fn(),
    },
    commands: {
        executeCommand: vi.fn(),
    },
}));

vi.mock("node:crypto", () => ({
    randomBytes: vi.fn(() => ({
        toString: () => "mock-nonce-value",
    })),
}));

import { ContactsViewProvider } from "../../../../src/features/contacts/contactsViewProvider";

function makeMinimalSnapshot(): ContactsSnapshot {
    return {
        active: true,
        multiGroup: false,
        groups: [],
        contacts: [],
        referenceData: {
            pronouns: [],
            careerLevels: [],
            careerPaths: [],
            interviewTypes: [],
            canonicalTitles: [],
        },
    } as unknown as ContactsSnapshot;
}

function makeSnapshotWithContact(contact: ContactsViewContact, groups?: any[]): ContactsSnapshot {
    return {
        active: true,
        multiGroup: groups ? groups.length > 1 : false,
        groups: groups ?? [{ file: contact.groupFile, name: contact.groupName, type: contact.kind, isCustom: false, contactCount: 1 }],
        contacts: [contact],
        referenceData: {
            pronouns: [],
            careerLevels: [],
            careerPaths: [],
            interviewTypes: [],
            canonicalTitles: [],
        },
    } as unknown as ContactsSnapshot;
}

function makeColleagueContact(overrides?: Partial<ContactsViewContact>): ContactsViewContact {
    return {
        kind: "colleague",
        id: "alice",
        nickname: "Alice",
        fullName: "Alice Smith",
        title: "Engineer",
        shortTitle: "Eng",
        careerPathKey: "ic",
        pronounsKey: "she",
        extraFields: {},
        droppedFields: {},
        groupFile: "group-a.json",
        groupName: "Group A",
        isCustomGroup: false,
        ...overrides,
    } as ContactsViewContact;
}

function makeColleagueDraft(overrides?: Partial<Contact>): Contact {
    return {
        kind: "colleague",
        id: "alice",
        nickname: "Alice",
        fullName: "Alice Smith",
        title: "Engineer",
        careerPathKey: "ic",
        pronounsKey: "she",
        extraFields: {},
        droppedFields: {},
        ...overrides,
    } as Contact;
}

function createMockFeature(snapshot?: ContactsSnapshot): ContactsFeature {
    const updateListeners: Array<(s: ContactsSnapshot) => void> = [];
    const formRequestListeners: Array<(r: any) => void> = [];
    return {
        getSnapshot: vi.fn(() => snapshot ?? makeMinimalSnapshot()),
        onDidUpdate: vi.fn((cb: (s: ContactsSnapshot) => void) => {
            updateListeners.push(cb);
            return { dispose: vi.fn() };
        }),
        onDidRequestFormOpen: vi.fn((cb: (r: any) => void) => {
            formRequestListeners.push(cb);
            return { dispose: vi.fn() };
        }),
        requestAddContactForm: vi.fn(),
        requestEditContactForm: vi.fn(),
        requestMoveContactForm: vi.fn(),
        addContact: vi.fn(),
        editContact: vi.fn(),
        moveContact: vi.fn(),
        deleteContact: vi.fn(),
        createCustomGroup: vi.fn(),
        _updateListeners: updateListeners,
        _formRequestListeners: formRequestListeners,
    } as unknown as ContactsFeature & {
        _updateListeners: Array<(s: ContactsSnapshot) => void>;
        _formRequestListeners: Array<(r: any) => void>;
    };
}

function createMockWebviewView() {
    const postedMessages: unknown[] = [];
    const messageListeners: ((msg: any) => void)[] = [];
    return {
        webview: {
            options: {} as any,
            html: "",
            cspSource: "https://mock.csp.source",
            asWebviewUri: vi.fn((uri: unknown) => uri),
            onDidReceiveMessage: vi.fn((listener: any) => {
                messageListeners.push(listener);
                return { dispose: vi.fn() };
            }),
            postMessage: vi.fn(async (msg: unknown) => { postedMessages.push(msg); return true; }),
        },
        onDidDispose: vi.fn(() => ({ dispose: vi.fn() })),
        _postedMessages: postedMessages,
        _messageListeners: messageListeners,
    };
}

function flushPromises(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 0));
}

async function simulateMessage(view: ReturnType<typeof createMockWebviewView>, message: any): Promise<void> {
    for (const listener of view._messageListeners) {
        listener(message);
    }
    await flushPromises();
}

async function setupResolvedProvider(
    feature: ContactsFeature,
    extensionUri: any,
): Promise<{ provider: ContactsViewProvider; view: ReturnType<typeof createMockWebviewView> }> {
    const provider = new ContactsViewProvider(feature, extensionUri);
    const view = createMockWebviewView();
    provider.resolveWebviewView(view as any, {} as any, {} as any);
    await simulateMessage(view, { type: "ready" });
    view._postedMessages.length = 0; // clear the "update" message sent on ready
    return { provider, view };
}

describe("ContactsViewProvider", () => {
    let mockFeature: ReturnType<typeof createMockFeature>;
    const extensionUri = { toString: () => "file:///ext" } as any;

    beforeEach(() => {
        vi.clearAllMocks();
        mockFeature = createMockFeature();
    });

    describe("constructor", () => {
        it("should subscribe to feature events", () => {
            new ContactsViewProvider(mockFeature, extensionUri);

            expect(mockFeature.onDidUpdate).toHaveBeenCalledOnce();
            expect(mockFeature.onDidRequestFormOpen).toHaveBeenCalledOnce();
        });

        it("should capture initial snapshot from feature", () => {
            const provider = new ContactsViewProvider(mockFeature, extensionUri);

            expect(mockFeature.getSnapshot).toHaveBeenCalledOnce();
            expect(provider).toBeDefined();
        });
    });

    describe("dispose", () => {
        it("should clean up subscriptions", () => {
            const provider = new ContactsViewProvider(mockFeature, extensionUri);
            const onDidUpdateDisposable = (mockFeature.onDidUpdate as any).mock.results[0].value;
            const onDidRequestFormOpenDisposable = (mockFeature.onDidRequestFormOpen as any).mock.results[0].value;

            provider.dispose();

            expect(onDidUpdateDisposable.dispose).toHaveBeenCalledOnce();
            expect(onDidRequestFormOpenDisposable.dispose).toHaveBeenCalledOnce();
        });
    });

    describe("resolveWebviewView", () => {
        it("should set HTML and configure webview options", () => {
            const provider = new ContactsViewProvider(mockFeature, extensionUri);
            const view = createMockWebviewView();

            provider.resolveWebviewView(view as any, {} as any, {} as any);

            expect(view.webview.html).toContain("<!DOCTYPE html>");
            expect(view.webview.html).toContain("Content-Security-Policy");
            expect(view.webview.options.enableScripts).toBe(true);
        });

        it("should subscribe to webview message events", () => {
            const provider = new ContactsViewProvider(mockFeature, extensionUri);
            const view = createMockWebviewView();

            provider.resolveWebviewView(view as any, {} as any, {} as any);

            expect(view.webview.onDidReceiveMessage).toHaveBeenCalledOnce();
            expect(view.onDidDispose).toHaveBeenCalledOnce();
        });
    });

    describe("ready message", () => {
        it("should post update snapshot when ready message is received", async () => {
            const provider = new ContactsViewProvider(mockFeature, extensionUri);
            const view = createMockWebviewView();
            provider.resolveWebviewView(view as any, {} as any, {} as any);

            await simulateMessage(view, { type: "ready" });

            expect(view.webview.postMessage).toHaveBeenCalledWith(
                expect.objectContaining({ type: "update" }),
            );
        });
    });

    describe("postWhenReady", () => {
        it("should not post message when webview is not ready", async () => {
            const contact = makeColleagueContact();
            const snapshot = makeSnapshotWithContact(contact);
            const feature = createMockFeature(snapshot);
            const provider = new ContactsViewProvider(feature, extensionUri);
            const view = createMockWebviewView();
            provider.resolveWebviewView(view as any, {} as any, {} as any);
            // do NOT send "ready" message

            // trigger an update via the feature listener
            const updatedSnapshot = makeSnapshotWithContact(makeColleagueContact({ fullName: "Updated" }));
            feature._updateListeners[0](updatedSnapshot);

            // wait for async
            await vi.waitFor(() => {
                // postMessage should not have been called because ready was never set
                expect(view.webview.postMessage).not.toHaveBeenCalled();
            });
        });
    });

    describe("handleSaveMessage", () => {
        it("should call feature.addContact and post saved message on success", async () => {
            const contact = makeColleagueContact();
            const snapshot = makeSnapshotWithContact(contact);
            const feature = createMockFeature(snapshot);
            const { view } = await setupResolvedProvider(feature, extensionUri);

            await simulateMessage(view, {
                type: "save",
                mode: "add",
                groupFile: "group-a.json",
                contact: makeColleagueDraft(),
            });

            expect(feature.addContact).toHaveBeenCalledWith("group-a.json", expect.objectContaining({ id: "alice" }));
            expect(view.webview.postMessage).toHaveBeenCalledWith(
                expect.objectContaining({ type: "saved", mode: "add" }),
            );
            expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(expect.stringContaining("Saved"));
        });

        it("should call reportError on addContact failure", async () => {
            const contact = makeColleagueContact();
            const snapshot = makeSnapshotWithContact(contact);
            const feature = createMockFeature(snapshot);
            (feature.addContact as any).mockRejectedValue(new Error("disk full"));
            const { view } = await setupResolvedProvider(feature, extensionUri);

            await simulateMessage(view, {
                type: "save",
                mode: "add",
                groupFile: "group-a.json",
                contact: makeColleagueDraft(),
            });

            expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
                expect.stringContaining("disk full"),
            );
            expect(view.webview.postMessage).toHaveBeenCalledWith(
                expect.objectContaining({ type: "error" }),
            );
        });

        it("should call feature.editContact on edit mode", async () => {
            const contact = makeColleagueContact();
            const snapshot = makeSnapshotWithContact(contact);
            const feature = createMockFeature(snapshot);
            const { view } = await setupResolvedProvider(feature, extensionUri);

            await simulateMessage(view, {
                type: "save",
                mode: "edit",
                sourceContactId: "alice",
                contact: makeColleagueDraft({ fullName: "Alice Updated" }),
            });

            expect(feature.editContact).toHaveBeenCalledWith(
                "alice",
                "group-a.json",
                expect.objectContaining({ fullName: "Alice Updated" }),
            );
            expect(view.webview.postMessage).toHaveBeenCalledWith(
                expect.objectContaining({ type: "saved", mode: "edit" }),
            );
        });

        it("should report error when editing a non-existent contact", async () => {
            const feature = createMockFeature(); // empty snapshot
            const { view } = await setupResolvedProvider(feature, extensionUri);

            await simulateMessage(view, {
                type: "save",
                mode: "edit",
                sourceContactId: "nonexistent",
                contact: makeColleagueDraft({ id: "nonexistent" }),
            });

            expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
                expect.stringContaining("no longer exists"),
            );
        });
    });

    describe("handleDeleteMessage", () => {
        it("should call feature.deleteContact on success", async () => {
            const feature = createMockFeature();
            const { view } = await setupResolvedProvider(feature, extensionUri);

            await simulateMessage(view, { type: "delete", contactId: "alice" });

            expect(feature.deleteContact).toHaveBeenCalledWith("alice");
        });

        it("should call reportError on deleteContact failure", async () => {
            const feature = createMockFeature();
            (feature.deleteContact as any).mockRejectedValue(new Error("file locked"));
            const { view } = await setupResolvedProvider(feature, extensionUri);

            await simulateMessage(view, { type: "delete", contactId: "alice" });

            expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
                expect.stringContaining("file locked"),
            );
            expect(view.webview.postMessage).toHaveBeenCalledWith(
                expect.objectContaining({ type: "error" }),
            );
        });
    });

    describe("handleMoveMessage", () => {
        it("should call feature.moveContact on success", async () => {
            const contact = makeColleagueContact();
            const groups = [
                { file: "group-a.json", name: "Group A", type: "colleague", isCustom: false, contactCount: 1 },
                { file: "group-b.json", name: "Group B", type: "colleague", isCustom: false, contactCount: 0 },
            ];
            const snapshot = makeSnapshotWithContact(contact, groups);
            const feature = createMockFeature(snapshot);
            const { view } = await setupResolvedProvider(feature, extensionUri);

            await simulateMessage(view, {
                type: "move",
                contactId: "alice",
                targetGroupFile: "group-b.json",
            });

            expect(feature.moveContact).toHaveBeenCalledWith("alice", "group-b.json");
            expect(view.webview.postMessage).toHaveBeenCalledWith(
                expect.objectContaining({ type: "saved", mode: "move" }),
            );
            expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
                expect.stringContaining("Moved Alice"),
            );
        });

        it("should report error when contact not found", async () => {
            const feature = createMockFeature(); // empty snapshot
            const { view } = await setupResolvedProvider(feature, extensionUri);

            await simulateMessage(view, {
                type: "move",
                contactId: "nonexistent",
                targetGroupFile: "group-b.json",
            });

            expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
                expect.stringContaining("was not found"),
            );
        });

        it("should report error when target group not found", async () => {
            const contact = makeColleagueContact();
            const snapshot = makeSnapshotWithContact(contact);
            const feature = createMockFeature(snapshot);
            const { view } = await setupResolvedProvider(feature, extensionUri);

            await simulateMessage(view, {
                type: "move",
                contactId: "alice",
                targetGroupFile: "nonexistent-group.json",
            });

            expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
                expect.stringContaining("was not found"),
            );
        });

        it("should report error on moveContact failure", async () => {
            const contact = makeColleagueContact();
            const groups = [
                { file: "group-a.json", name: "Group A", type: "colleague", isCustom: false, contactCount: 1 },
                { file: "group-b.json", name: "Group B", type: "colleague", isCustom: false, contactCount: 0 },
            ];
            const snapshot = makeSnapshotWithContact(contact, groups);
            const feature = createMockFeature(snapshot);
            (feature.moveContact as any).mockRejectedValue(new Error("write failed"));
            const { view } = await setupResolvedProvider(feature, extensionUri);

            await simulateMessage(view, {
                type: "move",
                contactId: "alice",
                targetGroupFile: "group-b.json",
            });

            expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
                expect.stringContaining("write failed"),
            );
        });
    });

    describe("reportError", () => {
        it("should show error message and post error to webview", async () => {
            const feature = createMockFeature();
            (feature.deleteContact as any).mockRejectedValue(new Error("something broke"));
            const { view } = await setupResolvedProvider(feature, extensionUri);

            await simulateMessage(view, { type: "delete", contactId: "x" });

            expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
                expect.stringContaining("something broke"),
            );
            expect(view.webview.postMessage).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: "error",
                    message: expect.stringContaining("something broke"),
                }),
            );
        });
    });
});
