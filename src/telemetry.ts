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
 * Adapts a TelemetryReporter (from @vscode/extension-telemetry) to the
 * vscode.TelemetrySender interface so it can be used with vscode.env.createTelemetryLogger().
 *
 * This bridges the gap between the CJS-only @vscode/extension-telemetry package
 * and the native VS Code telemetry API. The reporter handles Application Insights
 * transport; the sender interface lets VS Code manage telemetry settings and batching.
 */
export class ReporterTelemetrySender implements vscode.TelemetrySender {
    constructor(private readonly reporter: TelemetryReporterLike) {}

    sendEventData(eventName: string, data?: Record<string, any>): void {
        (this.reporter as any).sendTelemetryEvent?.(eventName, data);
    }

    sendErrorData(error: Error, data?: Record<string, any>): void {
        (this.reporter as any).sendTelemetryErrorEvent?.(error.message, data);
    }

    flush(): void {}

    dispose(): void {}
}

/**
 * Minimal interface for telemetry emission — used by command handlers instead of
 * the concrete vscode.TelemetryLogger so they stay decoupled from initialization timing.
 */
export interface TelemetryEmitter {
    logUsage(eventName: string, data?: Record<string, string | number | boolean>): void;
    logError(eventName: string, data?: Record<string, string | number | boolean>): void;
}

/**
 * Wraps a TelemetryLogger that is initialized asynchronously. Calls to logUsage()
 * are silently dropped until initialize() is called — this lets activation kick off
 * telemetry setup in a microtask without blocking the critical path.
 *
 * Events are silently dropped (not queued) because telemetry is non-critical.
 * Queuing would add complexity and memory overhead for minimal benefit — the window
 * between extension activation and logger initialization is extremely brief (one microtask).
 */
export class DeferredTelemetryLogger implements TelemetryEmitter {
    private logger: vscode.TelemetryLogger | undefined;

    initialize(logger: vscode.TelemetryLogger): void {
        this.logger = logger;
    }

    logUsage(eventName: string, data?: Record<string, string | number | boolean>): void {
        this.logger?.logUsage(eventName, data);
    }

    logError(eventName: string, data?: Record<string, string | number | boolean>): void {
        this.logger?.logError(eventName, data);
    }
}

export interface CreateTelemetryOptions {
    context: vscode.ExtensionContext;
    connectionString?: string;
    /** Factory that creates a TelemetryReporter — injected so this module never imports the CJS package directly. */
    createReporter?: TelemetryReporterFactory;
}

/**
 * Creates a TelemetryLogger. Both paths produce a vscode.TelemetryLogger that
 * can be passed to DeferredTelemetryLogger.initialize().
 *
 * - With a connection string + factory: wraps TelemetryReporter in a TelemetrySender adapter
 * - Without: uses ConsoleTelemetrySender for local output channel logging
 */
export function createTelemetry(options: CreateTelemetryOptions): vscode.TelemetryLogger {
    const { context, connectionString, createReporter } = options;

    if (connectionString && createReporter) {
        const reporter = createReporter(connectionString);
        const sender = new ReporterTelemetrySender(reporter);
        const logger = vscode.env.createTelemetryLogger(sender);
        context.subscriptions.push(logger, reporter);
        return logger;
    }

    const outputChannel = vscode.window.createOutputChannel("Memoria Telemetry");
    const sender = new ConsoleTelemetrySender(outputChannel);
    const logger = vscode.env.createTelemetryLogger(sender);
    context.subscriptions.push(logger, outputChannel);
    return logger;
}
