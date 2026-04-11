import * as vscode from "vscode";
import { createTelemetry, type TelemetryReporterFactory } from "./telemetry";
import { BlueprintRegistry } from "./blueprints/blueprintRegistry";
import { ManifestManager } from "./blueprints/manifestManager";
import { FileScaffold } from "./blueprints/fileScaffold";
import { BlueprintEngine } from "./blueprints/blueprintEngine";
import { ReinitConflictResolver } from "./blueprints/reinitConflictResolver";
import { createInitializeWorkspaceCommand } from "./commands/initializeWorkspace";
import { createToggleDotFoldersCommand } from "./commands/toggleDotFolders";

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

    // Set the context key so menus with `when: memoria.workspaceInitialized` are shown correctly.
    await updateWorkspaceInitializedContext(manifest);

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
                () => updateWorkspaceInitializedContext(manifest)
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
