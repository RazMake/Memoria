import { describe, it, expect, vi, beforeEach } from "vitest";

// ────────────────────────────────────────────────────────────────────────────
// Hoisted mock state
// ────────────────────────────────────────────────────────────────────────────
const showTextDocument = vi.fn().mockResolvedValue(undefined);
const showQuickPick = vi.fn();
const openTextDocument = vi.fn();
const readDirectory = vi.fn();
const fsStat = vi.fn();
const fsWriteFile = vi.fn().mockResolvedValue(undefined);
const tabGroupsClose = vi.fn().mockResolvedValue(undefined);

vi.mock("vscode", () => ({
    Uri: {
        joinPath: (base: any, ...segs: string[]) => ({
            path: [base.path, ...segs].join("/"),
            toString: () => [base.path, ...segs].join("/"),
        }),
    },
    Position: class { constructor(public line: number, public ch: number) {} },
    Selection: class { constructor(public a: any, public b: any) {} },
    Range: class { constructor(public a: any, public b: any) {} },
    ViewColumn: { Active: 1, Beside: 2 },
    TextEditorRevealType: { InCenter: 2 },
    FileType: { File: 1, Directory: 2 },
    TabInputText: class { constructor(public uri: any) {} },
    window: {
        showTextDocument: (...a: any[]) => showTextDocument(...a),
        showQuickPick: (...a: any[]) => showQuickPick(...a),
        tabGroups: {
            all: [] as any[],
            close: (...a: any[]) => tabGroupsClose(...a),
        },
    },
    workspace: {
        openTextDocument: (...a: any[]) => openTextDocument(...a),
        fs: {
            readDirectory: (...a: any[]) => readDirectory(...a),
            stat: (...a: any[]) => fsStat(...a),
            writeFile: (...a: any[]) => fsWriteFile(...a),
        },
    },
}));

// ────────────────────────────────────────────────────────────────────────────
// Helper-module mocks
// ────────────────────────────────────────────────────────────────────────────
const parseTodoDocument = vi.fn();
const completeTask = vi.fn(() => ["completed-raw"]);
const uncompleteTask = vi.fn(() => ["active-raw"]);
const addTaskRawLines = vi.fn(() => ["new-raw"]);
const updateTaskBody = vi.fn(() => ["updated-raw"]);
const serializeDocument = vi.fn(() => "SERIALIZED");
const stripHangingIndent = vi.fn((b: string) => b);

vi.mock("../../../../src/features/todoEditor/documentSerializer", () => ({
    parseTodoDocument: (...a: any[]) => parseTodoDocument(...a),
    completeTask: (...a: any[]) => completeTask(...a),
    uncompleteTask: (...a: any[]) => uncompleteTask(...a),
    addTaskRawLines: (...a: any[]) => addTaskRawLines(...a),
    updateTaskBody: (...a: any[]) => updateTaskBody(...a),
    serializeDocument: (...a: any[]) => serializeDocument(...a),
    stripHangingIndent: (...a: any[]) => stripHangingIndent(...a),
}));

const toggleNthCheckbox = vi.fn();
vi.mock("../../../../src/features/todoEditor/todoTaskHelpers", () => ({
    toggleNthCheckbox: (...a: any[]) => toggleNthCheckbox(...a),
}));

const writeBackToSource = vi.fn().mockResolvedValue(undefined);
const markRemovedInSource = vi.fn().mockResolvedValue(undefined);
vi.mock("../../../../src/features/todoEditor/todoSourceSync", () => ({
    writeBackToSource: (...a: any[]) => writeBackToSource(...a),
    markRemovedInSource: (...a: any[]) => markRemovedInSource(...a),
}));

import { handleTodoEditorMessage, type TodoEditorMessageContext } from "../../../../src/features/todoEditor/todoEditorMessageHandler";

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────
function makeTask(overrides: any = {}): any {
    return {
        indent: 0,
        indentText: "",
        checked: false,
        firstLineText: "Task",
        continuationLines: [],
        bodyRange: { startLine: 0, endLine: 0 },
        body: "Task",
        rawLines: ["- [ ] Task"],
        section: "active",
        bodyWithoutSuffix: "Task",
        suffix: null,
        ...overrides,
    };
}

const ROOT = { path: "/workspace", toString: () => "/workspace" } as any;

function makeCtx(overrides: Partial<TodoEditorMessageContext> = {}): TodoEditorMessageContext {
    const postMessage = vi.fn();
    return {
        document: { uri: { path: "/workspace/TODO.md" }, getText: () => "DOC", lineCount: 0, lineAt: vi.fn() } as any,
        webviewPanel: { viewColumn: 1, webview: { postMessage } } as any,
        workspaceRoot: ROOT,
        cachedSourceByBody: null,
        snippetProvider: undefined,
        pushUpdate: vi.fn(),
        pushContactTooltips: vi.fn(),
        applyEdit: vi.fn().mockResolvedValue(undefined),
        syncTasks: vi.fn().mockResolvedValue(undefined),
        refreshTaskIndex: vi.fn().mockResolvedValue(undefined),
        resolveTask: vi.fn(),
        resetLastPushedText: vi.fn(),
        getLastOpenedSourceUri: vi.fn().mockReturnValue(null),
        setLastOpenedSourceUri: vi.fn(),
        ...overrides,
    } as any;
}

describe("handleTodoEditorMessage", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        serializeDocument.mockReturnValue("SERIALIZED");
        parseTodoDocument.mockReturnValue({ active: [], completed: [] });
    });

    it("ready resets and pushes updates", async () => {
        const ctx = makeCtx();
        await handleTodoEditorMessage({ type: "ready" } as any, ctx);
        expect(ctx.resetLastPushedText).toHaveBeenCalled();
        expect(ctx.pushUpdate).toHaveBeenCalled();
        expect(ctx.pushContactTooltips).toHaveBeenCalled();
    });

    it("reorder applies a valid permutation", async () => {
        const a0 = makeTask({ body: "A" });
        const a1 = makeTask({ body: "B" });
        parseTodoDocument.mockReturnValue({ active: [a0, a1], completed: [] });
        const ctx = makeCtx();
        await handleTodoEditorMessage({ type: "reorder", ids: ["a-1", "a-0"] } as any, ctx);
        expect(ctx.applyEdit).toHaveBeenCalledWith("SERIALIZED");
    });

    it("reorder ignores a length mismatch", async () => {
        parseTodoDocument.mockReturnValue({ active: [makeTask()], completed: [] });
        const ctx = makeCtx();
        await handleTodoEditorMessage({ type: "reorder", ids: [] } as any, ctx);
        expect(ctx.applyEdit).not.toHaveBeenCalled();
    });

    it("reorder rejects malformed ids", async () => {
        parseTodoDocument.mockReturnValue({ active: [makeTask()], completed: [] });
        const ctx = makeCtx();
        await handleTodoEditorMessage({ type: "reorder", ids: ["x-0"] } as any, ctx);
        expect(ctx.applyEdit).not.toHaveBeenCalled();
    });

    it("reorder rejects out-of-range indices", async () => {
        parseTodoDocument.mockReturnValue({ active: [makeTask()], completed: [] });
        const ctx = makeCtx();
        await handleTodoEditorMessage({ type: "reorder", ids: ["a-9"] } as any, ctx);
        expect(ctx.applyEdit).not.toHaveBeenCalled();
    });

    it("complete moves an active task to completed", async () => {
        const task = makeTask();
        const doc = { active: [task], completed: [] };
        parseTodoDocument.mockReturnValue(doc);
        const ctx = makeCtx({
            resolveTask: vi.fn().mockReturnValue({ task, section: "active", index: 0 }),
        });
        await handleTodoEditorMessage({ type: "complete", id: "a-0" } as any, ctx);
        expect(doc.completed).toHaveLength(1);
        expect(ctx.applyEdit).toHaveBeenCalled();
    });

    it("complete ignores a task that is not active", async () => {
        const task = makeTask();
        parseTodoDocument.mockReturnValue({ active: [], completed: [task] });
        const ctx = makeCtx({
            resolveTask: vi.fn().mockReturnValue({ task, section: "completed", index: 0 }),
        });
        await handleTodoEditorMessage({ type: "complete", id: "c-0" } as any, ctx);
        expect(ctx.applyEdit).not.toHaveBeenCalled();
    });

    it("complete ignores an unresolved task", async () => {
        const ctx = makeCtx({ resolveTask: vi.fn().mockReturnValue(null) });
        await handleTodoEditorMessage({ type: "complete", id: "a-9" } as any, ctx);
        expect(ctx.applyEdit).not.toHaveBeenCalled();
    });

    it("uncomplete moves a completed task back to active", async () => {
        const task = makeTask({ section: "completed", checked: true });
        const doc = { active: [], completed: [task] };
        parseTodoDocument.mockReturnValue(doc);
        const ctx = makeCtx({
            resolveTask: vi.fn().mockReturnValue({ task, section: "completed", index: 0 }),
        });
        await handleTodoEditorMessage({ type: "uncomplete", id: "c-0" } as any, ctx);
        expect(doc.active).toHaveLength(1);
        expect(ctx.applyEdit).toHaveBeenCalled();
    });

    it("uncomplete ignores a task that is not completed", async () => {
        const task = makeTask();
        parseTodoDocument.mockReturnValue({ active: [task], completed: [] });
        const ctx = makeCtx({
            resolveTask: vi.fn().mockReturnValue({ task, section: "active", index: 0 }),
        });
        await handleTodoEditorMessage({ type: "uncomplete", id: "a-0" } as any, ctx);
        expect(ctx.applyEdit).not.toHaveBeenCalled();
    });

    it("addTask prepends a new task", async () => {
        const doc = { active: [], completed: [] };
        parseTodoDocument.mockReturnValue(doc);
        const ctx = makeCtx();
        await handleTodoEditorMessage({ type: "addTask", text: "New\nmore" } as any, ctx);
        expect(doc.active).toHaveLength(1);
        expect(ctx.applyEdit).toHaveBeenCalled();
    });

    it("editTask updates the body and writes back to source when available", async () => {
        const task = makeTask({ suffix: { source: "Notes/a.md" } });
        parseTodoDocument.mockReturnValue({ active: [task], completed: [] });
        const ctx = makeCtx({
            resolveTask: vi.fn().mockReturnValue({ task, section: "active", index: 0 }),
        });
        await handleTodoEditorMessage({ type: "editTask", id: "a-0", newBody: "Updated" } as any, ctx);
        expect(ctx.applyEdit).toHaveBeenCalled();
        expect(writeBackToSource).toHaveBeenCalledWith(ROOT, "Notes/a.md", "Task", "Updated");
    });

    it("editTask skips source write-back when there is no source path", async () => {
        const task = makeTask();
        parseTodoDocument.mockReturnValue({ active: [task], completed: [] });
        const ctx = makeCtx({
            resolveTask: vi.fn().mockReturnValue({ task, section: "active", index: 0 }),
        });
        await handleTodoEditorMessage({ type: "editTask", id: "a-0", newBody: "Updated" } as any, ctx);
        expect(writeBackToSource).not.toHaveBeenCalled();
    });

    it("toggleSubtask applies a change when the body differs", async () => {
        const task = makeTask();
        parseTodoDocument.mockReturnValue({ active: [task], completed: [] });
        toggleNthCheckbox.mockReturnValue("Task changed");
        const ctx = makeCtx({
            resolveTask: vi.fn().mockReturnValue({ task, section: "active", index: 0 }),
        });
        await handleTodoEditorMessage({ type: "toggleSubtask", id: "a-0", index: 0 } as any, ctx);
        expect(ctx.applyEdit).toHaveBeenCalled();
    });

    it("toggleSubtask is a no-op when the body is unchanged", async () => {
        const task = makeTask();
        parseTodoDocument.mockReturnValue({ active: [task], completed: [] });
        toggleNthCheckbox.mockReturnValue("Task");
        const ctx = makeCtx({
            resolveTask: vi.fn().mockReturnValue({ task, section: "active", index: 0 }),
        });
        await handleTodoEditorMessage({ type: "toggleSubtask", id: "a-0", index: 0 } as any, ctx);
        expect(ctx.applyEdit).not.toHaveBeenCalled();
    });

    it("openSource returns early when there is no workspace root", async () => {
        const ctx = makeCtx({ workspaceRoot: null });
        await handleTodoEditorMessage({ type: "openSource", id: "a-0" } as any, ctx);
        expect(showTextDocument).not.toHaveBeenCalled();
    });

    it("openSourceInPlace opens the source in the active column", async () => {
        const task = makeTask({ suffix: { source: "Notes/a.md" } });
        parseTodoDocument.mockReturnValue({ active: [task], completed: [] });
        const ctx = makeCtx({
            resolveTask: vi.fn().mockReturnValue({ task, section: "active", index: 0 }),
        });
        await handleTodoEditorMessage({ type: "openSourceInPlace", id: "a-0" } as any, ctx);
        expect(showTextDocument).toHaveBeenCalled();
    });

    it("openSource (beside) closes a previously opened tab and remembers the new uri", async () => {
        const task = makeTask({ suffix: { source: "Notes/a.md" } });
        parseTodoDocument.mockReturnValue({ active: [task], completed: [] });
        const last = { toString: () => "/workspace/Notes/a.md" };
        const ctx = makeCtx({
            resolveTask: vi.fn().mockReturnValue({ task, section: "active", index: 0 }),
            getLastOpenedSourceUri: vi.fn().mockReturnValue(last as any),
        });
        await handleTodoEditorMessage({ type: "openSource", id: "a-0" } as any, ctx);
        expect(showTextDocument).toHaveBeenCalled();
        expect(ctx.setLastOpenedSourceUri).toHaveBeenCalled();
    });

    it("scan syncs, refreshes and posts syncDone", async () => {
        const ctx = makeCtx();
        await handleTodoEditorMessage({ type: "scan" } as any, ctx);
        expect(ctx.syncTasks).toHaveBeenCalled();
        expect(ctx.refreshTaskIndex).toHaveBeenCalled();
        expect((ctx.webviewPanel.webview.postMessage as any)).toHaveBeenCalledWith({ type: "syncDone" });
    });

    it("deleteTask removes an active task and marks the source", async () => {
        const task = makeTask({ suffix: { source: "Notes/a.md" } });
        const doc = { active: [task], completed: [] };
        parseTodoDocument.mockReturnValue(doc);
        const ctx = makeCtx({
            resolveTask: vi.fn().mockReturnValue({ task, section: "active", index: 0 }),
        });
        await handleTodoEditorMessage({ type: "deleteTask", id: "a-0" } as any, ctx);
        expect(doc.active).toHaveLength(0);
        expect(markRemovedInSource).toHaveBeenCalled();
    });

    it("deleteTask removes a completed task", async () => {
        const task = makeTask({ section: "completed" });
        const doc = { active: [], completed: [task] };
        parseTodoDocument.mockReturnValue(doc);
        const ctx = makeCtx({
            resolveTask: vi.fn().mockReturnValue({ task, section: "completed", index: 0 }),
        });
        await handleTodoEditorMessage({ type: "deleteTask", id: "c-0" } as any, ctx);
        expect(doc.completed).toHaveLength(0);
    });

    it("snippetQuery returns early without a provider", async () => {
        const ctx = makeCtx();
        await handleTodoEditorMessage({ type: "snippetQuery", prefix: "{x" } as any, ctx);
        expect(ctx.webviewPanel.webview.postMessage).not.toHaveBeenCalled();
    });

    it("snippetQuery filters contact snippets for an @ prefix", async () => {
        const snippetProvider: any = {
            getAllSnippets: () => [
                { trigger: "@john", label: "John", description: "" },
                { trigger: "{date", label: "Date", description: "" },
            ],
        };
        const ctx = makeCtx({ snippetProvider });
        await handleTodoEditorMessage({ type: "snippetQuery", prefix: "@jo" } as any, ctx);
        const reply = (ctx.webviewPanel.webview.postMessage as any).mock.calls[0][0];
        expect(reply.items).toHaveLength(1);
        expect(reply.items[0].trigger).toBe("@john");
    });

    it("snippetAccept expands a parameterless body snippet", async () => {
        const snippetProvider: any = {
            getAllSnippets: () => [{ trigger: "{hi", label: "Hi", body: "Hello" }],
        };
        const ctx = makeCtx({ snippetProvider });
        await handleTodoEditorMessage({ type: "snippetAccept", trigger: "{hi" } as any, ctx);
        const reply = (ctx.webviewPanel.webview.postMessage as any).mock.calls[0][0];
        expect(reply).toEqual({ type: "snippetResult", text: "Hello" });
    });

    it("snippetAccept fills a single parameter from the selected text", async () => {
        const snippetProvider: any = {
            getAllSnippets: () => [{
                trigger: "@john",
                label: "John",
                parameters: [{ name: "format", options: ["A", "B"] }],
                expand: (c: any) => `<${c.params.format}>`,
            }],
        };
        const ctx = makeCtx({ snippetProvider });
        await handleTodoEditorMessage({ type: "snippetAccept", trigger: "@john", selectedText: "B" } as any, ctx);
        const reply = (ctx.webviewPanel.webview.postMessage as any).mock.calls[0][0];
        expect(reply.text).toBe("<B>");
    });

    it("snippetAccept cancels when a multi-parameter quick pick is dismissed", async () => {
        const snippetProvider: any = {
            getAllSnippets: () => [{
                trigger: "{x",
                label: "X",
                parameters: [{ name: "a", options: ["1"] }, { name: "b", options: ["2"] }],
                expand: () => "never",
            }],
        };
        showQuickPick.mockResolvedValueOnce(undefined);
        const ctx = makeCtx({ snippetProvider });
        await handleTodoEditorMessage({ type: "snippetAccept", trigger: "{x" } as any, ctx);
        expect(ctx.webviewPanel.webview.postMessage).not.toHaveBeenCalled();
    });

    it("snippetAccept falls back to the trigger when expansion throws", async () => {
        const snippetProvider: any = {
            getAllSnippets: () => [{
                trigger: "{boom",
                label: "Boom",
                expand: () => { throw new Error("boom"); },
            }],
        };
        const ctx = makeCtx({ snippetProvider });
        await handleTodoEditorMessage({ type: "snippetAccept", trigger: "{boom" } as any, ctx);
        const reply = (ctx.webviewPanel.webview.postMessage as any).mock.calls[0][0];
        expect(reply.text).toBe("{boom");
    });

    it("snippetAccept ignores an unknown trigger", async () => {
        const snippetProvider: any = { getAllSnippets: () => [] };
        const ctx = makeCtx({ snippetProvider });
        await handleTodoEditorMessage({ type: "snippetAccept", trigger: "{nope" } as any, ctx);
        expect(ctx.webviewPanel.webview.postMessage).not.toHaveBeenCalled();
    });

    it("linkPathQuery posts directory suggestions with a create-new entry", async () => {
        readDirectory.mockResolvedValue([
            [".hidden", 1],
            ["notes.md", 1],
            ["sub", 2],
        ]);
        const ctx = makeCtx();
        await handleTodoEditorMessage({ type: "linkPathQuery", prefix: "", queryId: 7 } as any, ctx);
        const reply = (ctx.webviewPanel.webview.postMessage as any).mock.calls[0][0];
        expect(reply.type).toBe("linkSuggestions");
        expect(reply.items[0].action).toBe("createFile");
        const labels = reply.items.map((i: any) => i.label);
        expect(labels).toContain("sub/");
        expect(labels).toContain("notes.md");
        expect(labels).not.toContain(".hidden");
    });

    it("linkPathQuery posts an empty list on a read error", async () => {
        readDirectory.mockRejectedValue(new Error("nope"));
        const ctx = makeCtx();
        await handleTodoEditorMessage({ type: "linkPathQuery", prefix: "x/", queryId: 1 } as any, ctx);
        const reply = (ctx.webviewPanel.webview.postMessage as any).mock.calls[0][0];
        expect(reply.items).toEqual([]);
    });

    it("linkHeadingQuery extracts headings from the target document", async () => {
        openTextDocument.mockResolvedValue({ getText: () => "# Title\n## Section\nbody" });
        const ctx = makeCtx();
        await handleTodoEditorMessage({ type: "linkHeadingQuery", path: "doc.md", prefix: "", queryId: 3 } as any, ctx);
        const reply = (ctx.webviewPanel.webview.postMessage as any).mock.calls[0][0];
        const labels = reply.items.map((i: any) => i.label);
        expect(labels).toContain("Title");
        expect(labels).toContain("Section");
    });

    it("linkHeadingQuery posts an empty list when the document cannot be opened", async () => {
        openTextDocument.mockRejectedValue(new Error("missing"));
        const ctx = makeCtx();
        await handleTodoEditorMessage({ type: "linkHeadingQuery", path: "missing.md", prefix: "", queryId: 4 } as any, ctx);
        const reply = (ctx.webviewPanel.webview.postMessage as any).mock.calls[0][0];
        expect(reply.items).toEqual([]);
    });

    it("createLinkedFile returns early on an empty slug", async () => {
        const ctx = makeCtx();
        await handleTodoEditorMessage({ type: "createLinkedFile", linkText: "***", dirPrefix: "" } as any, ctx);
        expect(fsWriteFile).not.toHaveBeenCalled();
    });

    it("createLinkedFile creates a new file when it does not exist", async () => {
        fsStat.mockRejectedValue(new Error("missing"));
        const ctx = makeCtx();
        await handleTodoEditorMessage({ type: "createLinkedFile", linkText: "My Note", dirPrefix: "sub/" } as any, ctx);
        expect(fsWriteFile).toHaveBeenCalled();
        const reply = (ctx.webviewPanel.webview.postMessage as any).mock.calls[0][0];
        expect(reply.type).toBe("fileCreated");
    });

    it("createLinkedFile does not overwrite an existing file", async () => {
        fsStat.mockResolvedValue({});
        const ctx = makeCtx();
        await handleTodoEditorMessage({ type: "createLinkedFile", linkText: "Existing", dirPrefix: "" } as any, ctx);
        expect(fsWriteFile).not.toHaveBeenCalled();
    });
});
