import * as vscode from "vscode";
import { randomBytes } from "node:crypto";
import MarkdownIt from "markdown-it";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const taskLists = require("markdown-it-task-lists");
import type { ManifestManager } from "../../blueprints/manifestManager";
import type { ParsedCollectorTask } from "../taskCollector/types";
import type { UITask, ToWebviewMessage, ToExtensionMessage } from "./types";
import { parseTodoDocument, completeTask, uncompleteTask, addTaskRawLines, updateTaskBody, serializeDocument, stripHangingIndent, type TodoDocument } from "./documentSerializer";
import { parseTaskBlocks } from "../taskCollector/taskParser";
import { forward } from "../taskCollector/pathRewriter";
import { replaceLineRange } from "../taskCollector/taskWriter";

// A CustomTextEditor is used instead of a plain WebviewPanel so that VS Code's
// built-in file save/dirty tracking, undo/redo stack, and tab management work
// automatically — the extension does not need to reimplement any of that.
export class TodoEditorProvider implements vscode.CustomTextEditorProvider {
    private static readonly viewType = "memoria.todoEditor";
    private readonly md: MarkdownIt;

    constructor(
        private readonly manifest: ManifestManager,
        private readonly extensionUri: vscode.Uri,
    ) {
        this.md = new MarkdownIt({ breaks: true }).use(taskLists, { enabled: true });
    }

    static register(context: vscode.ExtensionContext, provider: TodoEditorProvider): vscode.Disposable {
        return vscode.window.registerCustomEditorProvider(
            TodoEditorProvider.viewType,
            provider,
            { webviewOptions: { retainContextWhenHidden: true } },
        );
    }

    async resolveCustomTextEditor(
        document: vscode.TextDocument,
        webviewPanel: vscode.WebviewPanel,
        _token: vscode.CancellationToken,
    ): Promise<void> {
        // 1. Configure webview and set HTML IMMEDIATELY so the webview JS
        //    starts loading while we do I/O in parallel.
        const distUri = vscode.Uri.joinPath(this.extensionUri, "dist");
        webviewPanel.webview.options = {
            enableScripts: true,
            localResourceRoots: [distUri],
        };

        const nonce = getNonce();
        const webviewJs = webviewPanel.webview.asWebviewUri(vscode.Uri.joinPath(distUri, "webview.js"));
        webviewPanel.webview.html = getHtmlForWebview(webviewPanel.webview, nonce, webviewJs);

        // 2. Wait for webview ready signal.
        //    Without this handshake the first postMessage can arrive before the
        //    webview script has attached its message listener.
        const readyPromise = new Promise<void>((resolve) => {
            const readyListener = webviewPanel.webview.onDidReceiveMessage((msg) => {
                if (msg?.type === "ready") {
                    readyListener.dispose();
                    resolve();
                }
            });
            // Safety: if the webview never sends ready (e.g. script error),
            // fall through after 3 s so the editor isn't permanently blank.
            setTimeout(() => { readyListener.dispose(); resolve(); }, 3000);
        });

        // 3. Find the initialized workspace root concurrently with webview load.
        const roots = vscode.workspace.workspaceFolders?.map(f => f.uri) ?? [];
        const [workspaceRoot] = await Promise.all([
            this.manifest.findInitializedRoot(roots),
            readyPromise,
        ]);

        // 4. Resolve task by stable positional ID from the current document.
        //    IDs use the format "a-<index>" (active) / "c-<index>" (completed)
        //    so they survive across re-renders without a mutable lookup map.
        const resolveTask = (id: string, doc: TodoDocument): { task: ParsedCollectorTask; section: "active" | "completed"; index: number } | null => {
            const m = /^([ac])-(\d+)$/.exec(id);
            if (!m) return null;
            const isCompleted = m[1] === "c";
            const idx = parseInt(m[2], 10);
            const tasks = isCompleted ? doc.completed : doc.active;
            if (idx >= tasks.length) return null;
            return { task: tasks[idx], section: isCompleted ? "completed" : "active", index: idx };
        };

        // 5. Caches: markdown render results, task index, body→source reverse map.
        //    These avoid repeated I/O and O(n) scans on every pushUpdate.
        const mdCache = new Map<string, string>();
        let sourceByBody: Map<string, string> | null = null;
        let lastOpenedSourceUri: vscode.Uri | null = null;

        const refreshTaskIndex = async (): Promise<void> => {
            if (!workspaceRoot) return;
            const stored = await this.manifest.readTaskIndex(workspaceRoot);
            if (stored) {
                // Build a body→source reverse map for O(1) lookup when rendering tasks,
                // avoiding an O(n) index scan per task in pushUpdate.
                sourceByBody = new Map();
                for (const entry of Object.values(stored.tasks)) {
                    if (entry.source) {
                        const collectorBody = forward(entry.body, entry.source, stored.collectorPath);
                        sourceByBody.set(collectorBody, entry.source);
                    }
                }
            }
        };
        await refreshTaskIndex();

        // 6. pushUpdate function — uses caches to avoid redundant work.
        const pushUpdate = () => {
            const text = document.getText();
            const doc = parseTodoDocument(text);

            const toUITask = (task: ParsedCollectorTask, isCompleted: boolean, index: number): UITask => {
                const id = `${isCompleted ? "c" : "a"}-${index}`;

                // Resolve source path via cached reverse map (O(1))
                let sourceRelativePath: string | null = null;
                if (isCompleted && task.suffix?.source) {
                    sourceRelativePath = task.suffix.source;
                } else if (!isCompleted && sourceByBody) {
                    sourceRelativePath = sourceByBody.get(task.bodyWithoutSuffix) ?? null;
                }

                const cleanBody = stripHangingIndent(task.bodyWithoutSuffix);

                // Cached markdown render — only re-render when body text changes
                let bodyHtml = mdCache.get(cleanBody);
                if (!bodyHtml) {
                    bodyHtml = this.md.render(cleanBody);
                    mdCache.set(cleanBody, bodyHtml);
                }

                return {
                    id,
                    bodyHtml,
                    bodyMarkdown: cleanBody,
                    completedDate: isCompleted ? (task.suffix?.completedDate ?? null) : null,
                    sourceRelativePath,
                };
            };

            const active = doc.active.map((t, i) => toUITask(t, false, i));
            const completed = doc.completed.map((t, i) => toUITask(t, true, i));

            const msg: ToWebviewMessage = { type: "update", active, completed };
            webviewPanel.webview.postMessage(msg);
        };

        pushUpdate();

        // 8. Helper to apply edits and save so the task collector's onDidSave
        // handler ingests changes via reconcileCollector (collector-first sync).
        // Do NOT use memoria.syncTasks here — that triggers fullSync which
        // re-renders the collector from the index without reading it first,
        // discarding any new manual tasks.
        const applyEdit = async (newText: string): Promise<void> => {
            const edit = new vscode.WorkspaceEdit();
            edit.replace(
                document.uri,
                new vscode.Range(0, 0, document.lineCount, 0),
                newText,
            );
            await vscode.workspace.applyEdit(edit);
            // Explicit save() triggers onDidSave in TaskCollector, which runs
            // reconcileCollector to ingest collector edits — this is the intended data flow.
            await document.save();
        };

        const syncTasks = async (): Promise<void> => {
            await vscode.commands.executeCommand("memoria.syncTasks");
        };

        const formatDate = (d: Date): string => {
            return d.toISOString().split("T")[0];
        };

        // 9. Message handler
        const messageHandler = async (msg: ToExtensionMessage) => {
            switch (msg.type) {
                case "ready":
                    pushUpdate();
                    break;
                case "reorder": {
                    const doc = parseTodoDocument(document.getText());
                    const reordered: ParsedCollectorTask[] = [];
                    for (const id of msg.ids) {
                        const resolved = resolveTask(id, doc);
                        if (resolved) reordered.push(resolved.task);
                    }
                    // Guard against stale IDs: if any ID failed to resolve the list will
                    // be shorter than doc.active, and applying it would silently drop tasks.
                    if (reordered.length === doc.active.length) {
                        doc.active = reordered;
                        await applyEdit(serializeDocument(doc));
                    }
                    break;
                }
                case "complete": {
                    const doc = parseTodoDocument(document.getText());
                    const resolved = resolveTask(msg.id, doc);
                    if (!resolved || resolved.section !== "active") break;
                    const [removed] = doc.active.splice(resolved.index, 1);
                    const completedRawLines = completeTask(removed, formatDate(new Date()));
                    const completedTask = { ...removed, rawLines: completedRawLines, checked: true, section: "completed" as const };
                    doc.completed.unshift(completedTask);
                    await applyEdit(serializeDocument(doc));
                    break;
                }
                case "uncomplete": {
                    const doc = parseTodoDocument(document.getText());
                    const resolved = resolveTask(msg.id, doc);
                    if (!resolved || resolved.section !== "completed") break;
                    const [removed] = doc.completed.splice(resolved.index, 1);
                    const activeRawLines = uncompleteTask(removed);
                    const activeTask = { ...removed, rawLines: activeRawLines, checked: false, section: "active" as const, suffix: null };
                    doc.active.push(activeTask);
                    await applyEdit(serializeDocument(doc));
                    break;
                }
                case "addTask": {
                    const doc = parseTodoDocument(document.getText());
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
                    await applyEdit(serializeDocument(doc));
                    break;
                }
                case "editTask": {
                    const doc = parseTodoDocument(document.getText());
                    const resolved = resolveTask(msg.id, doc);
                    if (!resolved) break;
                    const found = resolved.task;
                    const oldBody = found.bodyWithoutSuffix;

                    const newRawLines = updateTaskBody(found, msg.newBody);
                    found.rawLines = newRawLines;
                    found.bodyWithoutSuffix = msg.newBody;
                    found.body = msg.newBody;
                    found.firstLineText = msg.newBody.split("\n")[0];
                    found.continuationLines = msg.newBody.split("\n").slice(1);

                    await applyEdit(serializeDocument(doc));

                    // Source file write-back for collected tasks
                    if (workspaceRoot && found.suffix?.source) {
                        await writeBackToSource(workspaceRoot, found.suffix.source, oldBody, msg.newBody);
                    } else if (workspaceRoot && sourceByBody) {
                        const src = sourceByBody.get(oldBody);
                        if (src) {
                            await writeBackToSource(workspaceRoot, src, oldBody, msg.newBody);
                        }
                    }

                    break;
                }
                case "toggleSubtask": {
                    const doc = parseTodoDocument(document.getText());
                    const resolved = resolveTask(msg.id, doc);
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

                    await applyEdit(serializeDocument(doc));
                    break;
                }
                case "openSourceInPlace":
                case "openSource": {
                    if (!workspaceRoot) break;
                    const doc = parseTodoDocument(document.getText());
                    const resolved = resolveTask(msg.id, doc);
                    if (!resolved) break;
                    const found = resolved.task;

                    let sourcePath: string | null = null;
                    if (found.suffix?.source) {
                        sourcePath = found.suffix.source;
                    } else if (sourceByBody) {
                        sourcePath = sourceByBody.get(found.bodyWithoutSuffix) ?? null;
                    }

                    if (sourcePath) {
                        const sourceUri = vscode.Uri.joinPath(workspaceRoot, sourcePath);

                        if (msg.type === "openSourceInPlace") {
                            // Open in the same tab group as the todo editor
                            const activeGroup = webviewPanel.viewColumn ?? vscode.ViewColumn.Active;
                            await vscode.window.showTextDocument(sourceUri, {
                                viewColumn: activeGroup,
                                preserveFocus: false,
                            });
                        } else {
                            // Close the previous source file opened by this action
                            // to avoid accumulating side-by-side editors.
                            if (lastOpenedSourceUri) {
                                const tabs = vscode.window.tabGroups.all
                                    .flatMap(g => g.tabs)
                                    .filter(t =>
                                        t.input instanceof vscode.TabInputText
                                        && t.input.uri.toString() === lastOpenedSourceUri!.toString(),
                                    );
                                for (const tab of tabs) {
                                    await vscode.window.tabGroups.close(tab);
                                }
                            }
                            await vscode.window.showTextDocument(sourceUri, {
                                viewColumn: vscode.ViewColumn.Beside,
                                preserveFocus: true,
                            });
                            lastOpenedSourceUri = sourceUri;
                        }
                    }
                    break;
                }
                case "scan": {
                    await syncTasks();
                    await refreshTaskIndex();
                    pushUpdate();
                    webviewPanel.webview.postMessage({ type: "syncDone" });
                    break;
                }
                case "deleteTask": {
                    const doc = parseTodoDocument(document.getText());
                    const resolved = resolveTask(msg.id, doc);
                    if (!resolved) break;
                    const found = resolved.task;

                    // Resolve source path for the task
                    let sourcePath: string | null = null;
                    if (found.suffix?.source) {
                        sourcePath = found.suffix.source;
                    } else if (sourceByBody) {
                        sourcePath = sourceByBody.get(found.bodyWithoutSuffix) ?? null;
                    }

                    // Remove from collector document
                    if (resolved.section === "active") {
                        doc.active.splice(resolved.index, 1);
                    } else {
                        doc.completed.splice(resolved.index, 1);
                    }
                    await applyEdit(serializeDocument(doc));

                    // If collected from a source file, mark as removed in source
                    if (workspaceRoot && sourcePath) {
                        await markRemovedInSource(workspaceRoot, sourcePath, found.bodyWithoutSuffix);
                    }
                    break;
                }
            }
        };

        // 10. Register disposables
        const disposables: vscode.Disposable[] = [];

        disposables.push(
            webviewPanel.webview.onDidReceiveMessage(messageHandler),
        );

        disposables.push(
            vscode.workspace.onDidChangeTextDocument(e => {
                if (e.document.uri.toString() === document.uri.toString()) {
                    void refreshTaskIndex().then(pushUpdate);
                }
            }),
        );

        webviewPanel.onDidDispose(() => {
            for (const d of disposables) d.dispose();
        });
    }
}

// Propagates task body edits from the collector file back to the original source file.
// The collector is a view of collected tasks; the source file is the authoritative location,
// so both must stay in sync when the user edits a task in the Todo Editor.
async function writeBackToSource(
    workspaceRoot: vscode.Uri,
    sourceRelativePath: string,
    oldBody: string,
    newBody: string,
): Promise<void> {
    const sourceUri = vscode.Uri.joinPath(workspaceRoot, sourceRelativePath);
    try {
        const sourceDoc = await vscode.workspace.openTextDocument(sourceUri);
        const sourceText = sourceDoc.getText();
        const blocks = parseTaskBlocks(sourceText);
        const match = blocks.find(b => b.body === oldBody);
        if (!match) {
            vscode.window.showWarningMessage("Memoria: Could not find task in source file — .todo.md updated only.");
            return;
        }
        const eol = sourceDoc.eol === vscode.EndOfLine.CRLF ? "\r\n" : "\n";
        const bodyLines = newBody.split("\n");
        const firstLine = `${match.indentText}- [${match.checked ? "x" : " "}] ${bodyLines[0]}`;
        const hangPrefix = match.indentText ? `${match.indentText}      ` : "      ";
        const continuations = bodyLines.slice(1).map(l => `${hangPrefix}${l}`);
        const newBlockText = [firstLine, ...continuations].join("\n");
        const newText = replaceLineRange(sourceText, match.bodyRange.startLine, match.bodyRange.endLine, newBlockText, eol);
        const edit = new vscode.WorkspaceEdit();
        edit.replace(sourceUri, new vscode.Range(0, 0, sourceDoc.lineCount, 0), newText);
        await vscode.workspace.applyEdit(edit);
        const updated = await vscode.workspace.openTextDocument(sourceUri);
        await updated.save();
    } catch {
        vscode.window.showWarningMessage("Memoria: Could not find task in source file — .todo.md updated only.");
    }
}

// Marks a deleted task as "(Removed)" in the source file rather than deleting it outright.
// Non-destructive: the user may have meaningful context around the task in the source
// that should be preserved for manual review and cleanup.
async function markRemovedInSource(
    workspaceRoot: vscode.Uri,
    sourceRelativePath: string,
    body: string,
): Promise<void> {
    const sourceUri = vscode.Uri.joinPath(workspaceRoot, sourceRelativePath);
    try {
        const sourceDoc = await vscode.workspace.openTextDocument(sourceUri);
        const sourceText = sourceDoc.getText();
        const blocks = parseTaskBlocks(sourceText);
        const match = blocks.find(b => b.body === body);
        if (!match) {
            vscode.window.showWarningMessage("Memoria: Could not find task in source file — collector updated only.");
            return;
        }
        const eol = sourceDoc.eol === vscode.EndOfLine.CRLF ? "\r\n" : "\n";
        const firstLineText = body.split("\n")[0];
        const replacementLine = `${match.indentText}- TODO: (Removed) ${firstLineText}`;
        const newText = replaceLineRange(sourceText, match.bodyRange.startLine, match.bodyRange.endLine, replacementLine, eol);
        const edit = new vscode.WorkspaceEdit();
        edit.replace(sourceUri, new vscode.Range(0, 0, sourceDoc.lineCount, 0), newText);
        await vscode.workspace.applyEdit(edit);
        const updated = await vscode.workspace.openTextDocument(sourceUri);
        await updated.save();
    } catch {
        vscode.window.showWarningMessage("Memoria: Could not find task in source file — collector updated only.");
    }
}

const SUBTASK_CHECKBOX_RE = /- \[[ xX]\]/;
const SUBTASK_COMPLETED_RE = /^\s*_Completed \d{4}-\d{2}-\d{2}_$/;

function toggleNthCheckbox(body: string, index: number, date: string): string {
    const lines = body.split("\n");
    let count = 0;

    for (let i = 0; i < lines.length; i++) {
        const match = SUBTASK_CHECKBOX_RE.exec(lines[i]);
        if (!match) continue;

        if (count++ !== index) continue;

        const wasUnchecked = lines[i].includes("- [ ]");

        if (wasUnchecked) {
            // Check the box and insert a completed date line after it
            lines[i] = lines[i].replace("- [ ]", "- [x]");
            const indent = lines[i].match(/^(\s*)/)?.[1] ?? "";
            const dateLine = `${indent}  _Completed ${date}_`;
            // Find where to insert: skip any continuation lines that belong to this subtask
            let insertAt = i + 1;
            while (insertAt < lines.length
                && !SUBTASK_CHECKBOX_RE.test(lines[insertAt])
                && !SUBTASK_COMPLETED_RE.test(lines[insertAt])) {
                insertAt++;
            }
            lines.splice(insertAt, 0, dateLine);
        } else {
            // Uncheck the box and remove the completed date line after it
            lines[i] = lines[i].replace(/- \[[xX]\]/, "- [ ]");
            // Look for a completed date line following this subtask
            let dateLineIdx = -1;
            for (let j = i + 1; j < lines.length; j++) {
                if (SUBTASK_CHECKBOX_RE.test(lines[j])) {
                    break;
                }
                if (SUBTASK_COMPLETED_RE.test(lines[j])) {
                    dateLineIdx = j;
                    break;
                }
            }
            if (dateLineIdx >= 0) {
                lines.splice(dateLineIdx, 1);
            }
        }

        return lines.join("\n");
    }

    return body;
}

function getHtmlForWebview(webview: vscode.Webview, nonce: string, scriptUri: vscode.Uri): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'nonce-${nonce}'; script-src 'nonce-${nonce}'; font-src ${webview.cspSource};">
    <title>Todo Editor</title>
</head>
<body>
    <div id="root" data-nonce="${nonce}"></div>
    <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}

function getNonce(): string {
    // CSP nonces must be unguessable — use cryptographically secure random bytes.
    return randomBytes(24).toString("base64url");
}
