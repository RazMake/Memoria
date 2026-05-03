import * as vscode from "vscode";
import { randomBytes } from "node:crypto";
import MarkdownIt from "markdown-it";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const taskLists = require("markdown-it-task-lists");
import type { ManifestManager } from "../../blueprints/manifestManager";
import type { ParsedCollectorTask } from "../taskCollector/types";
import type { UITask, ToWebviewMessage, ToExtensionMessage, ContactTooltipEntry, LinkSuggestion } from "./types";
import { parseTodoDocument, completeTask, uncompleteTask, addTaskRawLines, updateTaskBody, serializeDocument, stripHangingIndent, type TodoDocument } from "./documentSerializer";
import { parseTaskBlocks } from "../taskCollector/taskParser";
import { forward } from "../taskCollector/pathRewriter";
import { replaceLineRange } from "../taskCollector/taskWriter";
import type { ContactExpansionMap } from "../snippets/snippetHoverProvider";
import type { SnippetProvider } from "../snippets/snippetCompletionProvider";
import { buildContactTooltipMarkdown } from "../contacts/contactTooltip";
import { toHeadingSlug } from "../../utils/headingSlug";

// A CustomTextEditor is used instead of a plain WebviewPanel so that VS Code's
// built-in file save/dirty tracking, undo/redo stack, and tab management work
// automatically — the extension does not need to reimplement any of that.
export class TodoEditorProvider implements vscode.CustomTextEditorProvider {
    private static readonly viewType = "memoria.todoEditor";

    // Lazy-initialized on first editor open to avoid paying construction cost
    // when no .todo.md file is opened during the session.
    private _md: MarkdownIt | null = null;
    private get md(): MarkdownIt {
        return (this._md ??= new MarkdownIt({ breaks: true }).use(taskLists, { enabled: true }));
    }

    // Persistent across editor open/close to avoid re-rendering unchanged tasks.
    private readonly mdCache = new Map<string, string>();

    // Fingerprint of the last document text pushed, used to skip no-op updates.
    private lastPushedText = "";

    // Cached body→source reverse map from the task index; survives tab switches.
    private cachedSourceByBody: Map<string, string> | null = null;

    // Active panels: each open .todo.md editor registers its pushContactTooltips
    // closure so we can push updated tooltip data when the expansion map changes
    // (e.g. contacts load after the editor was already open).
    private readonly activePanelTooltipPushers = new Set<() => void>();

    constructor(
        private readonly manifest: ManifestManager,
        private readonly extensionUri: vscode.Uri,
        private readonly expansionMap?: ContactExpansionMap,
        private readonly snippetProvider?: SnippetProvider,
    ) {}

    static register(context: vscode.ExtensionContext, provider: TodoEditorProvider): vscode.Disposable {
        return vscode.window.registerCustomEditorProvider(
            TodoEditorProvider.viewType,
            provider,
            { webviewOptions: { retainContextWhenHidden: true } },
        );
    }

    /** Re-pushes contact tooltip data to all open todo editor panels. */
    refreshContactTooltips(): void {
        for (const push of this.activePanelTooltipPushers) push();
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
        const webviewCss = webviewPanel.webview.asWebviewUri(vscode.Uri.joinPath(distUri, "webview.css"));
        webviewPanel.webview.html = getHtmlForWebview(webviewPanel.webview, nonce, webviewJs, webviewCss);

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
            // fall through after 1 s so the editor isn't permanently blank.
            setTimeout(() => { readyListener.dispose(); resolve(); }, 1000);
        });

        // 3. Read task index in parallel with webview ready handshake.
        //    refreshTaskIndex is defined before Promise.all so it can be chained
        //    onto findInitializedRoot — the task index read starts as soon as the
        //    workspace root is known, without waiting for the webview ready signal.
        let lastOpenedSourceUri: vscode.Uri | null = null;

        const refreshTaskIndex = async (root: vscode.Uri | null): Promise<void> => {
            if (!root) return;
            const stored = await this.manifest.readTaskIndex(root);
            if (stored) {
                this.cachedSourceByBody = new Map();
                for (const entry of Object.values(stored.tasks)) {
                    if (entry.source) {
                        const collectorBody = forward(entry.body, entry.source, stored.collectorPath);
                        this.cachedSourceByBody.set(collectorBody, entry.source);
                    }
                }
            }
        };

        const roots = vscode.workspace.workspaceFolders?.map(f => f.uri) ?? [];
        const [workspaceRoot] = await Promise.all([
            this.manifest.findInitializedRoot(roots).then(async (root) => {
                await refreshTaskIndex(root);
                return root;
            }),
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

        // 6. pushUpdate function — uses caches to avoid redundant work.
        const pushUpdate = () => {
            const text = document.getText();

            // Skip no-op: if the document text hasn't changed since last push,
            // there's nothing new to render.
            if (text === this.lastPushedText) return;
            this.lastPushedText = text;

            const doc = parseTodoDocument(text);

            const toUITask = (task: ParsedCollectorTask, isCompleted: boolean, index: number): UITask => {
                const id = `${isCompleted ? "c" : "a"}-${index}`;

                // Resolve source path via cached reverse map (O(1))
                let sourceRelativePath: string | null = null;
                if (isCompleted && task.suffix?.source) {
                    sourceRelativePath = task.suffix.source;
                } else if (!isCompleted && this.cachedSourceByBody) {
                    sourceRelativePath = this.cachedSourceByBody.get(task.bodyWithoutSuffix) ?? null;
                }

                const cleanBody = stripHangingIndent(task.bodyWithoutSuffix);

                // Cached markdown render — only re-render when body text changes
                let bodyHtml = this.mdCache.get(cleanBody);
                if (!bodyHtml) {
                    bodyHtml = this.md.render(cleanBody);
                    this.mdCache.set(cleanBody, bodyHtml);
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

        const pushContactTooltips = () => {
            if (!this.expansionMap) return;
            const entries = this.expansionMap.getExpansionEntries();
            if (entries.length === 0) return;

            const tooltipEntries: ContactTooltipEntry[] = [];
            const seen = new Set<string>();
            for (const { text, contact } of entries) {
                if (seen.has(text)) continue;
                seen.add(text);
                const briefMd = buildContactTooltipMarkdown(contact, false);
                const detailedMd = buildContactTooltipMarkdown(contact, true);
                tooltipEntries.push({
                    text,
                    briefHtml: this.md.render(briefMd),
                    detailedHtml: this.md.render(detailedMd),
                });
            }

            const msg: ToWebviewMessage = { type: "contactTooltips", entries: tooltipEntries };
            webviewPanel.webview.postMessage(msg);
        };

        pushUpdate();
        pushContactTooltips();

        // Track this panel so refreshContactTooltips() can push updates later.
        this.activePanelTooltipPushers.add(pushContactTooltips);

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
                    this.lastPushedText = ""; // Force full re-push
                    pushUpdate();
                    pushContactTooltips();
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
                    } else if (workspaceRoot && this.cachedSourceByBody) {
                        const src = this.cachedSourceByBody.get(oldBody);
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
                    } else if (this.cachedSourceByBody) {
                        sourcePath = this.cachedSourceByBody.get(found.bodyWithoutSuffix) ?? null;
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
                case "openLink": {
                    // Resolve relative link against the directory of the .todo.md file
                    const docDir = vscode.Uri.joinPath(document.uri, "..");
                    const href = msg.href;
                    // Split href into path and anchor
                    const hashIdx = href.indexOf("#");
                    const filePath = hashIdx >= 0 ? href.slice(0, hashIdx) : href;
                    const anchor = hashIdx >= 0 ? href.slice(hashIdx + 1) : null;
                    const targetUri = vscode.Uri.joinPath(docDir, filePath);
                    const editor = await vscode.window.showTextDocument(targetUri, {
                        viewColumn: vscode.ViewColumn.Beside,
                        preserveFocus: false,
                    });
                    // Navigate to anchor (heading) if specified
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
                    await syncTasks();
                    await refreshTaskIndex(workspaceRoot);
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
                    } else if (this.cachedSourceByBody) {
                        sourcePath = this.cachedSourceByBody.get(found.bodyWithoutSuffix) ?? null;
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
                case "snippetQuery": {
                    if (!this.snippetProvider) break;
                    const prefix = msg.prefix;
                    const all = this.snippetProvider.getAllSnippets();
                    const isContact = prefix.startsWith("@");
                    const filtered = all
                        .filter((s) => {
                            const matchesPrefix = isContact ? s.trigger.startsWith("@") : s.trigger.startsWith("{");
                            if (!matchesPrefix) return false;
                            // Match trigger against user-typed prefix (case-insensitive)
                            return s.trigger.toLowerCase().startsWith(prefix.toLowerCase())
                                || s.label.toLowerCase().includes(prefix.slice(1).toLowerCase());
                        })
                        .slice(0, 20)
                        .map((s) => ({ trigger: s.trigger, label: s.label, description: s.description }));
                    const reply: ToWebviewMessage = { type: "snippetSuggestions", items: filtered };
                    webviewPanel.webview.postMessage(reply);
                    break;
                }
                case "snippetAccept": {
                    if (!this.snippetProvider) break;
                    const all = this.snippetProvider.getAllSnippets();
                    const snippet = all.find((s) => s.trigger === msg.trigger);
                    if (!snippet) break;

                    let expanded: string;
                    if (snippet.body !== undefined && !snippet.expand && !snippet.parameters?.length) {
                        // Static snippet — insert body directly.
                        expanded = snippet.body;
                    } else {
                        // Dynamic or parameterized — resolve params then expand.
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
                                // If user cancelled a parameter, abort.
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
                    webviewPanel.webview.postMessage(result);
                    break;
                }
                case "linkPathQuery": {
                    // List files relative to the .todo.md file's directory
                    const docDir = vscode.Uri.joinPath(document.uri, "..");
                    const prefix = msg.prefix;
                    try {
                        // Determine the directory to list based on prefix
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
                            // Folders first, then alphabetical
                            const aDir = a.label.endsWith("/") ? 0 : 1;
                            const bDir = b.label.endsWith("/") ? 0 : 1;
                            if (aDir !== bDir) return aDir - bDir;
                            return a.label.localeCompare(b.label);
                        });
                        const reply: ToWebviewMessage = { type: "linkSuggestions", items: suggestions.slice(0, 30), queryId: msg.queryId };
                        webviewPanel.webview.postMessage(reply);
                    } catch {
                        webviewPanel.webview.postMessage({ type: "linkSuggestions", items: [], queryId: msg.queryId } as ToWebviewMessage);
                    }
                    break;
                }
                case "linkHeadingQuery": {
                    // Read headings from the specified file
                    const docDir = vscode.Uri.joinPath(document.uri, "..");
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
                        webviewPanel.webview.postMessage(reply);
                    } catch {
                        webviewPanel.webview.postMessage({ type: "linkSuggestions", items: [], queryId: msg.queryId } as ToWebviewMessage);
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

        // Debounce text-change updates to avoid cascading re-parses when
        // applyEdit + save fire multiple change events in quick succession.
        let changeTimer: ReturnType<typeof setTimeout> | null = null;
        disposables.push(
            vscode.workspace.onDidChangeTextDocument(e => {
                if (e.document.uri.toString() === document.uri.toString()) {
                    if (changeTimer) clearTimeout(changeTimer);
                    changeTimer = setTimeout(pushUpdate, 80);
                }
            }),
        );

        webviewPanel.onDidDispose(() => {
            this.activePanelTooltipPushers.delete(pushContactTooltips);
            this.lastPushedText = "";
            if (changeTimer) clearTimeout(changeTimer);
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

function getHtmlForWebview(webview: vscode.Webview, nonce: string, scriptUri: vscode.Uri, cssUri: vscode.Uri): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'nonce-${nonce}'; script-src 'nonce-${nonce}'; font-src ${webview.cspSource};">
    <title>Todo Editor</title>
    <link rel="stylesheet" href="${cssUri}">
    <style nonce="${nonce}">
        .loading-skeleton { padding: 16px; opacity: 0.5; }
        .skeleton-bar { height: 48px; background: var(--vscode-editor-foreground, #888); opacity: 0.08; border-radius: 6px; margin-bottom: 8px; }
        .skeleton-short { height: 14px; width: 120px; opacity: 0.15; margin-bottom: 16px; }
    </style>
</head>
<body>
    <div id="root" data-nonce="${nonce}">
        <div class="loading-skeleton">
            <div class="skeleton-bar skeleton-short"></div>
            <div class="skeleton-bar"></div>
            <div class="skeleton-bar"></div>
            <div class="skeleton-bar"></div>
        </div>
    </div>
    <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}

function getNonce(): string {
    // CSP nonces must be unguessable — use cryptographically secure random bytes.
    return randomBytes(24).toString("base64url");
}
