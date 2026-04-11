import { describe, it, expect, vi, beforeEach } from "vitest";

// Unit tests run outside VS Code, so the vscode module must be fully mocked.
// Only mock the API surface that the module under test actually uses.
const mockSubscriptions: any[] = [];
const mockRegisterCommand = vi.fn();
const mockShowInformationMessage = vi.fn();
const mockWatcherDispose = vi.fn();
const mockOnDidCreate = vi.fn();
const mockOnDidDelete = vi.fn();
const mockCreateFileSystemWatcher = vi.fn(() => ({
    onDidCreate: mockOnDidCreate,
    onDidDelete: mockOnDidDelete,
    onDidChange: vi.fn(),
    dispose: mockWatcherDispose,
}));
const mockOnDidDeleteFiles = vi.fn();

vi.mock("vscode", () => ({
    commands: {
        registerCommand: (...args: any[]) => {
            mockRegisterCommand(...args);
            return { dispose: vi.fn() };
        },
        executeCommand: vi.fn().mockResolvedValue(undefined),
    },
    window: {
        showInformationMessage: mockShowInformationMessage,
        createOutputChannel: vi.fn(() => ({
            appendLine: vi.fn(),
            dispose: vi.fn(),
        })),
        registerFileDecorationProvider: vi.fn(() => ({ dispose: vi.fn() })),
    },
    env: {
        createTelemetryLogger: vi.fn(() => ({
            logUsage: vi.fn(),
            logError: vi.fn(),
            dispose: vi.fn(),
        })),
    },
    Uri: {
        joinPath: vi.fn((base: any, ...segments: string[]) => ({
            ...base,
            path: [base.path, ...segments].join("/"),
        })),
    },
    RelativePattern: class {
        constructor(public base: any, public pattern: string) {}
    },
    workspace: {
        workspaceFolders: [{ uri: { path: "/workspace" } }],
        createFileSystemWatcher: (...args: any[]) => mockCreateFileSystemWatcher(...args),
        onDidDeleteFiles: (...args: any[]) => {
            mockOnDidDeleteFiles(...args);
            return { dispose: vi.fn() };
        },
        fs: {
            stat: vi.fn().mockRejectedValue(new Error("not found")),
            readFile: vi.fn(),
            writeFile: vi.fn(),
            createDirectory: vi.fn(),
            readDirectory: vi.fn(),
        },
    },
    EventEmitter: class {
        fire = vi.fn();
        event = vi.fn();
        dispose = vi.fn();
    },
    ThemeColor: class {
        constructor(public id: string) {}
    },
    FileDecoration: class {
        constructor(
            public badge: string | undefined,
            public tooltip: string | undefined,
            public color: any
        ) {}
    },
}));

// Mock the telemetry module so the lazy require("@vscode/extension-telemetry")
// inside extension.ts's reporterFactory is never triggered during unit tests.
vi.mock("../../src/telemetry", () => ({
    createTelemetry: vi.fn(() => ({ logUsage: vi.fn(), dispose: vi.fn() })),
    DeferredTelemetryLogger: class {
        initialize() {}
        logUsage() {}
    },
}));

describe("extension", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockSubscriptions.length = 0;
    });

    it("activate is a function", async () => {
        const { activate } = await import("../../src/extension");
        expect(typeof activate).toBe("function");
    });

    it("deactivate is a function", async () => {
        const { deactivate } = await import("../../src/extension");
        expect(typeof deactivate).toBe("function");
    });

    it("activate registers commands", async () => {
        const { activate } = await import("../../src/extension");
        const context = {
            subscriptions: mockSubscriptions,
            extensionUri: { path: "/ext" },
        } as any;

        await activate(context);

        expect(mockRegisterCommand).toHaveBeenCalledWith("memoria.initializeWorkspace", expect.any(Function));
        expect(mockRegisterCommand).toHaveBeenCalledWith("memoria.toggleDotFolders", expect.any(Function));
    });

    it("deactivate returns void", async () => {
        const { deactivate } = await import("../../src/extension");
        expect(deactivate()).toBeUndefined();
    });

    it("activate creates a file system watcher for .memoria/blueprint.json", async () => {
        const { activate } = await import("../../src/extension");
        const context = {
            subscriptions: mockSubscriptions,
            extensionUri: { path: "/ext" },
        } as any;

        await activate(context);

        expect(mockCreateFileSystemWatcher).toHaveBeenCalledOnce();
        expect(mockOnDidCreate).toHaveBeenCalledWith(expect.any(Function));
        expect(mockOnDidDelete).toHaveBeenCalledWith(expect.any(Function));
    });

    it("activate registers onDidDeleteFiles listener", async () => {
        const { activate } = await import("../../src/extension");
        const context = {
            subscriptions: mockSubscriptions,
            extensionUri: { path: "/ext" },
        } as any;

        await activate(context);

        expect(mockOnDidDeleteFiles).toHaveBeenCalledWith(expect.any(Function));
    });
});
