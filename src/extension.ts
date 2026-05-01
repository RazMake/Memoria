import * as vscode from "vscode";
import { createTelemetry, DeferredTelemetryLogger, type TelemetryReporterFactory } from "./telemetry";
import { BlueprintRegistry } from "./blueprints/blueprintRegistry";
import { ManifestManager } from "./blueprints/manifestManager";
import { FileScaffold } from "./blueprints/fileScaffold";
import { BlueprintEngine } from "./blueprints/blueprintEngine";
import { WorkspaceInitConflictResolver } from "./blueprints/workspaceInitConflictResolver";
import { getWorkspaceRoots } from "./blueprints/workspaceUtils";
import { updateDefaultFileContext, registerDefaultFileWatcher, type DefaultFileWatcherHolder } from "./defaultFileContext";
import { createOpenUserGuideCommand } from "./commands/openUserGuide";
import { BlueprintDecorationProvider } from "./features/decorations/blueprintDecorationProvider";
import { DecorationCompletionProvider, DECORATIONS_JSON_SELECTOR } from "./features/decorations/decorationCompletionProvider";
import { DecorationColorProvider } from "./features/decorations/decorationColorProvider";
import { DefaultFileCompletionProvider, DEFAULT_FILES_JSON_SELECTOR } from "./features/navigator/defaultFileCompletionProvider";
import { FeatureManager } from "./features/featureManager";
import { ContactsFeature } from "./features/contacts/contactsFeature";
import { ContactsViewProvider } from "./features/contacts/contactsViewProvider";
import { TaskCollectorFeature } from "./features/taskCollector/taskCollectorFeature";
import { TodoEditorProvider } from "./features/todoEditor/todoEditorProvider";
import { SnippetsFeature } from "./features/snippets/snippetsFeature";
import { SnippetCompletionProvider } from "./features/snippets/snippetCompletionProvider";
import { SnippetHoverProvider } from "./features/snippets/snippetHoverProvider";
import { checkForBlueprintUpdates, updateWorkspaceInitializedContext } from "./blueprintUpdateCheck";
import { registerFileWatchers } from "./fileWatchers";
import { registerCommands } from "./commandRegistration";

export { isNewerVersion } from "./blueprintUpdateCheck";

/** Lazy factory — defers require("@vscode/extension-telemetry") to first call. */
const reporterFactory: TelemetryReporterFactory = (connectionString) => {
    const TelemetryReporter = require("@vscode/extension-telemetry").default;
    return new TelemetryReporter(connectionString);
};

/**
 * Extension entry point — called once by VS Code when the activation event fires.
 *
 * Key design decisions:
 * - Telemetry is deferred to a microtask (non-blocking) so it cannot delay the critical
 *   activation path; DeferredTelemetryLogger silently drops the rare event fired before
 *   the logger is ready.
 * - Context updates, feature refresh, and default-file context are run in parallel via
 *   Promise.all — they are independent and combining them avoids multiple sequential
 *   round-trips to the file system.
 * - File watchers are registered after features are refreshed to ensure decoration and
 *   feature providers are already active before any watcher fires.
 */
export async function activate(context: vscode.ExtensionContext): Promise<void> {
    // Telemetry is initialized asynchronously so it does not block the activation
    // critical path. DeferredTelemetryLogger silently drops events until the real
    // logger is ready — which happens well before any user-triggered command.
    const telemetry = new DeferredTelemetryLogger();
    queueMicrotask(() => {
        telemetry.initialize(
            createTelemetry({ context, createReporter: reporterFactory })
        );
    });

    const registry = new BlueprintRegistry(context.extensionUri);
    const manifest = new ManifestManager(vscode.workspace.fs, telemetry);
    const scaffold = new FileScaffold(vscode.workspace.fs);
    const engine = new BlueprintEngine(registry, manifest, scaffold, vscode.workspace.fs, telemetry);
    const resolver = new WorkspaceInitConflictResolver(vscode.workspace.fs);

    const decorationProvider = new BlueprintDecorationProvider(manifest);
    const taskCollectorFeature = new TaskCollectorFeature(manifest, telemetry);
    const contactsFeature = new ContactsFeature(manifest);
    const snippetsFeature = new SnippetsFeature(manifest, contactsFeature);
    const todoEditorProvider = new TodoEditorProvider(manifest, context.extensionUri, snippetsFeature, snippetsFeature);
    const featureManager = new FeatureManager(manifest);
    let contactsViewDisposable: vscode.Disposable | undefined;
    let snippetCompletionDisposable: vscode.Disposable | undefined;
    let snippetHoverDisposable: vscode.Disposable | undefined;
    let snippetHoverCommandDisposable: vscode.Disposable | undefined;

    context.subscriptions.push(
        contactsFeature,
        snippetsFeature,
        snippetsFeature.onDidUpdateExpansionMap(() => {
            todoEditorProvider.refreshContactTooltips();
        }),
        {
            dispose: () => {
                contactsViewDisposable?.dispose();
                contactsViewDisposable = undefined;
            },
        },
    );

    featureManager.register("decorations", (root, enabled) =>
        decorationProvider.refresh(root, enabled, getWorkspaceRoots())
    );
    featureManager.register("taskCollector", async (root, enabled) => {
        await taskCollectorFeature.refresh(root, enabled, getWorkspaceRoots());
    });
    featureManager.register("contacts", async (root, enabled) => {
        await contactsFeature.refresh(root, enabled);

        if (enabled && !contactsViewDisposable) {
            const provider = new ContactsViewProvider(contactsFeature, context.extensionUri);
            const registration = ContactsViewProvider.register(context, provider);
            contactsViewDisposable = {
                dispose: () => {
                    registration.dispose();
                    provider.dispose();
                },
            };
            return;
        }

        if (!enabled && contactsViewDisposable) {
            contactsViewDisposable.dispose();
            contactsViewDisposable = undefined;
        }
    });
    featureManager.register("snippets", async (root, enabled) => {
        await snippetsFeature.refresh(root, enabled);
        await vscode.commands.executeCommand("setContext", "memoria.snippetsActive", enabled && root !== null);

        if (enabled && !snippetCompletionDisposable) {
            const completionProvider = new SnippetCompletionProvider(snippetsFeature);
            snippetCompletionDisposable = vscode.languages.registerCompletionItemProvider(
                { scheme: "file" },
                completionProvider,
                "{", "@",
            );
            const hoverProvider = new SnippetHoverProvider(snippetsFeature);
            snippetHoverDisposable = vscode.languages.registerHoverProvider(
                { scheme: "file" },
                hoverProvider,
            );
            snippetHoverCommandDisposable = vscode.commands.registerCommand(
                "memoria.showDetailedContactHover",
                () => hoverProvider.showDetailedHover(),
            );
            return;
        }

        if (!enabled && snippetCompletionDisposable) {
            snippetCompletionDisposable.dispose();
            snippetCompletionDisposable = undefined;
            snippetHoverDisposable?.dispose();
            snippetHoverDisposable = undefined;
            snippetHoverCommandDisposable?.dispose();
            snippetHoverCommandDisposable = undefined;
        }
    });

    // Register language providers and custom editors eagerly — they don't conflict with
    // other extensions' decoration providers and must be available before any file is opened.
    context.subscriptions.push(
        vscode.languages.registerCompletionItemProvider(
            DECORATIONS_JSON_SELECTOR,
            new DecorationCompletionProvider(),
            '"',
        ),
        vscode.languages.registerColorProvider(
            DECORATIONS_JSON_SELECTOR,
            new DecorationColorProvider(),
        ),
        vscode.languages.registerCompletionItemProvider(
            DEFAULT_FILES_JSON_SELECTOR,
            new DefaultFileCompletionProvider(),
            '"',
            '/',
        ),
        TodoEditorProvider.register(context, todoEditorProvider),
    );

    // Discover the initialized root once and share it across all startup operations
    // instead of calling findInitializedRoot() separately in each one (saves fs.stat round-trips).
    const roots = getWorkspaceRoots();
    const initializedRoot = await manifest.findInitializedRoot(roots);

    // Set the context key and refresh features in parallel — they are independent.
    await Promise.all([
        updateWorkspaceInitializedContext(initializedRoot),
        featureManager.refresh(initializedRoot),
        updateDefaultFileContext(initializedRoot, roots, manifest),
    ]);

    // Register the FileDecorationProvider AFTER features are refreshed (so rules are
    // already loaded) and after the built-in git extension has registered its own provider.
    // VS Code merges decorations from multiple providers using "last registered wins" for
    // colors. By registering here — after the await above — our custom colors override
    // git's "modified file" orange that appears when the Task Collector updates the
    // collector document.
    context.subscriptions.push(
        vscode.window.registerFileDecorationProvider(decorationProvider),
    );

    // Check for blueprint updates in the background — this may show a dialog that blocks
    // indefinitely and must not delay decoration rendering.
    void checkForBlueprintUpdates(
        initializedRoot,
        manifest,
        registry,
        engine,
        resolver,
        featureManager
    ).catch(() => {
        /* update check is best-effort — swallow errors silently */
    });

    const defaultFileWatcherHolder: DefaultFileWatcherHolder = { current: undefined };

    const onWorkspaceInitialized = async (workspaceRoot: vscode.Uri): Promise<void> => {
        await updateWorkspaceInitializedContext(workspaceRoot);
        await featureManager.refresh(workspaceRoot);
        await updateDefaultFileContext(workspaceRoot, roots, manifest);
        registerDefaultFileWatcher(context, workspaceRoot, roots, manifest, defaultFileWatcherHolder);
    };

    registerFileWatchers(context, roots, manifest, featureManager, initializedRoot, defaultFileWatcherHolder);
    registerDefaultFileWatcher(context, initializedRoot, roots, manifest, defaultFileWatcherHolder);
    registerCommands(
        context,
        engine,
        registry,
        manifest,
        telemetry,
        resolver,
        featureManager,
        taskCollectorFeature,
        contactsFeature,
        snippetsFeature,
        onWorkspaceInitialized,
    );

    context.subscriptions.push(
        vscode.commands.registerCommand(
            "memoria.openUserGuide",
            createOpenUserGuideCommand(context.extensionUri)
        )
    );
}

export function deactivate(): void {
    // Default-file watchers are tracked by the holder created in activate().
    // Context subscriptions handle disposal of all other watchers.
}
