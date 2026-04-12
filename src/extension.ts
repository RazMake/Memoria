import * as vscode from "vscode";
import { createTelemetry, DeferredTelemetryLogger, type TelemetryReporterFactory } from "./telemetry";
import { BlueprintRegistry } from "./blueprints/blueprintRegistry";
import { ManifestManager } from "./blueprints/manifestManager";
import { FileScaffold } from "./blueprints/fileScaffold";
import { BlueprintEngine } from "./blueprints/blueprintEngine";
import { ReinitConflictResolver } from "./blueprints/reinitConflictResolver";
import { getWorkspaceRoots } from "./blueprints/workspaceUtils";
import { createInitializeWorkspaceCommand } from "./commands/initializeWorkspace";
import { createToggleDotFoldersCommand } from "./commands/toggleDotFolders";
import { createManageFeaturesCommand } from "./commands/manageFeatures";
import { createOpenDefaultFileCommand, getRootFolderName } from "./commands/openDefaultFile";
import { createOpenUserGuideCommand } from "./commands/openUserGuide";
import { BlueprintDecorationProvider } from "./features/decorations/blueprintDecorationProvider";
import { FeatureManager } from "./features/featureManager";

/** Lazy factory — defers require("@vscode/extension-telemetry") to first call. */
const reporterFactory: TelemetryReporterFactory = (connectionString) => {
    const TelemetryReporter = require("@vscode/extension-telemetry").default;
    return new TelemetryReporter(connectionString);
};

// Extension entry point — called once when the activation event fires.
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
    const resolver = new ReinitConflictResolver(vscode.workspace.fs);

    const decorationProvider = new BlueprintDecorationProvider(manifest);
    const featureManager = new FeatureManager(manifest);
    featureManager.register("decorations", (root, enabled) =>
        decorationProvider.refresh(root, enabled, getWorkspaceRoots())
    );

    // Register the decoration provider eagerly so VS Code is already listening when
    // refresh() fires the change event — otherwise the first fire is wasted.
    context.subscriptions.push(
        vscode.window.registerFileDecorationProvider(decorationProvider),
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

    const onWorkspaceInitialized = async (workspaceRoot: vscode.Uri): Promise<void> => {
        await updateWorkspaceInitializedContext(workspaceRoot);
        await featureManager.refresh(workspaceRoot);
        await updateDefaultFileContext(workspaceRoot, roots, manifest);
        registerDefaultFileWatcher(context, workspaceRoot, roots, manifest);
    };

    registerFileWatchers(context, roots, manifest, featureManager);
    registerDefaultFileWatcher(context, initializedRoot, roots, manifest);
    registerCommands(context, engine, registry, manifest, telemetry, resolver, featureManager, onWorkspaceInitialized);

    context.subscriptions.push(
        vscode.commands.registerCommand(
            "memoria.openUserGuide",
            createOpenUserGuideCommand(context.extensionUri)
        )
    );
}

export function deactivate(): void {
    if (defaultFileWatcherDisposable) {
        defaultFileWatcherDisposable.dispose();
        defaultFileWatcherDisposable = undefined;
    }
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
    featureManager: FeatureManager
): void {
    let lastKnownRoot: string | null = null;

    const recheckInitialization = async (): Promise<void> => {
        const currentRoot = await manifest.findInitializedRoot(roots);
        const currentRootStr = currentRoot?.toString() ?? null;
        if (currentRootStr === lastKnownRoot) {
            return;
        }
        lastKnownRoot = currentRootStr;
        await updateWorkspaceInitializedContext(currentRoot);
        await featureManager.refresh(currentRoot);
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
    resolver: ReinitConflictResolver,
    featureManager: FeatureManager,
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
 * Sets the VS Code context keys for default file availability.
 * - `memoria.defaultFileAvailable`: true when at least one default file exists on disk.
 * - `memoria.defaultFileFolders`: lookup object mapping full folder URI → true for
 *   folders that have an existing default file (drives explorer/context menu visibility).
 *
 * Default file config is read from the single initialized root, but files are checked
 * across all workspace roots so the context menu appears in every root.
 *
 * Keys in defaultFiles are either relative (e.g. "00-ToDo/") — matching any root —
 * or root-prefixed (e.g. "ProjectA/00-ToDo/") — matching only the named root.
 * Root-prefixed keys take priority over relative keys.
 * File paths in values are relative to the matched folder, not to the workspace root.
 */
async function updateDefaultFileContext(
    initializedRoot: vscode.Uri | null,
    allRoots: vscode.Uri[],
    manifest: ManifestManager
): Promise<void> {
    let available = false;
    const folderLookup: Record<string, true> = {};

    if (initializedRoot) {
        const defaultFiles = await manifest.readDefaultFiles(initializedRoot);
        if (defaultFiles) {
            const rootNameSet = new Set(allRoots.map(getRootFolderName));

            const checks: Promise<void>[] = [];

            for (const [key, filePaths] of Object.entries(defaultFiles)) {
                // Classify: root-specific if first segment matches a workspace root name
                // and there is a remaining folder path after the root prefix.
                const firstSlash = key.indexOf("/");
                const firstSegment = key.slice(0, firstSlash);
                const isRootSpecific = rootNameSet.has(firstSegment) && key.length > firstSlash + 1;

                const relFolder = isRootSpecific ? key.slice(firstSlash + 1) : key;
                // Root-specific entries apply only to matching roots.
                // Relative entries apply to all roots that don't have a root-specific override.
                const targetRoots = isRootSpecific
                    ? allRoots.filter((r) => getRootFolderName(r) === firstSegment)
                    : allRoots.filter((r) => !defaultFiles[getRootFolderName(r) + "/" + key]);

                for (const root of targetRoots) {
                    checks.push(
                        (async () => {
                            const folderSegments = relFolder.endsWith("/") ? relFolder.slice(0, -1) : relFolder;
                            let folderHasFile = false;
                            for (const fileName of filePaths) {
                                const fileUri = vscode.Uri.joinPath(
                                    root,
                                    ...folderSegments.split("/"),
                                    ...fileName.split("/")
                                );
                                try {
                                    await vscode.workspace.fs.stat(fileUri);
                                    folderHasFile = true;
                                    break;
                                } catch {
                                    // File does not exist — try next.
                                }
                            }
                            if (folderHasFile) {
                                available = true;
                                const folderUri = folderSegments
                                    ? vscode.Uri.joinPath(root, ...folderSegments.split("/"))
                                    : root;
                                folderLookup[folderUri.toString()] = true;
                            }
                        })()
                    );
                }
            }

            await Promise.all(checks);
        }
    }

    await vscode.commands.executeCommand(
        "setContext",
        "memoria.defaultFileAvailable",
        available
    );
    await vscode.commands.executeCommand(
        "setContext",
        "memoria.defaultFileFolders",
        folderLookup
    );
}

/**
 * Watches .memoria/default-files.json so the context keys and individual file watchers
 * stay in sync when the config is edited externally.
 * Also watches the individual default files so context keys update on create/delete.
 * Stores the current watcher disposables so they can be replaced on re-initialization.
 */
let defaultFileWatcherDisposable: vscode.Disposable | undefined;
function registerDefaultFileWatcher(
    context: vscode.ExtensionContext,
    initializedRoot: vscode.Uri | null,
    allRoots: vscode.Uri[],
    manifest: ManifestManager
): void {
    // Dispose previous watchers if any (e.g. on re-init with different default files).
    if (defaultFileWatcherDisposable) {
        defaultFileWatcherDisposable.dispose();
        defaultFileWatcherDisposable = undefined;
    }

    if (!initializedRoot) {
        return;
    }

    const disposables: vscode.Disposable[] = [];

    // Watch the config file itself — re-read and refresh everything when it changes.
    const configWatcher = vscode.workspace.createFileSystemWatcher(
        new vscode.RelativePattern(initializedRoot, ".memoria/default-files.json")
    );
    const onConfigChanged = async (): Promise<void> => {
        await updateDefaultFileContext(initializedRoot, allRoots, manifest);
        // Re-register watchers for the (possibly changed) individual files.
        registerDefaultFileWatcher(context, initializedRoot, allRoots, manifest);
    };
    configWatcher.onDidCreate(() => void onConfigChanged());
    configWatcher.onDidChange(() => void onConfigChanged());
    configWatcher.onDidDelete(() => void updateDefaultFileContext(initializedRoot, allRoots, manifest));
    disposables.push(configWatcher);
    context.subscriptions.push(configWatcher);

    // Also watch each individual default file for create/delete so context keys
    // update when the user adds or removes the actual files on disk.
    // Watch in ALL roots, not just the initialized one.
    // Root-specific entries are watched only in the matching root.
    void manifest.readDefaultFiles(initializedRoot).then((defaultFiles) => {
        if (!defaultFiles || Object.keys(defaultFiles).length === 0) {
            return;
        }

        const rootNameSet = new Set(allRoots.map(getRootFolderName));

        const fileDisposables: vscode.Disposable[] = [];
        for (const [key, filePaths] of Object.entries(defaultFiles)) {
            const firstSlash = key.indexOf("/");
            const firstSegment = key.slice(0, firstSlash);
            const isRootSpecific = rootNameSet.has(firstSegment) && key.length > firstSlash + 1;

            const relFolder = isRootSpecific ? key.slice(firstSlash + 1) : key;
            // For watchers, root-specific entries watch only matching roots.
            // Relative entries watch all roots (redundant watchers are harmless).
            const watchRoots = isRootSpecific
                ? allRoots.filter((r) => getRootFolderName(r) === firstSegment)
                : allRoots;

            for (const root of watchRoots) {
                for (const fileName of filePaths) {
                    const watcher = vscode.workspace.createFileSystemWatcher(
                        new vscode.RelativePattern(root, relFolder + fileName)
                    );
                    watcher.onDidCreate(() => void updateDefaultFileContext(initializedRoot, allRoots, manifest));
                    watcher.onDidDelete(() => void updateDefaultFileContext(initializedRoot, allRoots, manifest));
                    fileDisposables.push(watcher);
                    context.subscriptions.push(watcher);
                }
            }
        }
        disposables.push(...fileDisposables);
    });

    defaultFileWatcherDisposable = vscode.Disposable.from(...disposables);
}

/**
 * Compares the stored blueprint version in .memoria/blueprint.json with the version
 * of the bundled blueprint. When the bundled version is newer, prompts the user to
 * re-initialize so the latest structure is applied.
 *
 * Runs silently (no-op) when: the workspace is not initialized, the blueprint id is no
 * longer bundled, or the stored version is current.
 */
async function checkForBlueprintUpdates(
    initializedRoot: vscode.Uri | null,
    manifest: ManifestManager,
    registry: BlueprintRegistry,
    engine: BlueprintEngine,
    resolver: ReinitConflictResolver,
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
