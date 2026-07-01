import * as vscode from "vscode";
import type { ManifestManager } from "../../blueprints/manifestManager";
import type { ResolvedContact } from "../contacts/contactUtils";
import type { SnippetDefinition, SnippetContext, LoadedSnippetFile } from "./types";
import type { SnippetProvider } from "./snippetCompletionProvider";
import type { ContactExpansionMap } from "./snippetHoverProvider";
import type { TemplateFunction } from "./templates/templateTypes";
import type { TemplateProvider } from "./templateCommands";
import { compileSnippetFile } from "./snippetCompiler";
import { generateContactSnippets } from "./contactSnippets";
import { DebouncedFileWatcher } from "../../utils/debouncedFileWatcher";
import { showWarning } from "../../utils/uiMessages";
import { textDecoder } from "../../utils/encoding";
import { parseTemplate } from "./templates/templateParser";
import { compileFunctionSource, validateFunctions, TEMPLATE_MODULE_NAME } from "./templates/functionLoader";

/** Minimal interface for the contact data needed by SnippetsFeature (DIP). */
export interface ContactDataSource {
    isActive(): boolean;
    getAllContacts(): ResolvedContact[];
    onDidUpdate(listener: (snapshot: unknown) => void): vscode.Disposable;
}

/** A loaded template entry. */
interface LoadedTemplate {
    relativePath: string;
    title: string | null;
}

export class SnippetsFeature implements vscode.Disposable, SnippetProvider, ContactExpansionMap, TemplateProvider {
    private workspaceRoot: vscode.Uri | null = null;
    private snippetsFolder: string | null = null;
    private templatesFolder: string | null = null;
    private active = false;
    private loadedFiles: LoadedSnippetFile[] = [];
    private contactSnippets: SnippetDefinition[] = [];
    private pathSafeSnippets: SnippetDefinition[] = [];
    private contactExpansionEntries: Array<{ text: string; contact: ResolvedContact }> = [];
    private fileWatcher: DebouncedFileWatcher | null = null;
    private templateWatcher: DebouncedFileWatcher | null = null;
    private contactsDisposable: vscode.Disposable | null = null;
    private indexedTemplates: LoadedTemplate[] = [];
    private templateFunctions: TemplateFunction[] = [];
    private hostFunctions: TemplateFunction[] = [];

    private readonly _onDidUpdateExpansionMap = new vscode.EventEmitter<void>();
    readonly onDidUpdateExpansionMap = this._onDidUpdateExpansionMap.event;

    constructor(
        private readonly manifest: ManifestManager,
        private readonly contactsFeature: ContactDataSource | null = null,
        private readonly debounceMs: number = 300,
        private readonly fs: typeof vscode.workspace.fs = vscode.workspace.fs,
    ) {}

    /** Sets the host-registered template functions (people/date built-ins). */
    setHostFunctions(functions: TemplateFunction[]): void {
        this.hostFunctions = functions;
    }

    async refresh(workspaceRoot: vscode.Uri | null, enabled: boolean): Promise<void> {
        if (!workspaceRoot || !enabled) {
            await this.stop();
            // Path-safe snippets survive disable — reload them if we have a root.
            if (workspaceRoot) {
                await this.loadPathSafeOnly(workspaceRoot);
            }
            return;
        }

        await this.start(workspaceRoot);
    }

    async start(workspaceRoot: vscode.Uri): Promise<void> {
        await this.stop();

        const manifestData = await this.manifest.readManifest(workspaceRoot);
        const snippetsConfig = manifestData?.snippets;
        if (!snippetsConfig) return;

        this.workspaceRoot = workspaceRoot;
        this.snippetsFolder = snippetsConfig.snippetsFolder;
        this.templatesFolder = snippetsConfig.templatesFolder ?? null;
        this.active = true;

        // Subscribe to contact updates BEFORE the initial snippet generation.
        // Feature handlers run in parallel (see FeatureManager.refresh), so the
        // ContactsFeature may still be loading when reloadAllSnippets() runs — in
        // which case refreshContactSnippets() produces an empty contact list.
        // Subscribing first guarantees the one-time onDidUpdate that Contacts fires
        // on load is never lost, so contact `@` snippets always populate.
        this.subscribeToContacts();

        await this.reloadAllSnippets();
        if (this.templatesFolder) {
            await this.reloadTemplates();
        }
        this.installWatcher();
    }

    async stop(): Promise<void> {
        this.fileWatcher?.dispose();
        this.fileWatcher = null;
        this.templateWatcher?.dispose();
        this.templateWatcher = null;
        this.contactsDisposable?.dispose();
        this.contactsDisposable = null;
        this.active = false;
        this.workspaceRoot = null;
        this.snippetsFolder = null;
        this.templatesFolder = null;
        this.loadedFiles = [];
        this.contactSnippets = [];
        this.contactExpansionEntries = [];
        this.indexedTemplates = [];
        this.templateFunctions = [];
    }

    dispose(): void {
        void this.stop();
        this._onDidUpdateExpansionMap.dispose();
    }

    isActive(): boolean {
        return this.active;
    }

    getSnippets(): SnippetDefinition[] {
        return this.loadedFiles.flatMap((f) => f.snippets);
    }

    getContactSnippets(): SnippetDefinition[] {
        return this.contactSnippets;
    }

    getAllSnippets(): SnippetDefinition[] {
        return [...this.getSnippets(), ...this.contactSnippets];
    }

    getExpansionEntries(): ReadonlyArray<{ text: string; contact: ResolvedContact }> {
        return this.contactExpansionEntries;
    }

    expandPathSnippet(trigger: string, params?: Record<string, string>): string | null {
        const snippet = this.pathSafeSnippets.find((s) => s.trigger === trigger);
        if (!snippet) return null;

        if (snippet.body !== undefined && !snippet.expand) {
            return snippet.body;
        }

        if (snippet.expand) {
            const ctx: SnippetContext = {
                document: null,
                position: null,
                params: params ?? {},
                contacts: [],
            };
            try {
                return snippet.expand(ctx);
            } catch {
                return null;
            }
        }

        return null;
    }

    async expandSnippet(
        definition: SnippetDefinition,
        document: vscode.TextDocument,
        position: vscode.Position,
        selectedText?: string,
    ): Promise<string> {
        const contacts = this.contactsFeature?.isActive()
            ? this.contactsFeature.getAllContacts()
            : [];

        const params: Record<string, string> = {};

        if (definition.parameters?.length) {
            if (definition.parameters.length === 1 && selectedText) {
                // Single-parameter shortcut: selection becomes the parameter value.
                params[definition.parameters[0].name] = selectedText;
            } else {
                // QuickPick cascade for each parameter.
                for (const param of definition.parameters) {
                    const options = param.resolveOptions
                        ? param.resolveOptions({ document, position, params, contacts })
                        : param.options ?? [];
                    const picked = await vscode.window.showQuickPick(
                        options,
                        { placeHolder: `Select ${param.name}` },
                    );
                    params[param.name] = picked ?? param.default ?? "";
                }
            }
        }

        const ctx: SnippetContext = { document, position, params, contacts };

        if (definition.body !== undefined && !definition.expand) {
            return definition.body;
        }

        if (definition.expand) {
            try {
                return definition.expand(ctx);
            } catch (err) {
                const message = (err as Error).message ?? "Unknown error";
                showWarning(
                    `Snippet '${definition.trigger}' failed: ${message}`,
                );
                return `⚠️ Snippet error (${definition.trigger}): ${message}`;
            }
        }

        return "";
    }

    // ── TemplateProvider implementation ──────────────────────────────────────

    listTemplates(): Array<{ relativePath: string; title: string | null }> {
        return this.indexedTemplates.map((t) => ({ relativePath: t.relativePath, title: t.title }));
    }

    async readTemplate(relativePath: string): Promise<string> {
        if (!this.workspaceRoot || !this.templatesFolder) {
            throw new Error("Templates folder is not configured.");
        }
        const uri = vscode.Uri.joinPath(this.workspaceRoot, this.templatesFolder, relativePath);
        const bytes = await this.fs.readFile(uri);
        return textDecoder.decode(bytes);
    }

    getFunctions(): TemplateFunction[] {
        return [...this.hostFunctions, ...this.templateFunctions];
    }

    // ── Private template loading ──────────────────────────────────────────────

    private async reloadTemplates(): Promise<void> {
        if (!this.workspaceRoot || !this.templatesFolder) return;

        const folderUri = vscode.Uri.joinPath(this.workspaceRoot, this.templatesFolder);
        const templates = await this.discoverTemplates(folderUri, "");
        this.indexedTemplates = templates;

        // Load user functions from _functions/ subfolder
        const functionsUri = vscode.Uri.joinPath(folderUri, "_functions");
        this.templateFunctions = await this.loadUserFunctions(functionsUri);
    }

    private async discoverTemplates(
        folderUri: vscode.Uri,
        prefix: string,
    ): Promise<LoadedTemplate[]> {
        let entries: [string, vscode.FileType][];
        try {
            entries = await this.fs.readDirectory(folderUri);
        } catch {
            return [];
        }

        const results: LoadedTemplate[] = [];

        for (const [name, type] of entries) {
            if (name.startsWith("_")) continue; // skip _functions/ etc.

            if (type === vscode.FileType.Directory) {
                const subUri = vscode.Uri.joinPath(folderUri, name);
                const subPrefix = prefix ? `${prefix}/${name}` : name;
                const subTemplates = await this.discoverTemplates(subUri, subPrefix);
                results.push(...subTemplates);
            } else if (type === vscode.FileType.File && name.endsWith(".md")) {
                const relativePath = prefix ? `${prefix}/${name}` : name;
                const uri = vscode.Uri.joinPath(folderUri, name);
                let title: string | null = null;
                try {
                    const bytes = await this.fs.readFile(uri);
                    const text = textDecoder.decode(bytes);
                    const parsed = parseTemplate(text);
                    title = parsed.title;
                } catch {
                    // ignore parse errors during indexing
                }
                results.push({ relativePath, title });
            }
        }

        return results;
    }

    private async loadUserFunctions(functionsUri: vscode.Uri): Promise<TemplateFunction[]> {
        let entries: [string, vscode.FileType][];
        try {
            entries = await this.fs.readDirectory(functionsUri);
        } catch {
            return [];
        }

        const tsFiles = entries
            .filter(([name, type]) => type === vscode.FileType.File && name.endsWith(".ts"))
            .map(([name]) => name);

        const allFunctions: TemplateFunction[] = [];

        for (const fileName of tsFiles) {
            const fileUri = vscode.Uri.joinPath(functionsUri, fileName);
            try {
                const bytes = await this.fs.readFile(fileUri);
                const source = textDecoder.decode(bytes);
                const fns = compileFunctionSource(source, {});
                validateFunctions(fns, new Set(allFunctions.map((f) => f.name)));
                allFunctions.push(...fns);
            } catch (err) {
                const message = (err as Error).message ?? "Unknown error";
                showWarning(`Failed to load template function file '${fileName}': ${message}`);
            }
        }

        return allFunctions;
    }

    private async reloadAllSnippets(): Promise<void> {
        if (!this.workspaceRoot || !this.snippetsFolder) return;

        const folderUri = vscode.Uri.joinPath(this.workspaceRoot, this.snippetsFolder);
        const manifestData = await this.manifest.readManifest(this.workspaceRoot);
        const fileManifest = manifestData?.fileManifest ?? {};

        const compiled = await this.discoverAndCompileSnippets(folderUri);

        const loaded: LoadedSnippetFile[] = compiled.map(({ fileName, snippets, error }) => {
            const relativePath = `${this.snippetsFolder}/${fileName}`;
            const isBuiltIn = relativePath in fileManifest;
            if (error) {
                return { filePath: relativePath, isBuiltIn, snippets: [], error };
            }
            return { filePath: relativePath, isBuiltIn, snippets };
        });

        this.loadedFiles = loaded;
        this.pathSafeSnippets = loaded
            .flatMap((f) => f.snippets)
            .filter((s) => s.pathSafe === true);

        this.refreshContactSnippets();
    }

    private async loadPathSafeOnly(workspaceRoot: vscode.Uri): Promise<void> {
        const manifestData = await this.manifest.readManifest(workspaceRoot);
        const snippetsConfig = manifestData?.snippets;
        if (!snippetsConfig) {
            this.pathSafeSnippets = [];
            return;
        }

        const folderUri = vscode.Uri.joinPath(workspaceRoot, snippetsConfig.snippetsFolder);
        const compiled = await this.discoverAndCompileSnippets(folderUri, true);

        this.pathSafeSnippets = compiled
            .flatMap((c) => c.snippets)
            .filter((s) => s.pathSafe === true);
    }

    /** Discovers .ts files in a folder and compiles each into snippet definitions. */
    private async discoverAndCompileSnippets(
        folderUri: vscode.Uri,
        silent = false,
    ): Promise<Array<{ fileName: string; snippets: SnippetDefinition[]; error?: string }>> {
        let entries: [string, vscode.FileType][];
        try {
            entries = await this.fs.readDirectory(folderUri);
        } catch {
            return [];
        }

        const tsFiles = entries
            .filter(([name, type]) => type === vscode.FileType.File && name.endsWith(".ts"))
            .map(([name]) => name);

        const results: Array<{ fileName: string; snippets: SnippetDefinition[]; error?: string }> = [];
        for (const fileName of tsFiles) {
            const fileUri = vscode.Uri.joinPath(folderUri, fileName);
            try {
                const snippets = await compileSnippetFile(fileUri, this.fs);
                results.push({ fileName, snippets });
            } catch (err) {
                const message = (err as Error).message ?? "Unknown error";
                if (!silent) {
                    showWarning(
                        `Failed to load snippet file '${fileName}': ${message}`,
                    );
                }
                results.push({ fileName, snippets: [], error: message });
            }
        }
        return results;
    }

    private refreshContactSnippets(): void {
        if (!this.contactsFeature?.isActive()) {
            this.contactSnippets = [];
            this.contactExpansionEntries = [];
            return;
        }

        const contacts = this.contactsFeature.getAllContacts();
        this.contactSnippets = generateContactSnippets(contacts);
        this.rebuildContactExpansionMap(contacts);
        this._onDidUpdateExpansionMap.fire();
    }

    private rebuildContactExpansionMap(contacts: ResolvedContact[]): void {
        const seen = new Set<string>();
        const entries: Array<{ text: string; contact: ResolvedContact }> = [];

        const add = (text: string, contact: ResolvedContact) => {
            if (!text || seen.has(text)) return;
            seen.add(text);
            entries.push({ text, contact });
        };

        for (const contact of contacts) {
            // Add id and nickname directly — these are always available.
            add(contact.id, contact);
            add(contact.nickname, contact);
            add(contact.fullName, contact);

            // Add all format expansions from the snippet.
            const formats = ["nickname", "full", "title", "level", "level full"];
            const snippet = this.contactSnippets.find((s) => s.trigger === `@${contact.id}`);
            if (snippet?.expand) {
                for (const format of formats) {
                    try {
                        const text = snippet.expand({
                            document: null,
                            position: null,
                            params: { format },
                            contacts: [],
                        });
                        add(text, contact);
                    } catch {
                        // Skip failed expansions.
                    }
                }
            }
        }

        // Sort longest first so the most specific match wins when scanning.
        entries.sort((a, b) => b.text.length - a.text.length);
        this.contactExpansionEntries = entries;
    }

    // Uses a scoped FileSystemWatcher rather than workspace-level save events because snippets
    // are confined to a single folder (the blueprint's snippets folder).
    private installWatcher(): void {
        if (!this.workspaceRoot || !this.snippetsFolder) return;

        this.fileWatcher = new DebouncedFileWatcher(this.debounceMs, () => {
            void this.reloadAllSnippets();
        });
        this.fileWatcher.watch(
            new vscode.RelativePattern(this.workspaceRoot, `${this.snippetsFolder}/*.ts`),
        );

        if (this.templatesFolder) {
            this.templateWatcher = new DebouncedFileWatcher(this.debounceMs, () => {
                void this.reloadTemplates();
            });
            this.templateWatcher.watch(
                new vscode.RelativePattern(this.workspaceRoot, `${this.templatesFolder}/**`),
            );
        }
    }

    private subscribeToContacts(): void {
        if (!this.contactsFeature) return;

        this.contactsDisposable = this.contactsFeature.onDidUpdate(() => {
            this.refreshContactSnippets();
        });
    }
}
