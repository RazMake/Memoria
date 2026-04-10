import * as vscode from "vscode";
import { createTelemetry, type TelemetryReporterFactory } from "./telemetry";
import { BlueprintRegistry } from "./blueprints/blueprintRegistry";
import { ManifestManager } from "./blueprints/manifestManager";
import { FileScaffold } from "./blueprints/fileScaffold";
import { BlueprintEngine } from "./blueprints/blueprintEngine";
import { createInitializeWorkspaceCommand } from "./commands/initializeWorkspace";

/** Lazy factory — defers require("@vscode/extension-telemetry") to first call. */
const reporterFactory: TelemetryReporterFactory = (connectionString) => {
    const TelemetryReporter = require("@vscode/extension-telemetry").default;
    return new TelemetryReporter(connectionString);
};

// Extension entry point — called once when the activation event fires.
// Initializes telemetry and registers all commands.
export function activate(context: vscode.ExtensionContext): void {
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

    // Push disposables to context.subscriptions so VS Code cleans them up on deactivation.
    context.subscriptions.push(
        vscode.commands.registerCommand(
            "memoria.initializeWorkspace",
            createInitializeWorkspaceCommand(engine, registry, manifest, telemetry)
        )
    );
}

export function deactivate(): void {}
