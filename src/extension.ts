import * as vscode from "vscode";
import { createTelemetry, DeferredTelemetryLogger, type TelemetryReporterFactory } from "./telemetry";
import { BlueprintRegistry } from "./blueprints/blueprintRegistry";
import { ManifestManager } from "./blueprints/manifestManager";
import { FileScaffold } from "./blueprints/fileScaffold";
import { BlueprintEngine } from "./blueprints/blueprintEngine";
import { WorkspaceInitConflictResolver } from "./blueprints/workspaceInitConflictResolver";
import { getWorkspaceRoots } from "./blueprints/workspaceUtils";
import { updateDefaultFileContext, registerDefaultFileWatcher, type DefaultFileWatcherHolder } from "./defaultFileContext";
import { createInitializeWorkspaceCommand } from "./commands/initializeWorkspace";
import { createToggleDotFoldersCommand } from "./commands/toggleDotFolders";
import { createManageFeaturesCommand } from "./commands/manageFeatures";
import { createOpenDefaultFileCommand } from "./commands/openDefaultFile";
import { createOpenUserGuideCommand } from "./commands/openUserGuide";
import { createSyncTasksCommand } from "./commands/syncTasks";
import {
    createAddPersonCommand,
    createDeletePersonCommand,
    createEditPersonCommand,
    createMovePersonCommand,
} from "./commands/contactCommands";
import { BlueprintDecorationProvider } from "./features/decorations/blueprintDecorationProvider";
import { DecorationCompletionProvider, DECORATIONS_JSON_SELECTOR } from "./features/decorations/decorationCompletionProvider";
import { DecorationColorProvider } from "./features/decorations/decorationColorProvider";
import { DefaultFileCompletionProvider, DEFAULT_FILES_JSON_SELECTOR } from "./features/navigator/defaultFileCompletionProvider";
import { FeatureManager } from "./features/featureManager";
import { ContactsFeature } from "./features/contacts/contactsFeature";
import { ContactsViewProvider } from "./features/contacts/contactsViewProvider";
import { TaskCollectorFeature } from "./features/taskCollector/taskCollectorFeature";
import { TodoEditorProvider } from "./features/todoEditor/todoEditorProvider";

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
            createTelemetry({ context, createReporter: reporterFactory }) as vscode.TelemetryLogger
        );
    });

    const registry = new BlueprintRegistry(context.extensionUri);
    const manifest = new ManifestManager(vscode.workspace.fs);
    const scaffold = new FileScaffold(vscode.workspace.fs);
    const engine = new BlueprintEngine(registry, manifest, scaffold, vscode.workspace.fs, telemetry);
    const resolver = new WorkspaceInitConflictResolver(vscode.workspace.fs);

    const decorationProvider = new BlueprintDecorationProvider(manifest);
    const taskCollectorFeature = new TaskCollectorFeature(manifest, telemetry);
    const contactsFeature = new ContactsFeature(manifest);
    const todoEditorProvider = new TodoEditorProvider(manifest, context.extensionUri);
    const featureManager = new FeatureManager(manifest);
    let contactsViewDisposable: vscode.Disposable | undefined;

    context.subscriptions.push(
        contactsFeature,
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

    // Register the decoration provider eagerly so VS Code is already listening when
    // refresh() fires the change event — otherwise the first fire is wasted.
    context.subscriptions.push(
        vscode.window.registerFileDecorationProvider(decorationProvider),
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

/**
 * Watches .memoria/blueprint.json across all workspace roots so the context key
 * and features stay in sync when external tools or the user modify the file system.
 *
 * Two complementary listeners are needed:
 *  - FileSystemWatcher — fires for external FS changes (terminal, OS, etc.)
 *  - onDidDeleteFiles  — fires when the user deletes via the VS Code Explorer.
 *    (Deleting the .memoria/ *directory* does not trigger the file-level watcher
 *     because the glob targets a child file, not the directory itself.)
 */
function registerFileWatchers(
    context: vscode.ExtensionContext,
    roots: vscode.Uri[],
    manifest: ManifestManager,
    featureManager: FeatureManager,
    initializedRoot: vscode.Uri | null,
    defaultFileWatcherHolder: DefaultFileWatcherHolder
): void {
    // Tracks the previously seen initialized root. Used to short-circuit recheckInitialization()
    // when the filesystem watcher fires but the initialized root has not actually changed —
    // this avoids redundant feature refreshes on unrelated file-system events.
    let lastKnownRoot: string | null = initializedRoot?.toString() ?? null;

    const recheckInitialization = async (): Promise<void> => {
        const currentRoot = await manifest.findInitializedRoot(roots);
        const currentRootStr = currentRoot?.toString() ?? null;
        if (currentRootStr === lastKnownRoot) {
            return;
        }
        lastKnownRoot = currentRootStr;
        await updateWorkspaceInitializedContext(currentRoot);
        await featureManager.refresh(currentRoot);
        await updateDefaultFileContext(currentRoot, roots, manifest);
        registerDefaultFileWatcher(context, currentRoot, roots, manifest, defaultFileWatcherHolder);
    };

    // Watch every root — not just the first — so multi-root workspaces are fully covered.
    for (const root of roots) {
        const watcher = vscode.workspace.createFileSystemWatcher(
            new vscode.RelativePattern(root, ".memoria/blueprint.json")
        );
        watcher.onDidCreate(recheckInitialization);
        watcher.onDidDelete(recheckInitialization);
        context.subscriptions.push(watcher);
    }

    // Watch decorations.json so explorer colors update live when the user edits the file.
    // This needs a separate handler because recheckInitialization short-circuits when the
    // initialized root hasn't changed — but here the root is the same, only the rules changed.
    const refreshFeatures = async (): Promise<void> => {
        const currentRoot = await manifest.findInitializedRoot(roots);
        await featureManager.refresh(currentRoot);
    };
    for (const root of roots) {
        const decWatcher = vscode.workspace.createFileSystemWatcher(
            new vscode.RelativePattern(root, ".memoria/decorations.json")
        );
        decWatcher.onDidChange(() => void refreshFeatures());
        decWatcher.onDidCreate(() => void refreshFeatures());
        decWatcher.onDidDelete(() => void refreshFeatures());
        context.subscriptions.push(decWatcher);
    }

    const memoriaDir = "/.memoria";
    context.subscriptions.push(
        vscode.workspace.onDidDeleteFiles((e) => {
            const affectsMemoria = e.files.some((uri) =>
                uri.path.includes(memoriaDir + "/") || uri.path.endsWith(memoriaDir)
            );
            if (affectsMemoria) {
                void recheckInitialization();
            }
        })
    );
}

function registerCommands(
    context: vscode.ExtensionContext,
    engine: BlueprintEngine,
    registry: BlueprintRegistry,
    manifest: ManifestManager,
    telemetry: DeferredTelemetryLogger,
    resolver: WorkspaceInitConflictResolver,
    featureManager: FeatureManager,
    taskCollectorFeature: TaskCollectorFeature,
    contactsFeature: ContactsFeature,
    onWorkspaceInitialized: (root: vscode.Uri) => Promise<void>
): void {
    context.subscriptions.push(
        vscode.commands.registerCommand(
            "memoria.initializeWorkspace",
            createInitializeWorkspaceCommand(
                engine,
                registry,
                manifest,
                telemetry,
                resolver,
                onWorkspaceInitialized
            )
        ),
        vscode.commands.registerCommand(
            "memoria.toggleDotFolders",
            createToggleDotFoldersCommand(manifest, telemetry)
        ),
        vscode.commands.registerCommand(
            "memoria.manageFeatures",
            createManageFeaturesCommand(manifest, telemetry, featureManager)
        ),
        vscode.commands.registerCommand(
            "memoria.openDefaultFile",
            createOpenDefaultFileCommand(manifest)
        ),
        vscode.commands.registerCommand(
            "memoria.syncTasks",
            createSyncTasksCommand(taskCollectorFeature, telemetry)
        ),
        vscode.commands.registerCommand(
            "memoria.addPerson",
            createAddPersonCommand(contactsFeature)
        ),
        vscode.commands.registerCommand(
            "memoria.editPerson",
            createEditPersonCommand(contactsFeature)
        ),
        vscode.commands.registerCommand(
            "memoria.deletePerson",
            createDeletePersonCommand(contactsFeature)
        ),
        vscode.commands.registerCommand(
            "memoria.movePerson",
            createMovePersonCommand(contactsFeature)
        )
    );
}

/**
 * Sets the VS Code context key `memoria.workspaceInitialized`.
 * This drives the `when` clause visibility of the toggleDotFolders command.
 */
async function updateWorkspaceInitializedContext(
    initializedRoot: vscode.Uri | null
): Promise<void> {
    await vscode.commands.executeCommand(
        "setContext",
        "memoria.workspaceInitialized",
        initializedRoot !== null
    );
}

/**
 * Compares the stored blueprint version in .memoria/blueprint.json with the version
 * of the bundled blueprint. When the bundled version is newer, prompts the user to
 * re-initialize so the latest structure is applied.
 *
 * Runs silently (no-op) when: the workspace is not initialized, the blueprint id is no
 * longer bundled, or the stored version is current.
 *
 * Called with `void` + `.catch()` in activate() because showInformationMessage() with
 * action buttons blocks until the user responds — awaiting it would delay command
 * registration and initial decoration rendering. Errors are swallowed because the
 * update check is best-effort and must never prevent the extension from starting.
 */
async function checkForBlueprintUpdates(
    initializedRoot: vscode.Uri | null,
    manifest: ManifestManager,
    registry: BlueprintRegistry,
    engine: BlueprintEngine,
    resolver: WorkspaceInitConflictResolver,
    featureManager: FeatureManager
): Promise<void> {
    if (!initializedRoot) {
        return;
    }

    const storedManifest = await manifest.readManifest(initializedRoot);
    if (!storedManifest) {
        return;
    }

    let bundledDefinition;
    try {
        bundledDefinition = await registry.getBlueprintDefinition(storedManifest.blueprintId);
    } catch {
        // Blueprint ID no longer bundled — skip silently.
        return;
    }

    if (!isNewerVersion(bundledDefinition.version, storedManifest.blueprintVersion)) {
        return;
    }

    const answer = await vscode.window.showInformationMessage(
        `Memoria: A newer version of blueprint "${bundledDefinition.name}" is available (${bundledDefinition.version}). Re-initialize to apply updates?`,
        "Re-initialize",
        "Later"
    );

    if (answer !== "Re-initialize") {
        return;
    }

    try {
        await engine.reinitialize(initializedRoot, storedManifest.blueprintId, resolver);
        await updateWorkspaceInitializedContext(initializedRoot);
        await featureManager.refresh(initializedRoot);
        vscode.window.showInformationMessage(
            `Memoria: Workspace re-initialized with "${bundledDefinition.name}" ${bundledDefinition.version}.`
        );
    } catch (err) {
        vscode.window.showErrorMessage(
            `Memoria: Re-initialization failed — ${(err as Error).message}`
        );
    }
}

/**
 * Returns true when `bundled` is a strictly newer SemVer than `stored`.
 * Handles only numeric major.minor.patch — pre-release suffixes are not compared.
 *
 * Exported so unit tests can exercise version-comparison logic in isolation,
 * without activating the full extension.
 */
export function isNewerVersion(bundled: string, stored: string): boolean {
    const parse = (v: string): [number, number, number] => {
        const parts = v.split(".").map(Number);
        return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
    };
    const [bMaj, bMin, bPatch] = parse(bundled);
    const [sMaj, sMin, sPatch] = parse(stored);
    if (bMaj !== sMaj) {
        return bMaj > sMaj;
    }
    if (bMin !== sMin) {
        return bMin > sMin;
    }
    return bPatch > sPatch;
}
