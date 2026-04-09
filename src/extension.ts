import * as vscode from "vscode";
import { createTelemetry, type TelemetryReporterFactory } from "./telemetry";

/** Lazy factory — defers require("@vscode/extension-telemetry") to first call. */
const reporterFactory: TelemetryReporterFactory = (connectionString) => {
    const TelemetryReporter = require("@vscode/extension-telemetry").default;
    return new TelemetryReporter(connectionString);
};

// Extension entry point — called once when the activation event fires.
// Initializes telemetry and registers all commands.
export function activate(context: vscode.ExtensionContext): void {
    // Telemetry respects the user's telemetry.telemetryLevel setting automatically.
    const telemetry = createTelemetry({
        context,
        createReporter: reporterFactory,
    });

    // Push disposables to context.subscriptions so VS Code cleans them up on deactivation.
    context.subscriptions.push(
        vscode.commands.registerCommand("memoria.initializeWorkspace", () => {
            vscode.window.showInformationMessage("Memoria: Initialize workspace");
        })
    );
}

export function deactivate(): void {}
