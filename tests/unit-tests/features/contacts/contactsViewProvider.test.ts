import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ContactsFeature, ContactsSnapshot } from "../../../../src/features/contacts/contactsFeature";
import type { ContactsViewSnapshot, ContactsViewToWebviewMessage } from "../../../../src/features/contacts/types";

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
    return {
        webview: {
            options: {} as any,
            html: "",
            cspSource: "https://mock.csp.source",
            asWebviewUri: vi.fn((uri: unknown) => uri),
            onDidReceiveMessage: vi.fn(() => ({ dispose: vi.fn() })),
            postMessage: vi.fn(async (msg: unknown) => { postedMessages.push(msg); }),
        },
        onDidDispose: vi.fn(() => ({ dispose: vi.fn() })),
        _postedMessages: postedMessages,
    };
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
});
