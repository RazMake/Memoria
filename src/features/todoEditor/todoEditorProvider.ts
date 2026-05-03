import * as vscode from "vscode";
import MarkdownIt from "markdown-it";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const taskLists = require("markdown-it-task-lists");
import type { ManifestManager } from "../../blueprints/manifestManager";
import type { ParsedCollectorTask } from "../taskCollector/types";
import type { UITask, ToWebviewMessage, ToExtensionMessage, ContactTooltipEntry } from "./types";
import { parseTodoDocument, stripHangingIndent, type TodoDocument } from "./documentSerializer";
import { forward } from "../taskCollector/pathRewriter";
import type { ContactExpansionMap } from "../snippets/snippetHoverProvider";
import type { SnippetProvider } from "../snippets/snippetCompletionProvider";
import { buildContactTooltipMarkdown } from "../contacts/contactTooltip";
import { getHtmlForWebview, getNonce } from "./todoEditorHtml";
import { handleTodoEditorMessage, type TodoEditorMessageContext } from "./todoEditorMessageHandler";

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

        // 9. Message handler — delegated to the extracted module
        let lastOpenedSourceUri: vscode.Uri | null = null;
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        const provider = this;
        const messageCtx: TodoEditorMessageContext = {
            document,
            webviewPanel,
            workspaceRoot,
            get cachedSourceByBody() { return provider.cachedSourceByBody; },
            snippetProvider: this.snippetProvider,
            pushUpdate,
            pushContactTooltips,
            applyEdit,
            syncTasks,
            refreshTaskIndex,
            resolveTask,
            resetLastPushedText: () => { this.lastPushedText = ""; },
            getLastOpenedSourceUri: () => lastOpenedSourceUri,
            setLastOpenedSourceUri: (uri) => { lastOpenedSourceUri = uri; },
        };

        const messageHandler = (msg: ToExtensionMessage) => handleTodoEditorMessage(msg, messageCtx);

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
