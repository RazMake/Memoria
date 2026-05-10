// Individual message case handlers extracted from TodoEditorProvider.resolveCustomTextEditor().
// Each handler receives a shared context object to avoid coupling to the provider's closure variables.

import * as vscode from "vscode";
import type { ParsedCollectorTask } from "../taskCollector/types";
import type { ToWebviewMessage, ToExtensionMessage, LinkSuggestion } from "./types";
import { parseTodoDocument, completeTask, uncompleteTask, addTaskRawLines, updateTaskBody, serializeDocument, stripHangingIndent, type TodoDocument } from "./documentSerializer";
import { formatISODate } from "../../utils/dateUtils";
import { toHeadingSlug } from "../../utils/headingSlug";
import { toggleNthCheckbox } from "./todoTaskHelpers";
import { writeBackToSource, markRemovedInSource } from "./todoSourceSync";
import type { SnippetProvider } from "../snippets/snippetCompletionProvider";
import { slugifyFilename, ensureMdExtension } from "../../utils/path";

const MAX_SNIPPET_SUGGESTIONS = 20;
const MAX_LINK_SUGGESTIONS = 30;

export interface TodoEditorMessageContext {
    document: vscode.TextDocument;
    webviewPanel: vscode.WebviewPanel;
    workspaceRoot: vscode.Uri | null;
    cachedSourceByBody: Map<string, string> | null;
    snippetProvider?: SnippetProvider;
    pushUpdate: () => void;
    pushContactTooltips: () => void;
    applyEdit: (newText: string) => Promise<void>;
    syncTasks: () => Promise<void>;
    refreshTaskIndex: (root: vscode.Uri | null) => Promise<void>;
    resolveTask: (id: string, doc: TodoDocument) => { task: ParsedCollectorTask; section: "active" | "completed"; index: number } | null;
    resetLastPushedText: () => void;
    getLastOpenedSourceUri: () => vscode.Uri | null;
    setLastOpenedSourceUri: (uri: vscode.Uri | null) => void;
}

export async function handleTodoEditorMessage(
    msg: ToExtensionMessage,
    ctx: TodoEditorMessageContext,
): Promise<void> {
    switch (msg.type) {
        case "ready":
            ctx.resetLastPushedText();
            ctx.pushUpdate();
            ctx.pushContactTooltips();
            break;
        case "reorder":
            await handleReorder(msg, ctx);
            break;
        case "complete":
            await handleComplete(msg, ctx);
            break;
        case "uncomplete":
            await handleUncomplete(msg, ctx);
            break;
        case "addTask":
            await handleAddTask(msg, ctx);
            break;
        case "editTask":
            await handleEditTask(msg, ctx);
            break;
        case "toggleSubtask":
            await handleToggleSubtask(msg, ctx);
            break;
        case "openSourceInPlace":
        case "openSource":
            await handleOpenSource(msg, ctx);
            break;
        case "openLink":
            await handleOpenLink(msg, ctx);
            break;
        case "scan":
            await handleScan(ctx);
            break;
        case "deleteTask":
            await handleDeleteTask(msg, ctx);
            break;
        case "snippetQuery":
            handleSnippetQuery(msg, ctx);
            break;
        case "snippetAccept":
            await handleSnippetAccept(msg, ctx);
            break;
        case "linkPathQuery":
            await handleLinkPathQuery(msg, ctx);
            break;
        case "linkHeadingQuery":
            await handleLinkHeadingQuery(msg, ctx);
            break;
        case "createLinkedFile":
            await handleCreateLinkedFile(msg, ctx);
            break;
    }
}

function resolveTaskFromMessage(
    ctx: TodoEditorMessageContext,
    taskId: string,
): { doc: TodoDocument; resolved: { task: ParsedCollectorTask; section: "active" | "completed"; index: number } } | null {
    const doc = parseTodoDocument(ctx.document.getText());
    const resolved = ctx.resolveTask(taskId, doc);
    if (!resolved) return null;
    return { doc, resolved };
}

function resolveSourcePath(task: ParsedCollectorTask, ctx: TodoEditorMessageContext): string | null {
    if (task.suffix?.source) {
        return task.suffix.source;
    }
    return ctx.cachedSourceByBody?.get(task.bodyWithoutSuffix) ?? null;
}

function applyBodyUpdate(task: ParsedCollectorTask, newBody: string): void {
    task.rawLines = updateTaskBody(task, newBody);
    task.bodyWithoutSuffix = newBody;
    task.body = newBody;
    task.firstLineText = newBody.split("\n")[0];
    task.continuationLines = newBody.split("\n").slice(1);
}

async function handleReorder(msg: Extract<ToExtensionMessage, { type: "reorder" }>, ctx: TodoEditorMessageContext): Promise<void> {
    const doc = parseTodoDocument(ctx.document.getText());
    const activeLen = doc.active.length;
    if (msg.ids.length !== activeLen) return;

    const reordered = new Array<ParsedCollectorTask>(activeLen);
    for (let i = 0; i < activeLen; i++) {
        const id = msg.ids[i];
        // Active task IDs are always "a-<index>", extract index directly.
        const dashPos = id.indexOf("-");
        if (dashPos < 0 || id[0] !== "a") return;
        const idx = parseInt(id.slice(dashPos + 1), 10);
        if (idx >= activeLen || idx < 0) return;
        reordered[i] = doc.active[idx];
    }
    doc.active = reordered;
    await ctx.applyEdit(serializeDocument(doc));
}

async function handleComplete(msg: Extract<ToExtensionMessage, { type: "complete" }>, ctx: TodoEditorMessageContext): Promise<void> {
    const result = resolveTaskFromMessage(ctx, msg.id);
    if (!result || result.resolved.section !== "active") return;
    const { doc, resolved } = result;
    const [removed] = doc.active.splice(resolved.index, 1);
    const completedRawLines = completeTask(removed, formatISODate(new Date()));
    const completedTask = { ...removed, rawLines: completedRawLines, checked: true, section: "completed" as const };
    doc.completed.unshift(completedTask);
    await ctx.applyEdit(serializeDocument(doc));
}

async function handleUncomplete(msg: Extract<ToExtensionMessage, { type: "uncomplete" }>, ctx: TodoEditorMessageContext): Promise<void> {
    const result = resolveTaskFromMessage(ctx, msg.id);
    if (!result || result.resolved.section !== "completed") return;
    const { doc, resolved } = result;
    const [removed] = doc.completed.splice(resolved.index, 1);
    const activeRawLines = uncompleteTask(removed);
    const activeTask = { ...removed, rawLines: activeRawLines, checked: false, section: "active" as const, suffix: null };
    doc.active.push(activeTask);
    await ctx.applyEdit(serializeDocument(doc));
}

async function handleAddTask(msg: Extract<ToExtensionMessage, { type: "addTask" }>, ctx: TodoEditorMessageContext): Promise<void> {
    const doc = parseTodoDocument(ctx.document.getText());
    const rawLines = addTaskRawLines(msg.text);
    const newTask: ParsedCollectorTask = {
        indent: 0,
        indentText: "",
        checked: false,
        firstLineText: msg.text.split("\n")[0],
        continuationLines: msg.text.split("\n").slice(1),
        bodyRange: { startLine: 0, endLine: 0 },
        body: msg.text,
        rawLines,
        section: "active",
        bodyWithoutSuffix: msg.text,
        suffix: null,
    };
    doc.active.unshift(newTask);
    await ctx.applyEdit(serializeDocument(doc));
}

async function handleEditTask(msg: Extract<ToExtensionMessage, { type: "editTask" }>, ctx: TodoEditorMessageContext): Promise<void> {
    const result = resolveTaskFromMessage(ctx, msg.id);
    if (!result) return;
    const { doc, resolved } = result;
    const found = resolved.task;
    const oldBody = found.bodyWithoutSuffix;

    applyBodyUpdate(found, msg.newBody);
    await ctx.applyEdit(serializeDocument(doc));

    const sourcePath = resolveSourcePath(found, ctx);
    if (ctx.workspaceRoot && sourcePath) {
        await writeBackToSource(ctx.workspaceRoot, sourcePath, oldBody, msg.newBody);
    }
}

async function handleToggleSubtask(msg: Extract<ToExtensionMessage, { type: "toggleSubtask" }>, ctx: TodoEditorMessageContext): Promise<void> {
    const result = resolveTaskFromMessage(ctx, msg.id);
    if (!result) return;
    const { doc, resolved } = result;
    const found = resolved.task;

    const cleanBody = stripHangingIndent(found.bodyWithoutSuffix);
    const newBody = toggleNthCheckbox(cleanBody, msg.index, formatISODate(new Date()));
    if (newBody === cleanBody) return;

    applyBodyUpdate(found, newBody);
    await ctx.applyEdit(serializeDocument(doc));
}

async function handleOpenSource(msg: Extract<ToExtensionMessage, { type: "openSource" | "openSourceInPlace" }>, ctx: TodoEditorMessageContext): Promise<void> {
    if (!ctx.workspaceRoot) return;
    const result = resolveTaskFromMessage(ctx, msg.id);
    if (!result) return;
    const { resolved } = result;

    const sourcePath = resolveSourcePath(resolved.task, ctx);
    if (!sourcePath) return;

    const sourceUri = vscode.Uri.joinPath(ctx.workspaceRoot, sourcePath);

    if (msg.type === "openSourceInPlace") {
        const activeGroup = ctx.webviewPanel.viewColumn ?? vscode.ViewColumn.Active;
        await vscode.window.showTextDocument(sourceUri, {
            viewColumn: activeGroup,
            preserveFocus: false,
        });
    } else {
        const lastOpenedSourceUri = ctx.getLastOpenedSourceUri();
        if (lastOpenedSourceUri) {
            const tabs = vscode.window.tabGroups.all
                .flatMap(g => g.tabs)
                .filter(t =>
                    t.input instanceof vscode.TabInputText
                    && t.input.uri.toString() === lastOpenedSourceUri.toString(),
                );
            for (const tab of tabs) {
                await vscode.window.tabGroups.close(tab);
            }
        }
        await vscode.window.showTextDocument(sourceUri, {
            viewColumn: vscode.ViewColumn.Beside,
            preserveFocus: true,
        });
        ctx.setLastOpenedSourceUri(sourceUri);
    }
}

async function handleOpenLink(msg: Extract<ToExtensionMessage, { type: "openLink" }>, ctx: TodoEditorMessageContext): Promise<void> {
    const docDir = vscode.Uri.joinPath(ctx.document.uri, "..");
    const href = msg.href;
    const hashIdx = href.indexOf("#");
    const filePath = hashIdx >= 0 ? href.slice(0, hashIdx) : href;
    const anchor = hashIdx >= 0 ? href.slice(hashIdx + 1) : null;
    const targetUri = vscode.Uri.joinPath(docDir, filePath);
    const editor = await vscode.window.showTextDocument(targetUri, {
        viewColumn: vscode.ViewColumn.Beside,
        preserveFocus: false,
    });
    if (anchor && editor) {
        const targetDoc = editor.document;
        const headingSlug = anchor.toLowerCase();
        for (let line = 0; line < targetDoc.lineCount; line++) {
            const lineText = targetDoc.lineAt(line).text;
            const headingMatch = /^#{1,6}\s+(.+)$/.exec(lineText);
            if (headingMatch) {
                const slug = toHeadingSlug(headingMatch[1]);
                if (slug === headingSlug) {
                    const pos = new vscode.Position(line, 0);
                    editor.selection = new vscode.Selection(pos, pos);
                    editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
                    break;
                }
            }
        }
    }
}

async function handleScan(ctx: TodoEditorMessageContext): Promise<void> {
    await ctx.syncTasks();
    await ctx.refreshTaskIndex(ctx.workspaceRoot);
    ctx.pushUpdate();
    ctx.webviewPanel.webview.postMessage({ type: "syncDone" });
}

async function handleDeleteTask(msg: Extract<ToExtensionMessage, { type: "deleteTask" }>, ctx: TodoEditorMessageContext): Promise<void> {
    const result = resolveTaskFromMessage(ctx, msg.id);
    if (!result) return;
    const { doc, resolved } = result;
    const found = resolved.task;

    const sourcePath = resolveSourcePath(found, ctx);

    if (resolved.section === "active") {
        doc.active.splice(resolved.index, 1);
    } else {
        doc.completed.splice(resolved.index, 1);
    }
    await ctx.applyEdit(serializeDocument(doc));

    if (ctx.workspaceRoot && sourcePath) {
        await markRemovedInSource(ctx.workspaceRoot, sourcePath, found.bodyWithoutSuffix);
    }
}

function handleSnippetQuery(msg: Extract<ToExtensionMessage, { type: "snippetQuery" }>, ctx: TodoEditorMessageContext): void {
    if (!ctx.snippetProvider) return;
    const prefix = msg.prefix;
    const all = ctx.snippetProvider.getAllSnippets();
    const isContact = prefix.startsWith("@");
    const filtered = all
        .filter((s) => {
            const matchesPrefix = isContact ? s.trigger.startsWith("@") : s.trigger.startsWith("{");
            if (!matchesPrefix) return false;
            return s.trigger.toLowerCase().startsWith(prefix.toLowerCase())
                || s.label.toLowerCase().includes(prefix.slice(1).toLowerCase());
        })
        .slice(0, MAX_SNIPPET_SUGGESTIONS)
        .map((s) => ({ trigger: s.trigger, label: s.label, description: s.description }));
    const reply: ToWebviewMessage = { type: "snippetSuggestions", items: filtered };
    ctx.webviewPanel.webview.postMessage(reply);
}

async function handleSnippetAccept(msg: Extract<ToExtensionMessage, { type: "snippetAccept" }>, ctx: TodoEditorMessageContext): Promise<void> {
    if (!ctx.snippetProvider) return;
    const all = ctx.snippetProvider.getAllSnippets();
    const snippet = all.find((s) => s.trigger === msg.trigger);
    if (!snippet) return;

    let expanded: string;
    if (snippet.body !== undefined && !snippet.expand && !snippet.parameters?.length) {
        expanded = snippet.body;
    } else {
        const params: Record<string, string> = {};
        if (snippet.parameters?.length) {
            if (snippet.parameters.length === 1 && msg.selectedText) {
                params[snippet.parameters[0].name] = msg.selectedText;
            } else {
                for (const param of snippet.parameters) {
                    const picked = await vscode.window.showQuickPick(
                        param.options ?? [],
                        { placeHolder: `Select ${param.name}` },
                    );
                    if (picked === undefined) { break; }
                    params[param.name] = picked;
                }
                if (snippet.parameters.some((p) => !(p.name in params))) return;
            }
        }

        if (snippet.expand) {
            try {
                expanded = snippet.expand({
                    document: null,
                    position: null,
                    params,
                    contacts: [],
                });
            } catch {
                expanded = snippet.trigger;
            }
        } else if (snippet.body !== undefined) {
            expanded = snippet.body;
        } else {
            expanded = snippet.trigger;
        }
    }

    const result: ToWebviewMessage = { type: "snippetResult", text: expanded };
    ctx.webviewPanel.webview.postMessage(result);
}

async function handleLinkPathQuery(msg: Extract<ToExtensionMessage, { type: "linkPathQuery" }>, ctx: TodoEditorMessageContext): Promise<void> {
    const docDir = vscode.Uri.joinPath(ctx.document.uri, "..");
    const prefix = msg.prefix;
    try {
        const lastSlash = prefix.lastIndexOf("/");
        const dirPrefix = lastSlash >= 0 ? prefix.slice(0, lastSlash) : "";
        const filePrefix = lastSlash >= 0 ? prefix.slice(lastSlash + 1) : prefix;
        const searchDir = dirPrefix ? vscode.Uri.joinPath(docDir, dirPrefix) : docDir;

        const entries = await vscode.workspace.fs.readDirectory(searchDir);
        const suggestions: LinkSuggestion[] = [];
        const lowerPrefix = filePrefix.toLowerCase();
        for (const [name, fileType] of entries) {
            if (name.startsWith(".")) continue;
            if (lowerPrefix && !name.toLowerCase().startsWith(lowerPrefix)) continue;
            const isDir = fileType === vscode.FileType.Directory;
            const insertPath = dirPrefix ? `${dirPrefix}/${name}` : name;
            suggestions.push({
                label: name + (isDir ? "/" : ""),
                insertText: insertPath + (isDir ? "/" : ""),
                description: isDir ? "folder" : undefined,
            });
        }
        suggestions.sort((a, b) => {
            const aDir = a.label.endsWith("/") ? 0 : 1;
            const bDir = b.label.endsWith("/") ? 0 : 1;
            if (aDir !== bDir) return aDir - bDir;
            return a.label.localeCompare(b.label);
        });
        suggestions.unshift({
            label: '+ Create new file',
            insertText: '',
            description: 'Create a new .md file here',
            action: 'createFile',
        });
        const reply: ToWebviewMessage = { type: "linkSuggestions", items: suggestions.slice(0, MAX_LINK_SUGGESTIONS), queryId: msg.queryId };
        ctx.webviewPanel.webview.postMessage(reply);
    } catch {
        ctx.webviewPanel.webview.postMessage({ type: "linkSuggestions", items: [], queryId: msg.queryId } as ToWebviewMessage);
    }
}

async function handleLinkHeadingQuery(msg: Extract<ToExtensionMessage, { type: "linkHeadingQuery" }>, ctx: TodoEditorMessageContext): Promise<void> {
    const docDir = vscode.Uri.joinPath(ctx.document.uri, "..");
    const targetUri = vscode.Uri.joinPath(docDir, msg.path);
    try {
        const targetDoc = await vscode.workspace.openTextDocument(targetUri);
        const text = targetDoc.getText();
        const headings: LinkSuggestion[] = [];
        const lowerPrefix = msg.prefix.toLowerCase();
        for (const line of text.split(/\r?\n/)) {
            const m = /^(#{1,6})\s+(.+)$/.exec(line);
            if (!m) continue;
            const headingText = m[2].trim();
            const slug = toHeadingSlug(headingText);
            if (lowerPrefix && !headingText.toLowerCase().includes(lowerPrefix) && !slug.includes(lowerPrefix)) continue;
            const level = m[1].length;
            headings.push({
                label: headingText,
                insertText: slug,
                description: `${"#".repeat(level)} heading`,
            });
        }
        const reply: ToWebviewMessage = { type: "linkSuggestions", items: headings.slice(0, MAX_LINK_SUGGESTIONS), queryId: msg.queryId };
        ctx.webviewPanel.webview.postMessage(reply);
    } catch {
        ctx.webviewPanel.webview.postMessage({ type: "linkSuggestions", items: [], queryId: msg.queryId } as ToWebviewMessage);
    }
}

async function handleCreateLinkedFile(msg: Extract<ToExtensionMessage, { type: "createLinkedFile" }>, ctx: TodoEditorMessageContext): Promise<void> {
    const slugified = slugifyFilename(msg.linkText);
    if (!slugified) return;

    const filename = ensureMdExtension(slugified);
    const docDir = vscode.Uri.joinPath(ctx.document.uri, "..");
    const dirPrefix = msg.dirPrefix.replace(/\/+$/, "");
    const targetUri = dirPrefix
        ? vscode.Uri.joinPath(docDir, dirPrefix, filename)
        : vscode.Uri.joinPath(docDir, filename);
    const insertPath = dirPrefix ? `${dirPrefix}/${filename}` : filename;

    try {
        await vscode.workspace.fs.stat(targetUri);
    } catch {
        await vscode.workspace.fs.writeFile(targetUri, new Uint8Array(0));
    }

    const reply: ToWebviewMessage = { type: "fileCreated", insertPath };
    ctx.webviewPanel.webview.postMessage(reply);

    await vscode.window.showTextDocument(targetUri, {
        viewColumn: vscode.ViewColumn.Beside,
        preserveFocus: false,
    });
}
