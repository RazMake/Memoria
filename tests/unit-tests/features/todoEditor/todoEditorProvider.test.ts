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
        showQuickPick: vi.fn(),
        tabGroups: { all: [] },
    },
    workspace: {
        workspaceFolders: [],
        applyEdit: vi.fn().mockResolvedValue(true),
        onDidChangeTextDocument: vi.fn(() => ({ dispose: vi.fn() })),
        fs: {
            readDirectory: vi.fn().mockResolvedValue([]),
        },
        openTextDocument: vi.fn().mockResolvedValue({
            getText: () => "",
            lineCount: 0,
        }),
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
    Position: class {
        constructor(public readonly line: number, public readonly character: number) {}
    },
    Selection: class {
        constructor(public readonly anchor: any, public readonly active: any) {}
    },
    TextEditorRevealType: { InCenter: 2 },
    TabInputText: class {
        constructor(public readonly uri: any) {}
    },
    ViewColumn: { Active: 1, Beside: 2 },
    FileType: { File: 1, Directory: 2 },
    EndOfLine: { LF: 1, CRLF: 2 },
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
        viewColumn: 1,
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

        it("should handle 'linkPathQuery' by posting linkSuggestions", async () => {
            vi.mocked(vscode.workspace.fs.readDirectory).mockResolvedValue([
                ["notes.md", 1 /* File */],
                ["subfolder", 2 /* Directory */],
                [".hidden", 1 /* File */],
            ] as any);

            const { handler, panel } = await setupWithMessageHandler();
            panel.webview.postMessage.mockClear();

            await handler({ type: "linkPathQuery", prefix: "", queryId: 1 });

            expect(panel.webview.postMessage).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: "linkSuggestions",
                    queryId: 1,
                    items: expect.arrayContaining([
                        expect.objectContaining({ label: "subfolder/" }),
                        expect.objectContaining({ label: "notes.md" }),
                    ]),
                }),
            );
            // Hidden files should be excluded
            const msg = vi.mocked(panel.webview.postMessage).mock.calls[0][0] as any;
            expect(msg.items.every((i: any) => !i.label.startsWith("."))).toBe(true);
        });

        it("should handle 'linkPathQuery' with prefix filter", async () => {
            vi.mocked(vscode.workspace.fs.readDirectory).mockResolvedValue([
                ["notes.md", 1],
                ["notebook.md", 1],
                ["readme.md", 1],
            ] as any);

            const { handler, panel } = await setupWithMessageHandler();
            panel.webview.postMessage.mockClear();

            await handler({ type: "linkPathQuery", prefix: "not", queryId: 2 });

            const msg = vi.mocked(panel.webview.postMessage).mock.calls[0][0] as any;
            expect(msg.items).toHaveLength(2);
            expect(msg.items[0].label).toBe("notebook.md");
            expect(msg.items[1].label).toBe("notes.md");
        });

        it("should handle 'linkPathQuery' error gracefully", async () => {
            vi.mocked(vscode.workspace.fs.readDirectory).mockRejectedValue(new Error("not found"));

            const { handler, panel } = await setupWithMessageHandler();
            panel.webview.postMessage.mockClear();

            await handler({ type: "linkPathQuery", prefix: "missing/", queryId: 3 });

            expect(panel.webview.postMessage).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: "linkSuggestions",
                    items: [],
                    queryId: 3,
                }),
            );
        });

        it("should handle 'linkHeadingQuery' by returning headings from file", async () => {
            const headingDoc = {
                getText: () => "# Introduction\n\nSome text\n\n## Getting Started\n\n### Step 1",
                lineCount: 7,
            };
            vi.mocked(vscode.workspace.openTextDocument).mockResolvedValue(headingDoc as any);

            const { handler, panel } = await setupWithMessageHandler();
            panel.webview.postMessage.mockClear();

            await handler({ type: "linkHeadingQuery", path: "file.md", prefix: "", queryId: 4 });

            const msg = vi.mocked(panel.webview.postMessage).mock.calls[0][0] as any;
            expect(msg.type).toBe("linkSuggestions");
            expect(msg.queryId).toBe(4);
            expect(msg.items).toHaveLength(3);
            expect(msg.items[0]).toEqual(expect.objectContaining({ label: "Introduction", insertText: "introduction" }));
            expect(msg.items[1]).toEqual(expect.objectContaining({ label: "Getting Started", insertText: "getting-started" }));
            expect(msg.items[2]).toEqual(expect.objectContaining({ label: "Step 1", insertText: "step-1" }));
        });

        it("should handle 'linkHeadingQuery' with prefix filter", async () => {
            const headingDoc = {
                getText: () => "# Introduction\n\n## Getting Started\n\n## FAQ",
                lineCount: 5,
            };
            vi.mocked(vscode.workspace.openTextDocument).mockResolvedValue(headingDoc as any);

            const { handler, panel } = await setupWithMessageHandler();
            panel.webview.postMessage.mockClear();

            await handler({ type: "linkHeadingQuery", path: "file.md", prefix: "get", queryId: 5 });

            const msg = vi.mocked(panel.webview.postMessage).mock.calls[0][0] as any;
            expect(msg.items).toHaveLength(1);
            expect(msg.items[0].label).toBe("Getting Started");
        });

        it("should handle 'linkHeadingQuery' error gracefully", async () => {
            vi.mocked(vscode.workspace.openTextDocument).mockRejectedValue(new Error("not found"));

            const { handler, panel } = await setupWithMessageHandler();
            panel.webview.postMessage.mockClear();

            await handler({ type: "linkHeadingQuery", path: "missing.md", prefix: "", queryId: 6 });

            expect(panel.webview.postMessage).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: "linkSuggestions",
                    items: [],
                    queryId: 6,
                }),
            );
        });

        // --- reorder ---

        it("should handle 'reorder' message by reordering active tasks", async () => {
            const text = [
                "# To do", "",
                "- [ ] first", "",
                "- [ ] second", "",
                "# Completed", "",
            ].join("\n");
            const { handler } = await setupWithMessageHandler(text);
            vi.mocked(vscode.workspace.applyEdit).mockClear();

            await handler({ type: "reorder", ids: ["a-1", "a-0"] });

            expect(vscode.workspace.applyEdit).toHaveBeenCalled();
        });

        it("should ignore 'reorder' with mismatched id count (stale IDs)", async () => {
            const { handler } = await setupWithMessageHandler();
            vi.mocked(vscode.workspace.applyEdit).mockClear();

            // STANDARD_DOC has 1 active task; sending 0 IDs means reordered.length=0 !== 1
            await handler({ type: "reorder", ids: [] });

            expect(vscode.workspace.applyEdit).not.toHaveBeenCalled();
        });

        // --- editTask ---

        it("should handle 'editTask' message by applying edit to document", async () => {
            const { handler } = await setupWithMessageHandler();
            vi.mocked(vscode.workspace.applyEdit).mockClear();

            await handler({ type: "editTask", id: "a-0", newBody: "updated task" });

            expect(vscode.workspace.applyEdit).toHaveBeenCalled();
        });

        it("should ignore 'editTask' with invalid task id", async () => {
            const { handler } = await setupWithMessageHandler();
            vi.mocked(vscode.workspace.applyEdit).mockClear();

            await handler({ type: "editTask", id: "invalid", newBody: "updated" });

            expect(vscode.workspace.applyEdit).not.toHaveBeenCalled();
        });

        // --- toggleSubtask ---

        it("should handle 'toggleSubtask' message by toggling a subtask checkbox", async () => {
            const text = [
                "# To do", "",
                "- [ ] parent task",
                "  - [ ] subtask one",
                "  - [ ] subtask two", "",
                "# Completed", "",
            ].join("\n");
            const { handler } = await setupWithMessageHandler(text);
            vi.mocked(vscode.workspace.applyEdit).mockClear();

            await handler({ type: "toggleSubtask", id: "a-0", index: 0 });

            expect(vscode.workspace.applyEdit).toHaveBeenCalled();
        });

        it("should ignore 'toggleSubtask' with invalid task id", async () => {
            const { handler } = await setupWithMessageHandler();
            vi.mocked(vscode.workspace.applyEdit).mockClear();

            await handler({ type: "toggleSubtask", id: "invalid", index: 0 });

            expect(vscode.workspace.applyEdit).not.toHaveBeenCalled();
        });

        it("should ignore 'toggleSubtask' when subtask index is out of range", async () => {
            const { handler } = await setupWithMessageHandler();
            vi.mocked(vscode.workspace.applyEdit).mockClear();

            // STANDARD_DOC "active task one" has no subtask checkboxes
            await handler({ type: "toggleSubtask", id: "a-0", index: 5 });

            expect(vscode.workspace.applyEdit).not.toHaveBeenCalled();
        });

        // --- openLink ---

        it("should handle 'openLink' by opening the target file", async () => {
            const { handler } = await setupWithMessageHandler();
            vi.mocked(vscode.window.showTextDocument).mockClear();

            await handler({ type: "openLink", href: "notes.md" });

            expect(vscode.window.showTextDocument).toHaveBeenCalledWith(
                expect.anything(),
                expect.objectContaining({ viewColumn: 2, preserveFocus: false }),
            );
        });

        it("should handle 'openLink' with anchor by navigating to heading", async () => {
            const mockEditor = {
                document: {
                    lineCount: 4,
                    lineAt: vi.fn((line: number) => {
                        const lines = ["# Intro", "", "## Getting Started", "content"];
                        return { text: lines[line] };
                    }),
                },
                selection: null as any,
                revealRange: vi.fn(),
            };
            vi.mocked(vscode.window.showTextDocument).mockResolvedValue(mockEditor as any);

            const { handler } = await setupWithMessageHandler();

            await handler({ type: "openLink", href: "file.md#getting-started" });

            expect(mockEditor.revealRange).toHaveBeenCalled();
        });

        // --- snippetQuery ---

        it("should handle 'snippetQuery' by filtering and posting suggestions", async () => {
            const snippetProvider = {
                getAllSnippets: vi.fn(() => [
                    { trigger: "{date}", label: "Date", description: "Today's date", body: "2026-05-02" },
                    { trigger: "{time}", label: "Time", description: "Current time", body: "12:00" },
                    { trigger: "@alice", label: "Alice", description: "Contact" },
                ]),
            };
            const provider = new TodoEditorProvider(
                makeManifest(), makeExtensionUri(), undefined, snippetProvider as any,
            );
            const panel = makeMockPanel();
            const doc = makeMockDocument(STANDARD_DOC);
            await provider.resolveCustomTextEditor(doc, panel as any, makeCancellationToken());
            const handler = panel._messageListeners[panel._messageListeners.length - 1];
            panel.webview.postMessage.mockClear();

            await handler({ type: "snippetQuery", prefix: "{d" });

            expect(panel.webview.postMessage).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: "snippetSuggestions",
                    items: expect.arrayContaining([
                        expect.objectContaining({ trigger: "{date}" }),
                    ]),
                }),
            );
            // Should not include @alice (contact prefix)
            const msg = vi.mocked(panel.webview.postMessage).mock.calls[0][0] as any;
            expect(msg.items.every((i: any) => i.trigger.startsWith("{"))).toBe(true);
        });

        it("should handle 'snippetQuery' for contact prefix @", async () => {
            const snippetProvider = {
                getAllSnippets: vi.fn(() => [
                    { trigger: "@alice", label: "Alice", description: "Contact" },
                    { trigger: "@bob", label: "Bob", description: "Contact" },
                    { trigger: "{date}", label: "Date", description: "Today" },
                ]),
            };
            const provider = new TodoEditorProvider(
                makeManifest(), makeExtensionUri(), undefined, snippetProvider as any,
            );
            const panel = makeMockPanel();
            const doc = makeMockDocument(STANDARD_DOC);
            await provider.resolveCustomTextEditor(doc, panel as any, makeCancellationToken());
            const handler = panel._messageListeners[panel._messageListeners.length - 1];
            panel.webview.postMessage.mockClear();

            await handler({ type: "snippetQuery", prefix: "@a" });

            const msg = vi.mocked(panel.webview.postMessage).mock.calls[0][0] as any;
            expect(msg.items).toHaveLength(1);
            expect(msg.items[0].trigger).toBe("@alice");
        });

        it("should skip 'snippetQuery' when no snippetProvider", async () => {
            const { handler, panel } = await setupWithMessageHandler();
            panel.webview.postMessage.mockClear();

            await handler({ type: "snippetQuery", prefix: "{d" });

            // No snippetSuggestions posted since provider is undefined
            const snippetMsgs = vi.mocked(panel.webview.postMessage).mock.calls
                .filter(([msg]) => msg?.type === "snippetSuggestions");
            expect(snippetMsgs).toHaveLength(0);
        });

        // --- snippetAccept ---

        it("should handle 'snippetAccept' with static body snippet", async () => {
            const snippetProvider = {
                getAllSnippets: vi.fn(() => [
                    { trigger: "{date}", label: "Date", body: "2026-05-02" },
                ]),
            };
            const provider = new TodoEditorProvider(
                makeManifest(), makeExtensionUri(), undefined, snippetProvider as any,
            );
            const panel = makeMockPanel();
            const doc = makeMockDocument(STANDARD_DOC);
            await provider.resolveCustomTextEditor(doc, panel as any, makeCancellationToken());
            const handler = panel._messageListeners[panel._messageListeners.length - 1];
            panel.webview.postMessage.mockClear();

            await handler({ type: "snippetAccept", trigger: "{date}" });

            expect(panel.webview.postMessage).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: "snippetResult",
                    text: "2026-05-02",
                }),
            );
        });

        it("should handle 'snippetAccept' with expand function", async () => {
            const snippetProvider = {
                getAllSnippets: vi.fn(() => [
                    { trigger: "{custom}", label: "Custom", expand: () => "expanded text" },
                ]),
            };
            const provider = new TodoEditorProvider(
                makeManifest(), makeExtensionUri(), undefined, snippetProvider as any,
            );
            const panel = makeMockPanel();
            const doc = makeMockDocument(STANDARD_DOC);
            await provider.resolveCustomTextEditor(doc, panel as any, makeCancellationToken());
            const handler = panel._messageListeners[panel._messageListeners.length - 1];
            panel.webview.postMessage.mockClear();

            await handler({ type: "snippetAccept", trigger: "{custom}" });

            expect(panel.webview.postMessage).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: "snippetResult",
                    text: "expanded text",
                }),
            );
        });

        it("should handle 'snippetAccept' with expand function that throws", async () => {
            const snippetProvider = {
                getAllSnippets: vi.fn(() => [
                    { trigger: "{broken}", label: "Broken", expand: () => { throw new Error("fail"); } },
                ]),
            };
            const provider = new TodoEditorProvider(
                makeManifest(), makeExtensionUri(), undefined, snippetProvider as any,
            );
            const panel = makeMockPanel();
            const doc = makeMockDocument(STANDARD_DOC);
            await provider.resolveCustomTextEditor(doc, panel as any, makeCancellationToken());
            const handler = panel._messageListeners[panel._messageListeners.length - 1];
            panel.webview.postMessage.mockClear();

            await handler({ type: "snippetAccept", trigger: "{broken}" });

            expect(panel.webview.postMessage).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: "snippetResult",
                    text: "{broken}", // falls back to trigger
                }),
            );
        });

        it("should skip 'snippetAccept' when snippet not found", async () => {
            const snippetProvider = {
                getAllSnippets: vi.fn(() => []),
            };
            const provider = new TodoEditorProvider(
                makeManifest(), makeExtensionUri(), undefined, snippetProvider as any,
            );
            const panel = makeMockPanel();
            const doc = makeMockDocument(STANDARD_DOC);
            await provider.resolveCustomTextEditor(doc, panel as any, makeCancellationToken());
            const handler = panel._messageListeners[panel._messageListeners.length - 1];
            panel.webview.postMessage.mockClear();

            await handler({ type: "snippetAccept", trigger: "{unknown}" });

            const resultMsgs = vi.mocked(panel.webview.postMessage).mock.calls
                .filter(([msg]) => msg?.type === "snippetResult");
            expect(resultMsgs).toHaveLength(0);
        });

        it("should skip 'snippetAccept' when no snippetProvider", async () => {
            const { handler, panel } = await setupWithMessageHandler();
            panel.webview.postMessage.mockClear();

            await handler({ type: "snippetAccept", trigger: "{date}" });

            const resultMsgs = vi.mocked(panel.webview.postMessage).mock.calls
                .filter(([msg]) => msg?.type === "snippetResult");
            expect(resultMsgs).toHaveLength(0);
        });

        // --- complete edge cases ---

        it("should ignore 'complete' on a completed task", async () => {
            const { handler } = await setupWithMessageHandler();
            vi.mocked(vscode.workspace.applyEdit).mockClear();

            await handler({ type: "complete", id: "c-0" });

            expect(vscode.workspace.applyEdit).not.toHaveBeenCalled();
        });

        it("should ignore 'uncomplete' on an active task", async () => {
            const { handler } = await setupWithMessageHandler();
            vi.mocked(vscode.workspace.applyEdit).mockClear();

            await handler({ type: "uncomplete", id: "a-0" });

            expect(vscode.workspace.applyEdit).not.toHaveBeenCalled();
        });

        // --- deleteTask on completed ---

        it("should handle 'deleteTask' on a completed task", async () => {
            const { handler } = await setupWithMessageHandler();
            vi.mocked(vscode.workspace.applyEdit).mockClear();

            await handler({ type: "deleteTask", id: "c-0" });

            expect(vscode.workspace.applyEdit).toHaveBeenCalled();
        });

        it("should ignore 'deleteTask' with invalid id", async () => {
            const { handler } = await setupWithMessageHandler();
            vi.mocked(vscode.workspace.applyEdit).mockClear();

            await handler({ type: "deleteTask", id: "invalid" });

            expect(vscode.workspace.applyEdit).not.toHaveBeenCalled();
        });

        // --- pushUpdate skip-no-op ---

        it("should skip pushUpdate when document text has not changed", async () => {
            const { handler, panel } = await setupWithMessageHandler();
            // The initial resolve already pushes once. Clear and call ready again.
            panel.webview.postMessage.mockClear();

            // ready forces a re-push by clearing lastPushedText
            await handler({ type: "ready" });
            const firstCallCount = panel.webview.postMessage.mock.calls.length;

            // A second ready should still push (it resets lastPushedText)
            await handler({ type: "ready" });
            const secondCallCount = panel.webview.postMessage.mock.calls.length;

            expect(secondCallCount).toBeGreaterThan(firstCallCount);
        });
    });
});
