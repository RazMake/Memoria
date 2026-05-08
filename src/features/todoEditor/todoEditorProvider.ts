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

    // Pre-resolved workspace root, set by the extension during activation
    // so that resolveCustomTextEditor() skips the redundant findInitializedRoot() call.
    private cachedInitializedRoot: vscode.Uri | null = null;
    private hasReceivedRoot = false;

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

    /** Caches the initialized workspace root so resolveCustomTextEditor skips findInitializedRoot. */
    setInitializedRoot(root: vscode.Uri | null): void {
        this.cachedInitializedRoot = root;
        this.hasReceivedRoot = true;
    }

    /** Re-pushes contact tooltip data to all open todo editor panels. */
    refreshContactTooltips(): void {
        for (const push of this.activePanelTooltipPushers) push();
    }

    /** Converts a parsed task into a UI-ready object, using caches to avoid redundant markdown renders. */
    private toUITask(task: ParsedCollectorTask, isCompleted: boolean, index: number): UITask {
        const id = `${isCompleted ? "c" : "a"}-${index}`;

        let sourceRelativePath: string | null = null;
        if (isCompleted && task.suffix?.source) {
            sourceRelativePath = task.suffix.source;
        } else if (!isCompleted && this.cachedSourceByBody) {
            sourceRelativePath = this.cachedSourceByBody.get(task.bodyWithoutSuffix) ?? null;
        }

        const cleanBody = stripHangingIndent(task.bodyWithoutSuffix);

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
    }

    /** Builds contact tooltip entries from the expansion map, deduplicating by text. */
    private buildContactTooltipEntries(): ContactTooltipEntry[] {
        if (!this.expansionMap) return [];
        const entries = this.expansionMap.getExpansionEntries();
        if (entries.length === 0) return [];

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
        return tooltipEntries;
    }

    async resolveCustomTextEditor(
        document: vscode.TextDocument,
        webviewPanel: vscode.WebviewPanel,
        _token: vscode.CancellationToken,
    ): Promise<void> {
        this.configureWebviewPanel(webviewPanel);

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

        // Use cached root when available; fall back to discovery only on cold start.
        let workspaceRoot: vscode.Uri | null;
        if (this.hasReceivedRoot) {
            workspaceRoot = this.cachedInitializedRoot;
        } else {
            const roots = vscode.workspace.workspaceFolders?.map(f => f.uri) ?? [];
            workspaceRoot = await this.manifest.findInitializedRoot(roots);
        }

        // Only read task index from disk when not already cached.
        if (!this.cachedSourceByBody) {
            await refreshTaskIndex(workspaceRoot);
        }

        const resolveTask = (id: string, doc: TodoDocument): { task: ParsedCollectorTask; section: "active" | "completed"; index: number } | null => {
            const m = /^([ac])-(\d+)$/.exec(id);
            if (!m) return null;
            const isCompleted = m[1] === "c";
            const idx = parseInt(m[2], 10);
            const tasks = isCompleted ? doc.completed : doc.active;
            if (idx >= tasks.length) return null;
            return { task: tasks[idx], section: isCompleted ? "completed" : "active", index: idx };
        };

        const pushUpdate = this.createPushUpdate(document, webviewPanel);

        const pushContactTooltips = () => {
            const tooltipEntries = this.buildContactTooltipEntries();
            if (tooltipEntries.length === 0) return;
            const msg: ToWebviewMessage = { type: "contactTooltips", entries: tooltipEntries };
            webviewPanel.webview.postMessage(msg);
        };

        const applyEdit = async (newText: string): Promise<void> => {
            const edit = new vscode.WorkspaceEdit();
            edit.replace(
                document.uri,
                new vscode.Range(0, 0, document.lineCount, 0),
                newText,
            );
            await vscode.workspace.applyEdit(edit);
            await document.save();
        };

        const syncTasks = async (): Promise<void> => {
            await vscode.commands.executeCommand("memoria.syncTasks");
        };

        // Wire events first so the webview's "ready" message is handled immediately.
        // The "ready" handler re-pushes data, so we don't need to block on waitForWebviewReady.
        this.activePanelTooltipPushers.add(pushContactTooltips);

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

        this.wireEditorEvents(messageCtx, pushUpdate, pushContactTooltips);

        // Push initial data — may be lost if the webview script hasn't loaded yet,
        // but the "ready" handler will re-push when the webview signals readiness.
        pushUpdate();
        pushContactTooltips();
    }

    /** Configures the webview panel with scripts and sets initial HTML. */
    private configureWebviewPanel(webviewPanel: vscode.WebviewPanel): void {
        const distUri = vscode.Uri.joinPath(this.extensionUri, "dist");
        webviewPanel.webview.options = {
            enableScripts: true,
            localResourceRoots: [distUri],
        };

        const nonce = getNonce();
        const webviewJs = webviewPanel.webview.asWebviewUri(vscode.Uri.joinPath(distUri, "webview.js"));
        const webviewCss = webviewPanel.webview.asWebviewUri(vscode.Uri.joinPath(distUri, "webview.css"));
        webviewPanel.webview.html = getHtmlForWebview(webviewPanel.webview, nonce, webviewJs, webviewCss);
    }

    /** Creates a debounce-safe push function that sends parsed document content to the webview. */
    private createPushUpdate(
        document: vscode.TextDocument,
        webviewPanel: vscode.WebviewPanel,
    ): () => void {
        return () => {
            const text = document.getText();
            if (text === this.lastPushedText) return;
            this.lastPushedText = text;

            const doc = parseTodoDocument(text);
            const active = doc.active.map((t, i) => this.toUITask(t, false, i));
            const completed = doc.completed.map((t, i) => this.toUITask(t, true, i));

            const msg: ToWebviewMessage = { type: "update", active, completed };
            webviewPanel.webview.postMessage(msg);
        };
    }

    /** Wires up message handling, text-change debouncing, and disposal cleanup. */
    private wireEditorEvents(
        ctx: TodoEditorMessageContext,
        pushUpdate: () => void,
        pushContactTooltips: () => void,
    ): void {
        const messageHandler = (msg: ToExtensionMessage) => handleTodoEditorMessage(msg, ctx);

        const disposables: vscode.Disposable[] = [];

        disposables.push(
            ctx.webviewPanel.webview.onDidReceiveMessage(messageHandler),
        );

        let changeTimer: ReturnType<typeof setTimeout> | null = null;
        disposables.push(
            vscode.workspace.onDidChangeTextDocument(e => {
                if (e.document.uri.toString() === ctx.document.uri.toString()) {
                    if (changeTimer) clearTimeout(changeTimer);
                    changeTimer = setTimeout(pushUpdate, 80);
                }
            }),
        );

        ctx.webviewPanel.onDidDispose(() => {
            this.activePanelTooltipPushers.delete(pushContactTooltips);
            this.lastPushedText = "";
            if (changeTimer) clearTimeout(changeTimer);
            for (const d of disposables) d.dispose();
        });
    }
}
