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
import { BlueprintDecorationProvider } from "./features/decorations/blueprintDecorationProvider";

/** Lazy factory — defers require("@vscode/extension-telemetry") to first call. */
const reporterFactory: TelemetryReporterFactory = (connectionString) => {
    const TelemetryReporter = require("@vscode/extension-telemetry").default;
    return new TelemetryReporter(connectionString);
};

// Extension entry point — called once when the activation event fires.
// Initializes telemetry and registers all commands.
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

    // Register the decoration provider eagerly so VS Code is already listening when
    // refresh() fires the change event — otherwise the first fire is wasted.
    context.subscriptions.push(
        vscode.window.registerFileDecorationProvider(decorationProvider),
    );

    // Discover the initialized root once and share it across all startup operations
    // instead of calling findInitializedRoot() separately in each one (saves 2 fs.stat round-trips).
    const roots = getWorkspaceRoots();
    const initializedRoot = await manifest.findInitializedRoot(roots);

    // Set the context key and load decoration rules in parallel — they are independent.
    await Promise.all([
        updateWorkspaceInitializedContext(initializedRoot),
        decorationProvider.refresh(initializedRoot),
    ]);

    // Check for blueprint updates in the background — this may show a dialog that blocks
    // indefinitely and must not delay decoration rendering.
    void checkForBlueprintUpdates(
        initializedRoot,
        manifest,
        registry,
        engine,
        resolver,
        decorationProvider
    ).catch(() => {
        /* update check is best-effort — swallow errors silently */
    });

    const onWorkspaceInitialized = async (workspaceRoot: vscode.Uri): Promise<void> => {
        await updateWorkspaceInitializedContext(workspaceRoot);
        await decorationProvider.refresh(workspaceRoot);
    };

    // Keep the context key in sync when the initialization marker is
    // created or deleted outside our own commands.
    //
    // Two complementary listeners are needed:
    //  • FileSystemWatcher — fires for external FS changes (terminal, OS, etc.)
    //  • onDidDeleteFiles  — fires when the user deletes via the VS Code Explorer.
    //    (Deleting the .memoria/ *directory* does not trigger the file-level watcher
    //     because the glob targets a child file, not the directory itself.)
    const recheckInitialization = async (): Promise<void> => {
        const currentRoot = await manifest.findInitializedRoot(roots);
        await updateWorkspaceInitializedContext(currentRoot);
        await decorationProvider.refresh(currentRoot);
    };

    if (roots.length > 0) {
        const manifestWatcher = vscode.workspace.createFileSystemWatcher(
            new vscode.RelativePattern(roots[0], ".memoria/blueprint.json")
        );
        manifestWatcher.onDidCreate(recheckInitialization);
        manifestWatcher.onDidDelete(recheckInitialization);
        context.subscriptions.push(manifestWatcher);
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

    // Push disposables to context.subscriptions so VS Code cleans them up on deactivation.
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
        )
    );
}

export function deactivate(): void {}

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
 */
async function checkForBlueprintUpdates(
    initializedRoot: vscode.Uri | null,
    manifest: ManifestManager,
    registry: BlueprintRegistry,
    engine: BlueprintEngine,
    resolver: ReinitConflictResolver,
    decorationProvider: BlueprintDecorationProvider
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
        await decorationProvider.refresh(initializedRoot);
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
