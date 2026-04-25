import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("vscode", () => ({
    Uri: {
        joinPath: vi.fn((_base: unknown, ...parts: string[]) => ({
            toString: () => parts.join("/"),
            fsPath: parts.join("/"),
        })),
    },
    window: {
        registerCustomEditorProvider: vi.fn(() => ({ dispose: vi.fn() })),
        showTextDocument: vi.fn().mockResolvedValue(undefined),
        showWarningMessage: vi.fn(),
        tabGroups: { all: [] },
    },
    workspace: {
        workspaceFolders: [],
        applyEdit: vi.fn().mockResolvedValue(true),
        onDidChangeTextDocument: vi.fn(() => ({ dispose: vi.fn() })),
    },
    commands: {
        executeCommand: vi.fn().mockResolvedValue(undefined),
    },
    WorkspaceEdit: class {
        replace = vi.fn();
    },
    Range: class {
        start: { line: number; character: number };
        end: { line: number; character: number };
        constructor(sl: number, sc: number, el: number, ec: number) {
            this.start = { line: sl, character: sc };
            this.end = { line: el, character: ec };
        }
    },
    ViewColumn: { Active: 1, Beside: 2 },
}));

vi.mock("markdown-it", () => ({
    default: vi.fn(() => ({
        use: vi.fn().mockReturnThis(),
        render: vi.fn((text: string) => `<p>${text}</p>`),
    })),
}));

vi.mock("markdown-it-task-lists", () => ({}));

vi.mock("../../../../src/features/contacts/contactTooltip", () => ({
    buildContactTooltipMarkdown: vi.fn(() => "tooltip"),
}));

import { TodoEditorProvider } from "../../../../src/features/todoEditor/todoEditorProvider";
import type { ManifestManager } from "../../../../src/blueprints/manifestManager";
import * as vscode from "vscode";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeManifest(overrides: Partial<ManifestManager> = {}): ManifestManager {
    return {
        findInitializedRoot: vi.fn().mockResolvedValue(null),
        readTaskIndex: vi.fn().mockResolvedValue(null),
        ...overrides,
    } as unknown as ManifestManager;
}

function makeExtensionUri() {
    return { toString: () => "ext-uri", fsPath: "ext-uri" } as any;
}

function makeMockDocument(text = "") {
    return {
        getText: vi.fn(() => text),
        uri: { toString: () => "file:///test.todo.md" },
        lineCount: text.split("\n").length,
        save: vi.fn().mockResolvedValue(true),
    } as any;
}

function makeMockPanel() {
    const messageListeners: ((msg: any) => void)[] = [];
    return {
        webview: {
            options: {},
            html: "",
            asWebviewUri: vi.fn((uri: any) => uri),
            onDidReceiveMessage: vi.fn((listener: any) => {
                messageListeners.push(listener);
                return { dispose: vi.fn() };
            }),
            postMessage: vi.fn().mockResolvedValue(true),
            cspSource: "test-csp",
        },
        onDidDispose: vi.fn((listener: any) => {
            return { dispose: vi.fn() };
        }),
        _messageListeners: messageListeners,
    };
}

function makeCancellationToken() {
    return { isCancellationRequested: false } as any;
}

/** Standard document text with one active and one completed task. */
const STANDARD_DOC = [
    "# To do",
    "",
    "- [ ] active task one",
    "",
    "# Completed",
    "",
    "- [x] done task",
    "      _Completed 2026-04-10_",
].join("\n");

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("TodoEditorProvider", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    // --- Constructor ---

    describe("constructor", () => {
        it("should accept all parameters without error", () => {
            const provider = new TodoEditorProvider(
                makeManifest(),
                makeExtensionUri(),
                { getExpansionEntries: vi.fn(() => []) },
                { getAllSnippets: vi.fn(() => []) } as any,
            );
            expect(provider).toBeDefined();
        });

        it("should work with optional parameters omitted", () => {
            const provider = new TodoEditorProvider(
                makeManifest(),
                makeExtensionUri(),
            );
            expect(provider).toBeDefined();
        });
    });

    // --- static register ---

    describe("register", () => {
        it("should register the custom editor provider", () => {
            const provider = new TodoEditorProvider(makeManifest(), makeExtensionUri());
            const context = { subscriptions: [] } as any;
            const disposable = TodoEditorProvider.register(context, provider);

            expect(vscode.window.registerCustomEditorProvider).toHaveBeenCalledWith(
                "memoria.todoEditor",
                provider,
                expect.objectContaining({ webviewOptions: { retainContextWhenHidden: true } }),
            );
            expect(disposable).toBeDefined();
        });
    });

    // --- refreshContactTooltips ---

    describe("refreshContactTooltips", () => {
        it("should call all registered pushers", async () => {
            const expansionMap = {
                getExpansionEntries: vi.fn(() => [
                    { text: "@john", contact: { name: "John" } },
                ]),
            };
            const provider = new TodoEditorProvider(
                makeManifest(),
                makeExtensionUri(),
                expansionMap as any,
            );

            const panel = makeMockPanel();
            const doc = makeMockDocument("# To do\n\n# Completed\n");
            await provider.resolveCustomTextEditor(doc, panel as any, makeCancellationToken());

            panel.webview.postMessage.mockClear();

            // Act
            provider.refreshContactTooltips();

            // Assert — should have posted contactTooltips message
            expect(panel.webview.postMessage).toHaveBeenCalledWith(
                expect.objectContaining({ type: "contactTooltips" }),
            );
        });

        it("should be a no-op when no panels are registered", () => {
            const provider = new TodoEditorProvider(makeManifest(), makeExtensionUri());
            expect(() => provider.refreshContactTooltips()).not.toThrow();
        });
    });

    // --- resolveCustomTextEditor ---

    describe("resolveCustomTextEditor", () => {
        it("should set webview HTML containing CSP and script tag", async () => {
            const provider = new TodoEditorProvider(makeManifest(), makeExtensionUri());
            const panel = makeMockPanel();
            const doc = makeMockDocument("# To do\n\n# Completed\n");

            await provider.resolveCustomTextEditor(doc, panel as any, makeCancellationToken());

            expect(panel.webview.html).toContain("Content-Security-Policy");
            expect(panel.webview.html).toContain("<script");
            expect(panel.webview.html).toContain("Todo Editor");
        });

        it("should register a message listener on the webview", async () => {
            const provider = new TodoEditorProvider(makeManifest(), makeExtensionUri());
            const panel = makeMockPanel();
            const doc = makeMockDocument("# To do\n\n# Completed\n");

            await provider.resolveCustomTextEditor(doc, panel as any, makeCancellationToken());

            expect(panel.webview.onDidReceiveMessage).toHaveBeenCalled();
            expect(panel._messageListeners.length).toBeGreaterThanOrEqual(1);
        });

        it("should post an initial update message after setup", async () => {
            const provider = new TodoEditorProvider(makeManifest(), makeExtensionUri());
            const panel = makeMockPanel();
            const doc = makeMockDocument("# To do\n\n# Completed\n");

            await provider.resolveCustomTextEditor(doc, panel as any, makeCancellationToken());

            expect(panel.webview.postMessage).toHaveBeenCalledWith(
                expect.objectContaining({ type: "update" }),
            );
        });
    });

    // --- Message handler ---

    describe("message handler", () => {
        async function setupWithMessageHandler(text = STANDARD_DOC) {
            const manifest = makeManifest();
            const provider = new TodoEditorProvider(manifest, makeExtensionUri());
            const panel = makeMockPanel();
            const doc = makeMockDocument(text);

            await provider.resolveCustomTextEditor(doc, panel as any, makeCancellationToken());

            // The last registered listener is the main message handler
            const handler = panel._messageListeners[panel._messageListeners.length - 1];
            return { provider, panel, doc, handler };
        }

        it("should handle 'complete' message by applying edit to document", async () => {
            const { handler } = await setupWithMessageHandler();

            await handler({ type: "complete", id: "a-0" });

            // applyEdit is called to persist the change
            expect(vscode.workspace.applyEdit).toHaveBeenCalled();
        });

        it("should handle 'addTask' message by applying edit to document", async () => {
            const { handler } = await setupWithMessageHandler();

            await handler({ type: "addTask", text: "new task" });

            expect(vscode.workspace.applyEdit).toHaveBeenCalled();
        });

        it("should handle 'deleteTask' message by applying edit to document", async () => {
            const { handler } = await setupWithMessageHandler();

            await handler({ type: "deleteTask", id: "a-0" });

            expect(vscode.workspace.applyEdit).toHaveBeenCalled();
        });

        it("should handle 'uncomplete' message by applying edit to document", async () => {
            const { handler } = await setupWithMessageHandler();

            await handler({ type: "uncomplete", id: "c-0" });

            expect(vscode.workspace.applyEdit).toHaveBeenCalled();
        });

        it("should ignore 'complete' message with invalid task id", async () => {
            const { handler } = await setupWithMessageHandler();
            vi.mocked(vscode.workspace.applyEdit).mockClear();

            await handler({ type: "complete", id: "invalid" });

            expect(vscode.workspace.applyEdit).not.toHaveBeenCalled();
        });

        it("should handle 'ready' message by posting update", async () => {
            const { handler, panel } = await setupWithMessageHandler();
            panel.webview.postMessage.mockClear();

            await handler({ type: "ready" });

            expect(panel.webview.postMessage).toHaveBeenCalledWith(
                expect.objectContaining({ type: "update" }),
            );
        });

        it("should handle 'scan' message by executing syncTasks command", async () => {
            const { handler } = await setupWithMessageHandler();

            await handler({ type: "scan" });

            expect(vscode.commands.executeCommand).toHaveBeenCalledWith("memoria.syncTasks");
        });
    });
});
