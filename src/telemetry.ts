import * as vscode from "vscode";

/** Minimal disposable interface returned by telemetry factories. */
export interface TelemetryReporterLike extends vscode.Disposable {
    // Marker — concrete type is opaque to callers.
}

/** Constructor signature for TelemetryReporter, injected from extension.ts. */
export type TelemetryReporterFactory = (connectionString: string) => TelemetryReporterLike;

/**
 * Writes telemetry events to a local VS Code OutputChannel
 * for development observability when no Application Insights key is configured.
 * In production, replace with a real connection string to route events to AppInsights.
 */
export class ConsoleTelemetrySender implements vscode.TelemetrySender {
    constructor(private readonly outputChannel: vscode.OutputChannel) {}

    sendEventData(eventName: string, data?: Record<string, any>): void {
        const timestamp = new Date().toISOString();
        this.outputChannel.appendLine(
            `[${timestamp}] EVENT: ${eventName}${data ? " " + JSON.stringify(data) : ""}`
        );
    }

    sendErrorData(error: Error, data?: Record<string, any>): void {
        const timestamp = new Date().toISOString();
        this.outputChannel.appendLine(
            `[${timestamp}] ERROR: ${error.message}${data ? " " + JSON.stringify(data) : ""}`
        );
    }

    flush(): void {}

    dispose(): void {}
}

/**
 * Minimal interface for telemetry emission — used by command handlers instead of
 * the concrete vscode.TelemetryLogger so they stay decoupled from initialization timing.
 */
export interface TelemetryEmitter {
    logUsage(eventName: string, data?: Record<string, any>): void;
}

/**
 * Wraps a TelemetryLogger that is initialized asynchronously. Calls to logUsage()
 * are silently dropped until initialize() is called — this lets activation kick off
 * telemetry setup in a microtask without blocking the critical path.
 */
export class DeferredTelemetryLogger implements TelemetryEmitter {
    private logger: vscode.TelemetryLogger | undefined;

    initialize(logger: vscode.TelemetryLogger): void {
        this.logger = logger;
    }

    logUsage(eventName: string, data?: Record<string, any>): void {
        this.logger?.logUsage(eventName, data);
    }
}

export interface CreateTelemetryOptions {
    context: vscode.ExtensionContext;
    connectionString?: string;
    /** Factory that creates a TelemetryReporter — injected so this module never imports the CJS package directly. */
    createReporter?: TelemetryReporterFactory;
}

/**
 * Creates a telemetry reporter or logger.
 *
 * - With a connection string + factory: returns a TelemetryReporter that sends to Application Insights.
 * - Without: returns a TelemetryLogger that logs to a local OutputChannel.
 *
 * Both respect VS Code's telemetry.telemetryLevel user setting automatically.
 */
export function createTelemetry(
    options: CreateTelemetryOptions
): TelemetryReporterLike | vscode.TelemetryLogger {
    const { context, connectionString, createReporter } = options;

    if (connectionString && createReporter) {
        const reporter = createReporter(connectionString);
        context.subscriptions.push(reporter);
        return reporter;
    }

    const outputChannel = vscode.window.createOutputChannel("Memoria Telemetry");
    const sender = new ConsoleTelemetrySender(outputChannel);
    const logger = vscode.env.createTelemetryLogger(sender);
    context.subscriptions.push(logger, outputChannel);
    return logger;
}
