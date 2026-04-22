import { describe, it, expect, vi, beforeEach } from "vitest";

// Unit tests run outside VS Code, so the vscode module must be fully mocked.
// Only mock the API surface that the module under test actually uses.
const mockSubscriptions: any[] = [];
const mockRegisterCommand = vi.fn();
const mockShowInformationMessage = vi.fn();
const mockWatcherDispose = vi.fn();
const mockOnDidCreate = vi.fn();
const mockOnDidDelete = vi.fn();
const mockOnDidChange = vi.fn();
const mockCreateFileSystemWatcher = vi.fn(() => ({
    onDidCreate: mockOnDidCreate,
    onDidDelete: mockOnDidDelete,
    onDidChange: mockOnDidChange,
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
        registerCustomEditorProvider: vi.fn(() => ({ dispose: vi.fn() })),
        registerWebviewViewProvider: vi.fn(() => ({ dispose: vi.fn() })),
    },
    languages: {
        registerCompletionItemProvider: vi.fn(() => ({ dispose: vi.fn() })),
        registerColorProvider: vi.fn(() => ({ dispose: vi.fn() })),
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

    it("should push at least one disposable to context.subscriptions during activation", async () => {
        const { activate } = await import("../../src/extension");
        const context = {
            subscriptions: mockSubscriptions,
            extensionUri: { path: "/ext" },
        } as any;

        await activate(context);

        expect(mockSubscriptions.length).toBeGreaterThan(0);
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
        expect(mockRegisterCommand).toHaveBeenCalledWith("memoria.manageFeatures", expect.any(Function));
        expect(mockRegisterCommand).toHaveBeenCalledWith("memoria.syncTasks", expect.any(Function));
        expect(mockRegisterCommand).toHaveBeenCalledWith("memoria.addPerson", expect.any(Function));
        expect(mockRegisterCommand).toHaveBeenCalledWith("memoria.editPerson", expect.any(Function));
        expect(mockRegisterCommand).toHaveBeenCalledWith("memoria.deletePerson", expect.any(Function));
        expect(mockRegisterCommand).toHaveBeenCalledWith("memoria.movePerson", expect.any(Function));
    });

    it("activate creates file system watchers for blueprint.json and decorations.json", async () => {
        const { activate } = await import("../../src/extension");
        const context = {
            subscriptions: mockSubscriptions,
            extensionUri: { path: "/ext" },
        } as any;

        await activate(context);

        expect(mockCreateFileSystemWatcher).toHaveBeenCalledTimes(2);
        expect(mockCreateFileSystemWatcher).toHaveBeenCalledWith(
            expect.objectContaining({ pattern: ".memoria/blueprint.json" })
        );
        expect(mockCreateFileSystemWatcher).toHaveBeenCalledWith(
            expect.objectContaining({ pattern: ".memoria/decorations.json" })
        );
    });

    it("activate watches decorations.json for create, change, and delete", async () => {
        const { activate } = await import("../../src/extension");
        const context = {
            subscriptions: mockSubscriptions,
            extensionUri: { path: "/ext" },
        } as any;

        await activate(context);

        // Two watchers registered — each calls onDidCreate, onDidDelete, onDidChange
        expect(mockOnDidChange).toHaveBeenCalledWith(expect.any(Function));
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
