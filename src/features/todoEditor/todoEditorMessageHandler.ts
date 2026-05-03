// Individual message case handlers extracted from TodoEditorProvider.resolveCustomTextEditor().
// Each handler receives a shared context object to avoid coupling to the provider's closure variables.

import * as vscode from "vscode";
import type { ParsedCollectorTask } from "../taskCollector/types";
import type { ToWebviewMessage, ToExtensionMessage, LinkSuggestion } from "./types";
import { parseTodoDocument, completeTask, uncompleteTask, addTaskRawLines, updateTaskBody, serializeDocument, stripHangingIndent, type TodoDocument } from "./documentSerializer";
import { toHeadingSlug } from "../../utils/headingSlug";
import { toggleNthCheckbox } from "./todoTaskHelpers";
import { writeBackToSource, markRemovedInSource } from "./todoSourceSync";
import type { SnippetProvider } from "../snippets/snippetCompletionProvider";

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

function formatDate(d: Date): string {
    return d.toISOString().split("T")[0];
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
        case "reorder": {
            const doc = parseTodoDocument(ctx.document.getText());
            const reordered: ParsedCollectorTask[] = [];
            for (const id of msg.ids) {
                const resolved = ctx.resolveTask(id, doc);
                if (resolved) reordered.push(resolved.task);
            }
            if (reordered.length === doc.active.length) {
                doc.active = reordered;
                await ctx.applyEdit(serializeDocument(doc));
            }
            break;
        }
        case "complete": {
            const doc = parseTodoDocument(ctx.document.getText());
            const resolved = ctx.resolveTask(msg.id, doc);
            if (!resolved || resolved.section !== "active") break;
            const [removed] = doc.active.splice(resolved.index, 1);
            const completedRawLines = completeTask(removed, formatDate(new Date()));
            const completedTask = { ...removed, rawLines: completedRawLines, checked: true, section: "completed" as const };
            doc.completed.unshift(completedTask);
            await ctx.applyEdit(serializeDocument(doc));
            break;
        }
        case "uncomplete": {
            const doc = parseTodoDocument(ctx.document.getText());
            const resolved = ctx.resolveTask(msg.id, doc);
            if (!resolved || resolved.section !== "completed") break;
            const [removed] = doc.completed.splice(resolved.index, 1);
            const activeRawLines = uncompleteTask(removed);
            const activeTask = { ...removed, rawLines: activeRawLines, checked: false, section: "active" as const, suffix: null };
            doc.active.push(activeTask);
            await ctx.applyEdit(serializeDocument(doc));
            break;
        }
        case "addTask": {
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
            break;
        }
        case "editTask": {
            const doc = parseTodoDocument(ctx.document.getText());
            const resolved = ctx.resolveTask(msg.id, doc);
            if (!resolved) break;
            const found = resolved.task;
            const oldBody = found.bodyWithoutSuffix;

            const newRawLines = updateTaskBody(found, msg.newBody);
            found.rawLines = newRawLines;
            found.bodyWithoutSuffix = msg.newBody;
            found.body = msg.newBody;
            found.firstLineText = msg.newBody.split("\n")[0];
            found.continuationLines = msg.newBody.split("\n").slice(1);

            await ctx.applyEdit(serializeDocument(doc));

            if (ctx.workspaceRoot && found.suffix?.source) {
                await writeBackToSource(ctx.workspaceRoot, found.suffix.source, oldBody, msg.newBody);
            } else if (ctx.workspaceRoot && ctx.cachedSourceByBody) {
                const src = ctx.cachedSourceByBody.get(oldBody);
                if (src) {
                    await writeBackToSource(ctx.workspaceRoot, src, oldBody, msg.newBody);
                }
            }

            break;
        }
        case "toggleSubtask": {
            const doc = parseTodoDocument(ctx.document.getText());
            const resolved = ctx.resolveTask(msg.id, doc);
            if (!resolved) break;
            const found = resolved.task;

            const cleanBody = stripHangingIndent(found.bodyWithoutSuffix);
            const newBody = toggleNthCheckbox(cleanBody, msg.index, formatDate(new Date()));
            if (newBody === cleanBody) break;

            const newRawLines = updateTaskBody(found, newBody);
            found.rawLines = newRawLines;
            found.bodyWithoutSuffix = newBody;
            found.body = newBody;
            found.firstLineText = newBody.split("\n")[0];
            found.continuationLines = newBody.split("\n").slice(1);

            await ctx.applyEdit(serializeDocument(doc));
            break;
        }
        case "openSourceInPlace":
        case "openSource": {
            if (!ctx.workspaceRoot) break;
            const doc = parseTodoDocument(ctx.document.getText());
            const resolved = ctx.resolveTask(msg.id, doc);
            if (!resolved) break;
            const found = resolved.task;

            let sourcePath: string | null = null;
            if (found.suffix?.source) {
                sourcePath = found.suffix.source;
            } else if (ctx.cachedSourceByBody) {
                sourcePath = ctx.cachedSourceByBody.get(found.bodyWithoutSuffix) ?? null;
            }

            if (sourcePath) {
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
            break;
        }
        case "openLink": {
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
            break;
        }
        case "scan": {
            await ctx.syncTasks();
            await ctx.refreshTaskIndex(ctx.workspaceRoot);
            ctx.pushUpdate();
            ctx.webviewPanel.webview.postMessage({ type: "syncDone" });
            break;
        }
        case "deleteTask": {
            const doc = parseTodoDocument(ctx.document.getText());
            const resolved = ctx.resolveTask(msg.id, doc);
            if (!resolved) break;
            const found = resolved.task;

            let sourcePath: string | null = null;
            if (found.suffix?.source) {
                sourcePath = found.suffix.source;
            } else if (ctx.cachedSourceByBody) {
                sourcePath = ctx.cachedSourceByBody.get(found.bodyWithoutSuffix) ?? null;
            }

            if (resolved.section === "active") {
                doc.active.splice(resolved.index, 1);
            } else {
                doc.completed.splice(resolved.index, 1);
            }
            await ctx.applyEdit(serializeDocument(doc));

            if (ctx.workspaceRoot && sourcePath) {
                await markRemovedInSource(ctx.workspaceRoot, sourcePath, found.bodyWithoutSuffix);
            }
            break;
        }
        case "snippetQuery": {
            if (!ctx.snippetProvider) break;
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
                .slice(0, 20)
                .map((s) => ({ trigger: s.trigger, label: s.label, description: s.description }));
            const reply: ToWebviewMessage = { type: "snippetSuggestions", items: filtered };
            ctx.webviewPanel.webview.postMessage(reply);
            break;
        }
        case "snippetAccept": {
            if (!ctx.snippetProvider) break;
            const all = ctx.snippetProvider.getAllSnippets();
            const snippet = all.find((s) => s.trigger === msg.trigger);
            if (!snippet) break;

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
                        if (snippet.parameters.some((p) => !(p.name in params))) break;
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
            break;
        }
        case "linkPathQuery": {
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
                const reply: ToWebviewMessage = { type: "linkSuggestions", items: suggestions.slice(0, 30), queryId: msg.queryId };
                ctx.webviewPanel.webview.postMessage(reply);
            } catch {
                ctx.webviewPanel.webview.postMessage({ type: "linkSuggestions", items: [], queryId: msg.queryId } as ToWebviewMessage);
            }
            break;
        }
        case "linkHeadingQuery": {
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
                const reply: ToWebviewMessage = { type: "linkSuggestions", items: headings.slice(0, 30), queryId: msg.queryId };
                ctx.webviewPanel.webview.postMessage(reply);
            } catch {
                ctx.webviewPanel.webview.postMessage({ type: "linkSuggestions", items: [], queryId: msg.queryId } as ToWebviewMessage);
            }
            break;
        }
    }
}
