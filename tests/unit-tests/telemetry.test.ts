import { describe, it, expect, vi, beforeEach } from "vitest";
import { ConsoleTelemetrySender, createTelemetry, DeferredTelemetryLogger } from "../../src/telemetry";

// Unit tests run outside VS Code — mock only the vscode API surface used by telemetry.ts.
vi.mock("vscode", () => ({
    window: {
        createOutputChannel: vi.fn((name: string) => ({
            appendLine: vi.fn(),
            dispose: vi.fn(),
            name,
        })),
    },
    env: {
        createTelemetryLogger: vi.fn((sender: any) => ({
            logUsage: vi.fn(),
            logError: vi.fn(),
            dispose: vi.fn(),
            sender,
        })),
    },
}));

describe("ConsoleTelemetrySender", () => {
    let sender: ConsoleTelemetrySender;
    let mockOutputChannel: { appendLine: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn> };

    beforeEach(() => {
        mockOutputChannel = {
            appendLine: vi.fn(),
            dispose: vi.fn(),
        };
        sender = new ConsoleTelemetrySender(mockOutputChannel as any);
    });

    it("sendEventData writes to output channel", () => {
        sender.sendEventData("testEvent", { key: "value" });
        expect(mockOutputChannel.appendLine).toHaveBeenCalledOnce();
        const output = mockOutputChannel.appendLine.mock.calls[0][0] as string;
        expect(output).toContain("EVENT: testEvent");
        expect(output).toContain('"key":"value"');
    });

    it("sendEventData works without data", () => {
        sender.sendEventData("testEvent");
        expect(mockOutputChannel.appendLine).toHaveBeenCalledOnce();
        const output = mockOutputChannel.appendLine.mock.calls[0][0] as string;
        expect(output).toContain("EVENT: testEvent");
    });

    it("sendErrorData writes to output channel", () => {
        sender.sendErrorData(new Error("test error"), { context: "testing" });
        expect(mockOutputChannel.appendLine).toHaveBeenCalledOnce();
        const output = mockOutputChannel.appendLine.mock.calls[0][0] as string;
        expect(output).toContain("ERROR: test error");
        expect(output).toContain('"context":"testing"');
    });

    it("sendErrorData works without data", () => {
        sender.sendErrorData(new Error("test error"));
        expect(mockOutputChannel.appendLine).toHaveBeenCalledOnce();
        const output = mockOutputChannel.appendLine.mock.calls[0][0] as string;
        expect(output).toContain("ERROR: test error");
    });

    it("flush does not throw", () => {
        expect(() => sender.flush()).not.toThrow();
    });

    it("dispose does not throw", () => {
        expect(() => sender.dispose()).not.toThrow();
    });
});

describe("createTelemetry", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("returns reporter when connection string and factory are provided", () => {
        const mockReporter = { dispose: vi.fn() };
        const factory = vi.fn(() => mockReporter);
        const context = { subscriptions: [] } as any;

        const result = createTelemetry({ context, connectionString: "InstrumentationKey=test", createReporter: factory });

        expect(factory).toHaveBeenCalledWith("InstrumentationKey=test");
        expect(result).toBe(mockReporter);
        expect(context.subscriptions).toContain(mockReporter);
    });

    it("returns TelemetryLogger when no connection string is provided", async () => {
        const vscode = await import("vscode");
        const context = { subscriptions: [] } as any;

        const result = createTelemetry({ context });

        expect(vscode.env.createTelemetryLogger).toHaveBeenCalled();
        expect(result).toBeDefined();
        expect(context.subscriptions.length).toBeGreaterThan(0);
    });

    it("returns TelemetryLogger when connection string is provided but no factory", async () => {
        const vscode = await import("vscode");
        const context = { subscriptions: [] } as any;

        const result = createTelemetry({ context, connectionString: "InstrumentationKey=test" });

        expect(vscode.env.createTelemetryLogger).toHaveBeenCalled();
        expect(result).toBeDefined();
    });
});

describe("DeferredTelemetryLogger", () => {
    it("logUsage silently drops events before initialize()", () => {
        const logger = new DeferredTelemetryLogger();
        expect(() => logger.logUsage("test.event", { key: "value" })).not.toThrow();
    });

    it("logError silently drops events before initialize()", () => {
        const logger = new DeferredTelemetryLogger();
        expect(() => logger.logError("test.error", { key: "value" })).not.toThrow();
    });

    it("logUsage delegates to the underlying logger after initialize()", () => {
        const mockLogger = { logUsage: vi.fn(), logError: vi.fn(), dispose: vi.fn() } as any;
        const logger = new DeferredTelemetryLogger();
        logger.initialize(mockLogger);
        logger.logUsage("test.event", { key: "value" });
        expect(mockLogger.logUsage).toHaveBeenCalledWith("test.event", { key: "value" });
    });

    it("logError delegates to the underlying logger after initialize()", () => {
        const mockLogger = { logUsage: vi.fn(), logError: vi.fn(), dispose: vi.fn() } as any;
        const logger = new DeferredTelemetryLogger();
        logger.initialize(mockLogger);
        logger.logError("test.error", { path: "file.md" });
        expect(mockLogger.logError).toHaveBeenCalledWith("test.error", { path: "file.md" });
    });
});
