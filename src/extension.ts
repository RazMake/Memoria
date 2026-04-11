import * as vscode from "vscode";
import { createTelemetry, type TelemetryReporterFactory } from "./telemetry";
import { BlueprintRegistry } from "./blueprints/blueprintRegistry";
import { ManifestManager } from "./blueprints/manifestManager";
import { FileScaffold } from "./blueprints/fileScaffold";
import { BlueprintEngine } from "./blueprints/blueprintEngine";
import { ReinitConflictResolver } from "./blueprints/reinitConflictResolver";
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
    // Telemetry respects the user's telemetry.telemetryLevel setting automatically.
    // createTelemetry() returns TelemetryLogger when no connection string is configured (dev path).
    const telemetry = createTelemetry({
        context,
        createReporter: reporterFactory,
    }) as vscode.TelemetryLogger;

    const registry = new BlueprintRegistry(context.extensionUri);
    const manifest = new ManifestManager(vscode.workspace.fs);
    const scaffold = new FileScaffold(vscode.workspace.fs);
    const engine = new BlueprintEngine(registry, manifest, scaffold);
    const resolver = new ReinitConflictResolver(vscode.workspace.fs, (content) =>
        manifest.computeFileHash(content)
    );

    const decorationProvider = new BlueprintDecorationProvider(manifest);

    // Set the context key so menus with `when: memoria.workspaceInitialized` are shown correctly.
    await updateWorkspaceInitializedContext(manifest);

    // Load decoration rules from any already-initialized workspace so decorations appear
    // immediately on activation without requiring another init/reinit.
    await decorationProvider.refresh();

    // Notify the user when the bundled blueprint has been updated since the workspace was last
    // initialized. Runs silently if the workspace is not initialized or the bundle version
    // hasn't changed.
    await checkForBlueprintUpdates(manifest, registry, engine, resolver, decorationProvider);

    const onWorkspaceInitialized = async (): Promise<void> => {
        await updateWorkspaceInitializedContext(manifest);
        await decorationProvider.refresh();
    };

    // Push disposables to context.subscriptions so VS Code cleans them up on deactivation.
    context.subscriptions.push(
        vscode.window.registerFileDecorationProvider(decorationProvider),
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
 * Sets the VS Code context key `memoria.workspaceInitialized` based on whether
 * any workspace folder has a .memoria/blueprint.json.
 * This drives the `when` clause visibility of the toggleDotFolders command.
 */
async function updateWorkspaceInitializedContext(manifest: ManifestManager): Promise<void> {
    const folders = vscode.workspace.workspaceFolders;
    const roots = folders ? folders.map((f) => f.uri) : [];
    const initializedRoot = await manifest.findInitializedRoot(roots);
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
    manifest: ManifestManager,
    registry: BlueprintRegistry,
    engine: BlueprintEngine,
    resolver: ReinitConflictResolver,
    decorationProvider: BlueprintDecorationProvider
): Promise<void> {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
        return;
    }

    const roots = folders.map((f) => f.uri);
    const workspaceRoot = await manifest.findInitializedRoot(roots);
    if (!workspaceRoot) {
        return;
    }

    const storedManifest = await manifest.readManifest(workspaceRoot);
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
        await engine.reinitialize(workspaceRoot, storedManifest.blueprintId, resolver);
        await updateWorkspaceInitializedContext(manifest);
        await decorationProvider.refresh();
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
