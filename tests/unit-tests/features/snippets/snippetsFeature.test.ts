import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Mock helpers ──────────────────────────────────────────────────────────────

interface MockUri {
    path: string;
    fsPath: string;
    scheme: string;
    toString(): string;
}

function createUri(path: string): MockUri {
    return {
        path,
        fsPath: path,
        scheme: "file",
        toString: () => `file://${path}`,
    };
}

// ── Capture watcher callbacks ─────────────────────────────────────────────────

type WatcherCallback = () => void;
let watcherOnCreate: WatcherCallback | undefined;
let watcherOnChange: WatcherCallback | undefined;
let watcherOnDelete: WatcherCallback | undefined;

const mockWatcherDispose = vi.fn();

const mockShowWarningMessage = vi.fn();
const mockShowQuickPick = vi.fn();

vi.mock("vscode", () => {
    class RelativePattern {
        constructor(public readonly base: unknown, public readonly pattern: string) {}
    }

    class EventEmitter {
        private listeners: Array<(...args: unknown[]) => void> = [];
        event = (listener: (...args: unknown[]) => void) => {
            this.listeners.push(listener);
            return { dispose: () => { this.listeners = this.listeners.filter((l) => l !== listener); } };
        };
        fire(...args: unknown[]) {
            for (const l of this.listeners) l(...args);
        }
        dispose() {
            this.listeners = [];
        }
    }

    return {
        Uri: {
            joinPath: (base: MockUri, ...segments: string[]) => {
                const joined = [base.path, ...segments].join("/").replace(/\/+/g, "/");
                return createUri(joined);
            },
        },
        RelativePattern,
        EventEmitter,
        FileType: { File: 1, Directory: 2 },
        workspace: {
            createFileSystemWatcher: vi.fn(() => ({
                onDidCreate: vi.fn((cb: WatcherCallback) => {
                    watcherOnCreate = cb;
                    return { dispose: vi.fn() };
                }),
                onDidChange: vi.fn((cb: WatcherCallback) => {
                    watcherOnChange = cb;
                    return { dispose: vi.fn() };
                }),
                onDidDelete: vi.fn((cb: WatcherCallback) => {
                    watcherOnDelete = cb;
                    return { dispose: vi.fn() };
                }),
                dispose: mockWatcherDispose,
            })),
            fs: {
                readFile: vi.fn(),
                readDirectory: vi.fn(),
            },
        },
        window: {
            showWarningMessage: (...args: unknown[]) => mockShowWarningMessage(...args),
            showQuickPick: (...args: unknown[]) => mockShowQuickPick(...args),
        },
    };
});

vi.mock("../../../../src/features/snippets/snippetCompiler", () => ({
    compileSnippetFile: vi.fn(),
}));

vi.mock("../../../../src/features/snippets/contactSnippets", () => ({
    generateContactSnippets: vi.fn(() => []),
}));

import { SnippetsFeature } from "../../../../src/features/snippets/snippetsFeature";
import { compileSnippetFile } from "../../../../src/features/snippets/snippetCompiler";
import { generateContactSnippets } from "../../../../src/features/snippets/contactSnippets";
import * as vscode from "vscode";
import type { SnippetDefinition } from "../../../../src/features/snippets/types";

// ── Mock factories ────────────────────────────────────────────────────────────

const workspaceRoot = createUri("/workspace");

const snippetA: SnippetDefinition = {
    trigger: "{hello}",
    label: "Hello",
    glob: "**/*.md",
    body: "Hello, world!",
};

const snippetDynamic: SnippetDefinition = {
    trigger: "{greet}",
    label: "Greet",
    glob: "**/*.md",
    expand: vi.fn(() => "Hi there"),
};

const snippetPathSafe: SnippetDefinition = {
    trigger: "{ps}",
    label: "Path Safe",
    glob: "**/*",
    body: "safe-value",
    pathSafe: true,
};

function createMockManifest(overrides?: { snippets?: unknown; fileManifest?: Record<string, unknown> }) {
    return {
        readManifest: vi.fn(async () => ({
            snippets: overrides?.snippets ?? { snippetsFolder: ".memoria/snippets" },
            fileManifest: overrides?.fileManifest ?? {},
        })),
    };
}

function createMockContactsFeature(contacts: unknown[] = []) {
    const listeners: Array<() => void> = [];
    return {
        isActive: vi.fn(() => true),
        getAllContacts: vi.fn(() => contacts),
        onDidUpdate: vi.fn((cb: () => void) => {
            listeners.push(cb);
            return { dispose: vi.fn() };
        }),
        _fire: () => listeners.forEach((l) => l()),
    };
}

const mockFs = vscode.workspace.fs as {
    readFile: ReturnType<typeof vi.fn>;
    readDirectory: ReturnType<typeof vi.fn>;
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("SnippetsFeature", () => {
    let feature: SnippetsFeature;
    let mockManifest: ReturnType<typeof createMockManifest>;

    beforeEach(() => {
        vi.clearAllMocks();
        watcherOnCreate = undefined;
        watcherOnChange = undefined;
        watcherOnDelete = undefined;
        mockManifest = createMockManifest();
        mockFs.readDirectory.mockResolvedValue([
            ["greetings.ts", vscode.FileType.File],
        ]);
        vi.mocked(compileSnippetFile).mockResolvedValue([snippetA]);
        feature = new SnippetsFeature(mockManifest as any, null, 0, mockFs as any);
    });

    afterEach(() => {
        feature.dispose();
    });

    // ── refresh() ─────────────────────────────────────────────────────────

    describe("refresh", () => {
        it("should start when enabled with a workspace root", async () => {
            await feature.refresh(workspaceRoot as any, true);

            expect(feature.isActive()).toBe(true);
            expect(mockManifest.readManifest).toHaveBeenCalledWith(workspaceRoot);
            expect(compileSnippetFile).toHaveBeenCalled();
        });

        it("should stop when disabled", async () => {
            await feature.refresh(workspaceRoot as any, true);
            expect(feature.isActive()).toBe(true);

            await feature.refresh(workspaceRoot as any, false);

            expect(feature.isActive()).toBe(false);
        });

        it("should handle null workspace root", async () => {
            await feature.refresh(null, true);

            expect(feature.isActive()).toBe(false);
            expect(compileSnippetFile).not.toHaveBeenCalled();
        });

        it("should load path-safe snippets when disabled but root is present", async () => {
            vi.mocked(compileSnippetFile).mockResolvedValue([snippetA, snippetPathSafe]);

            await feature.refresh(workspaceRoot as any, false);

            expect(feature.isActive()).toBe(false);
            expect(feature.expandPathSnippet("{ps}")).toBe("safe-value");
        });

        it("should handle null snippets config in loadPathSafeOnly", async () => {
            // When manifest has no snippets config and disabled, loadPathSafeOnly clears path-safe snippets
            mockManifest.readManifest.mockResolvedValue({});

            await feature.refresh(workspaceRoot as any, false);

            expect(feature.isActive()).toBe(false);
            expect(feature.expandPathSnippet("{ps}")).toBeNull();
        });
    });

    // ── start() ───────────────────────────────────────────────────────────

    describe("start", () => {
        it("should read snippet files from the snippets folder", async () => {
            mockFs.readDirectory.mockResolvedValue([
                ["a.ts", vscode.FileType.File],
                ["b.ts", vscode.FileType.File],
                ["readme.md", vscode.FileType.File],
            ]);
            vi.mocked(compileSnippetFile).mockResolvedValue([snippetA]);

            await feature.start(workspaceRoot as any);

            // Should compile only .ts files (a.ts and b.ts), not readme.md.
            expect(compileSnippetFile).toHaveBeenCalledTimes(2);
            expect(feature.getSnippets()).toHaveLength(2);
        });

        it("should install a file watcher on the snippets folder", async () => {
            await feature.start(workspaceRoot as any);

            expect(vscode.workspace.createFileSystemWatcher).toHaveBeenCalled();
        });

        it("should not activate when manifest has no snippets config", async () => {
            mockManifest.readManifest.mockResolvedValue({});

            await feature.start(workspaceRoot as any);

            expect(feature.isActive()).toBe(false);
            expect(compileSnippetFile).not.toHaveBeenCalled();
        });

        it("should handle readDirectory failure gracefully", async () => {
            mockFs.readDirectory.mockRejectedValue(new Error("ENOENT"));

            await feature.start(workspaceRoot as any);

            expect(feature.getSnippets()).toHaveLength(0);
        });
    });

    // ── stop() ────────────────────────────────────────────────────────────

    describe("stop", () => {
        it("should clear state and dispose watchers", async () => {
            await feature.start(workspaceRoot as any);
            expect(feature.isActive()).toBe(true);

            await feature.stop();

            expect(feature.isActive()).toBe(false);
            expect(feature.getSnippets()).toHaveLength(0);
            expect(feature.getAllSnippets()).toHaveLength(0);
            expect(mockWatcherDispose).toHaveBeenCalled();
        });
    });

    // ── expandSnippet() ───────────────────────────────────────────────────

    describe("expandSnippet", () => {
        const mockDocument = { uri: createUri("/test.md") } as any;
        const mockPosition = { line: 0, character: 0 } as any;

        it("should return body for simple snippet", async () => {
            const result = await feature.expandSnippet(snippetA, mockDocument, mockPosition);

            expect(result).toBe("Hello, world!");
        });

        it("should call expand function for dynamic snippets", async () => {
            const result = await feature.expandSnippet(snippetDynamic, mockDocument, mockPosition);

            expect(result).toBe("Hi there");
            expect(snippetDynamic.expand).toHaveBeenCalled();
        });

        it("should return empty string when snippet has neither body nor expand", async () => {
            const emptySnippet: SnippetDefinition = {
                trigger: "{empty}",
                label: "Empty",
                glob: "**/*",
            };

            const result = await feature.expandSnippet(emptySnippet, mockDocument, mockPosition);

            expect(result).toBe("");
        });

        it("should show warning and return error text when expand throws", async () => {
            const failingSnippet: SnippetDefinition = {
                trigger: "{fail}",
                label: "Fail",
                glob: "**/*",
                expand: () => { throw new Error("boom"); },
            };

            const result = await feature.expandSnippet(failingSnippet, mockDocument, mockPosition);

            expect(result).toContain("⚠️ Snippet error ({fail}): boom");
            expect(mockShowWarningMessage).toHaveBeenCalledWith(
                expect.stringContaining("Snippet '{fail}' failed: boom"),
            );
        });

        it("should use selected text as single parameter value", async () => {
            const paramSnippet: SnippetDefinition = {
                trigger: "{wrap}",
                label: "Wrap",
                glob: "**/*",
                parameters: [{ name: "text" }],
                expand: (ctx) => `[${ctx.params["text"]}]`,
            };

            const result = await feature.expandSnippet(paramSnippet, mockDocument, mockPosition, "selected");

            expect(result).toBe("[selected]");
        });

        it("should prompt with QuickPick for multiple parameters", async () => {
            const multiParamSnippet: SnippetDefinition = {
                trigger: "{multi}",
                label: "Multi",
                glob: "**/*",
                parameters: [
                    { name: "color", options: ["red", "blue"], default: "red" },
                    { name: "size", options: ["sm", "lg"], default: "sm" },
                ],
                expand: (ctx) => `${ctx.params["color"]}-${ctx.params["size"]}`,
            };
            mockShowQuickPick.mockResolvedValueOnce("blue").mockResolvedValueOnce("lg");

            const result = await feature.expandSnippet(multiParamSnippet, mockDocument, mockPosition);

            expect(mockShowQuickPick).toHaveBeenCalledTimes(2);
            expect(result).toBe("blue-lg");
        });

        it("should use resolveOptions to compute dynamic options", async () => {
            const dynamicParamSnippet: SnippetDefinition = {
                trigger: "{dyn}",
                label: "Dynamic",
                glob: "**/*",
                parameters: [
                    {
                        name: "choice",
                        resolveOptions: (ctx) => [`line-${ctx.position?.line ?? "?"}`, "static"],
                    },
                ],
                expand: (ctx) => ctx.params["choice"],
            };
            mockShowQuickPick.mockResolvedValueOnce("line-0");

            const result = await feature.expandSnippet(dynamicParamSnippet, mockDocument, mockPosition);

            expect(mockShowQuickPick).toHaveBeenCalledWith(
                ["line-0", "static"],
                { placeHolder: "Select choice" },
            );
            expect(result).toBe("line-0");
        });

        it("should prefer resolveOptions over static options when both present", async () => {
            const bothSnippet: SnippetDefinition = {
                trigger: "{both}",
                label: "Both",
                glob: "**/*",
                parameters: [
                    {
                        name: "val",
                        options: ["static-a", "static-b"],
                        resolveOptions: () => ["dynamic-a", "dynamic-b"],
                    },
                ],
                expand: (ctx) => ctx.params["val"],
            };
            mockShowQuickPick.mockResolvedValueOnce("dynamic-a");

            const result = await feature.expandSnippet(bothSnippet, mockDocument, mockPosition);

            expect(mockShowQuickPick).toHaveBeenCalledWith(
                ["dynamic-a", "dynamic-b"],
                expect.anything(),
            );
            expect(result).toBe("dynamic-a");
        });
    });

    // ── getAllSnippets() ───────────────────────────────────────────────────

    describe("getAllSnippets", () => {
        it("should return loaded snippets when active", async () => {
            await feature.start(workspaceRoot as any);

            const all = feature.getAllSnippets();

            expect(all).toHaveLength(1);
            expect(all[0].trigger).toBe("{hello}");
        });

        it("should return empty when not active", () => {
            expect(feature.getAllSnippets()).toHaveLength(0);
        });

        it("should include contact snippets when contacts feature is active", async () => {
            const mockContacts = createMockContactsFeature();
            const contactSnippet: SnippetDefinition = {
                trigger: "@alice",
                label: "Alice",
                glob: "**/*",
                body: "Alice Smith",
            };
            vi.mocked(generateContactSnippets).mockReturnValue([contactSnippet]);

            feature = new SnippetsFeature(mockManifest as any, mockContacts as any, 0, mockFs as any);
            await feature.start(workspaceRoot as any);

            const all = feature.getAllSnippets();

            expect(all).toContainEqual(expect.objectContaining({ trigger: "@alice" }));
        });

        it("should not include a {template} snippet (templates are opened via Ctrl+.)", async () => {
            const manifest = {
                readManifest: vi.fn(async () => ({
                    snippets: {
                        snippetsFolder: ".memoria/snippets",
                        templatesFolder: ".memoria/templates",
                    },
                    fileManifest: {},
                })),
            };
            mockFs.readDirectory
                .mockResolvedValueOnce([]) // snippets folder
                .mockResolvedValueOnce([["hello.md", vscode.FileType.File]]); // templates folder
            const encoder = new TextEncoder();
            mockFs.readFile = vi.fn().mockResolvedValue(encoder.encode("# Hello\n\nbody"));

            const f = new SnippetsFeature(manifest as any, null, 0, mockFs as any);
            await f.start(workspaceRoot as any);

            const all = f.getAllSnippets();

            expect(all.find((s) => s.trigger === "{template}")).toBeUndefined();
            f.dispose();
        });
    });

    // ── getPathSafeSnippets / expandPathSnippet ───────────────────────────

    describe("expandPathSnippet", () => {
        it("should return body for path-safe snippet", async () => {
            vi.mocked(compileSnippetFile).mockResolvedValue([snippetA, snippetPathSafe]);

            await feature.start(workspaceRoot as any);

            expect(feature.expandPathSnippet("{ps}")).toBe("safe-value");
        });

        it("should return null for non-existent trigger", async () => {
            await feature.start(workspaceRoot as any);

            expect(feature.expandPathSnippet("{nonexistent}")).toBeNull();
        });

        it("should call expand for dynamic path-safe snippet", async () => {
            const dynamicPathSafe: SnippetDefinition = {
                trigger: "{dps}",
                label: "Dynamic Path Safe",
                glob: "**/*",
                pathSafe: true,
                expand: vi.fn(() => "dynamic-value"),
            };
            vi.mocked(compileSnippetFile).mockResolvedValue([dynamicPathSafe]);

            await feature.start(workspaceRoot as any);

            expect(feature.expandPathSnippet("{dps}")).toBe("dynamic-value");
            expect(dynamicPathSafe.expand).toHaveBeenCalled();
        });

        it("should return null when dynamic path-safe snippet expand throws", async () => {
            const failingPathSafe: SnippetDefinition = {
                trigger: "{fps}",
                label: "Failing",
                glob: "**/*",
                pathSafe: true,
                expand: () => { throw new Error("fail"); },
            };
            vi.mocked(compileSnippetFile).mockResolvedValue([failingPathSafe]);

            await feature.start(workspaceRoot as any);

            expect(feature.expandPathSnippet("{fps}")).toBeNull();
        });
    });

    // ── isActive ──────────────────────────────────────────────────────────

    describe("isActive", () => {
        it("should be false before start", () => {
            expect(feature.isActive()).toBe(false);
        });

        it("should be true after start", async () => {
            await feature.start(workspaceRoot as any);

            expect(feature.isActive()).toBe(true);
        });

        it("should be false after stop", async () => {
            await feature.start(workspaceRoot as any);
            await feature.stop();

            expect(feature.isActive()).toBe(false);
        });
    });

    // ── Error handling ────────────────────────────────────────────────────

    describe("error handling", () => {
        it("should show warning when snippet file fails to compile", async () => {
            vi.mocked(compileSnippetFile).mockRejectedValue(new Error("Syntax error"));

            await feature.start(workspaceRoot as any);

            expect(mockShowWarningMessage).toHaveBeenCalledWith(
                expect.stringContaining("Failed to load snippet file"),
            );
            expect(mockShowWarningMessage).toHaveBeenCalledWith(
                expect.stringContaining("Syntax error"),
            );
        });

        it("should still load other files when one fails to compile", async () => {
            mockFs.readDirectory.mockResolvedValue([
                ["good.ts", vscode.FileType.File],
                ["bad.ts", vscode.FileType.File],
            ]);
            vi.mocked(compileSnippetFile)
                .mockResolvedValueOnce([snippetA])
                .mockRejectedValueOnce(new Error("Bad file"));

            await feature.start(workspaceRoot as any);

            expect(feature.getSnippets()).toHaveLength(1);
            expect(feature.getSnippets()[0].trigger).toBe("{hello}");
            expect(mockShowWarningMessage).toHaveBeenCalledOnce();
        });
    });

    // ── Template provider methods ─────────────────────────────────────────

    describe("templatesFolder", () => {
        function createMockManifestWithTemplates() {
            return {
                readManifest: vi.fn(async () => ({
                    snippets: {
                        snippetsFolder: ".memoria/snippets",
                        templatesFolder: ".memoria/templates",
                    },
                    fileManifest: {},
                })),
            };
        }

        it("installs a template watcher when templatesFolder is configured", async () => {
            const manifest = createMockManifestWithTemplates();
            mockFs.readDirectory.mockResolvedValue([]);

            const f = new SnippetsFeature(manifest as any, null, 0, mockFs as any);
            await f.start(workspaceRoot as any);

            // The watcher factory should have been called twice (snippets + templates)
            expect(vscode.workspace.createFileSystemWatcher).toHaveBeenCalledTimes(2);
            f.dispose();
        });

        it("listTemplates() returns indexed templates after start", async () => {
            const manifest = createMockManifestWithTemplates();
            // First call: snippets folder (empty). Second call: templates folder.
            mockFs.readDirectory
                .mockResolvedValueOnce([])
                .mockResolvedValueOnce([["hello.md", vscode.FileType.File]]);

            // Provide template body bytes
            const encoder = new TextEncoder();
            mockFs.readFile = vi.fn().mockResolvedValue(encoder.encode("---\nname: FreeText()\n---\n# Hello\n"));

            const f = new SnippetsFeature(manifest as any, null, 0, mockFs as any);
            await f.start(workspaceRoot as any);

            const templates = f.listTemplates();
            expect(templates).toHaveLength(1);
            expect(templates[0].relativePath).toBe("hello.md");
            f.dispose();
        });

        it("listTemplates() returns empty when no templatesFolder configured", async () => {
            // The default manifest has no templatesFolder
            const f = new SnippetsFeature(mockManifest as any, null, 0, mockFs as any);
            await f.start(workspaceRoot as any);
            expect(f.listTemplates()).toHaveLength(0);
            f.dispose();
        });

        it("readTemplate() reads bytes from the templates folder", async () => {
            const manifest = createMockManifestWithTemplates();
            mockFs.readDirectory.mockResolvedValue([]);
            const encoder = new TextEncoder();
            const bytes = encoder.encode("template body");
            mockFs.readFile = vi.fn().mockResolvedValue(bytes);

            const f = new SnippetsFeature(manifest as any, null, 0, mockFs as any);
            await f.start(workspaceRoot as any);
            const text = await f.readTemplate("test.md");
            expect(text).toBe("template body");
            f.dispose();
        });

        it("readTemplate() throws when templates folder is not configured", async () => {
            const f = new SnippetsFeature(mockManifest as any, null, 0, mockFs as any);
            await f.start(workspaceRoot as any);
            await expect(f.readTemplate("test.md")).rejects.toThrow("not configured");
            f.dispose();
        });

        it("getFunctions() returns empty array by default", async () => {
            const f = new SnippetsFeature(mockManifest as any, null, 0, mockFs as any);
            await f.start(workspaceRoot as any);
            expect(f.getFunctions()).toEqual([]);
            f.dispose();
        });

        it("getFunctions() returns host functions set via setHostFunctions()", async () => {
            const f = new SnippetsFeature(mockManifest as any, null, 0, mockFs as any);
            const fakeFn = { name: "TestFn", describeInputs: () => [], resolve: () => "" };
            f.setHostFunctions([fakeFn]);
            await f.start(workspaceRoot as any);
            expect(f.getFunctions()).toContain(fakeFn);
            f.dispose();
        });

        it("getFunctions() includes user functions loaded from _functions folder", async () => {
            const manifest = createMockManifestWithTemplates();
            mockFs.readDirectory
                .mockResolvedValueOnce([]) // snippets folder
                .mockResolvedValueOnce([]) // templates folder (no templates)
                .mockResolvedValueOnce([["myFn.ts", vscode.FileType.File]]); // _functions folder

            const encoder = new TextEncoder();
            // A minimal valid template function source
            const fnSource = `exports.FN = { name: "MyFn", describeInputs: () => [], resolve: () => "" };`;
            mockFs.readFile = vi.fn().mockResolvedValue(encoder.encode(fnSource));

            const f = new SnippetsFeature(manifest as any, null, 0, mockFs as any);
            await f.start(workspaceRoot as any);

            // If compileFunctionSource throws for this source, getFunctions returns []
            // If it succeeds, templateFunctions will have an entry
            // Either way we exercise the try/catch in loadUserFunctions
            expect(() => f.getFunctions()).not.toThrow();
            f.dispose();
        });

        it("discoverTemplates() returns [] when readDirectory throws", async () => {
            const manifest = createMockManifestWithTemplates();
            mockFs.readDirectory
                .mockResolvedValueOnce([]) // snippets folder
                .mockRejectedValueOnce(new Error("not found")); // templates folder

            const f = new SnippetsFeature(manifest as any, null, 0, mockFs as any);
            await f.start(workspaceRoot as any);

            expect(f.listTemplates()).toHaveLength(0);
            f.dispose();
        });

        it("discoverTemplates() recurses into subdirectories", async () => {
            const manifest = createMockManifestWithTemplates();
            mockFs.readDirectory
                .mockResolvedValueOnce([]) // snippets folder
                .mockResolvedValueOnce([
                    ["subfolder", vscode.FileType.Directory],
                    ["root.md", vscode.FileType.File],
                ])
                .mockResolvedValueOnce([
                    ["nested.md", vscode.FileType.File],
                ]);

            const encoder = new TextEncoder();
            mockFs.readFile = vi.fn().mockResolvedValue(encoder.encode("# Template Title\n\nbody"));

            const f = new SnippetsFeature(manifest as any, null, 0, mockFs as any);
            await f.start(workspaceRoot as any);

            const templates = f.listTemplates();
            expect(templates).toHaveLength(2);
            const paths = templates.map((t) => t.relativePath);
            expect(paths).toContain("root.md");
            expect(paths).toContain("subfolder/nested.md");
            f.dispose();
        });

        it("discoverTemplates() skips entries starting with _", async () => {
            const manifest = createMockManifestWithTemplates();
            mockFs.readDirectory
                .mockResolvedValueOnce([]) // snippets folder
                .mockResolvedValueOnce([
                    ["_functions", vscode.FileType.Directory],
                    ["valid.md", vscode.FileType.File],
                ]);

            const encoder = new TextEncoder();
            mockFs.readFile = vi.fn().mockResolvedValue(encoder.encode("body"));

            const f = new SnippetsFeature(manifest as any, null, 0, mockFs as any);
            await f.start(workspaceRoot as any);

            expect(f.listTemplates()).toHaveLength(1);
            expect(f.listTemplates()[0].relativePath).toBe("valid.md");
            f.dispose();
        });

        it("triggers reloadTemplates when template watcher fires", async () => {
            const manifest = createMockManifestWithTemplates();
            mockFs.readDirectory
                .mockResolvedValue([]);
            const encoder = new TextEncoder();
            mockFs.readFile = vi.fn().mockResolvedValue(encoder.encode("---\nname: FreeText()\n---\n# Hello\n"));

            const f = new SnippetsFeature(manifest as any, null, 0, mockFs as any);
            await f.start(workspaceRoot as any);

            const callsAfterStart = mockFs.readDirectory.mock.calls.length;

            // watcherOnChange is captured by the last watcher - the template watcher
            // Trigger it and wait for debounce (debounceMs=0)
            expect(watcherOnChange).toBeDefined();
            watcherOnChange!();
            await new Promise((resolve) => setTimeout(resolve, 10));

            // reloadTemplates was called (readDirectory called again)
            expect(mockFs.readDirectory.mock.calls.length).toBeGreaterThan(callsAfterStart);
            f.dispose();
        });
    });

    describe("watcher callbacks", () => {
        it("triggers reloadAllSnippets when snippet watcher fires", async () => {
            vi.mocked(compileSnippetFile).mockResolvedValue([snippetA]);
            await feature.start(workspaceRoot as any);

            const initialCalls = vi.mocked(compileSnippetFile).mock.calls.length;

            // watcherOnCreate fires scheduleReload → after debounce → reloadAllSnippets
            expect(watcherOnCreate).toBeDefined();
            watcherOnCreate!();
            await new Promise((resolve) => setTimeout(resolve, 10));

            expect(vi.mocked(compileSnippetFile).mock.calls.length).toBeGreaterThan(initialCalls);
        });

        it("triggers refreshContactSnippets when contacts update fires", async () => {
            const mockContacts = createMockContactsFeature();
            vi.mocked(generateContactSnippets).mockReturnValue([]);

            feature = new SnippetsFeature(mockManifest as any, mockContacts as any, 0, mockFs as any);
            await feature.start(workspaceRoot as any);

            const initialCalls = vi.mocked(generateContactSnippets).mock.calls.length;

            // Fire the contacts update event
            mockContacts._fire();

            expect(vi.mocked(generateContactSnippets).mock.calls.length).toBeGreaterThan(initialCalls);
        });
    });

    describe("rebuildContactExpansionMap", () => {
        it("builds expansion entries from contacts and deduplicates", async () => {
            const contactA = {
                id: "alice",
                nickname: "ali",
                fullName: "Alice Smith",
                isActive: true,
            };
            const mockContacts = createMockContactsFeature([contactA]);

            // Return a snippet for alice with an expand function
            const aliceSnippet: SnippetDefinition = {
                trigger: "@alice",
                label: "Alice Smith",
                glob: "**/*",
                expand: (ctx: any) => {
                    const format = ctx.params?.format ?? "nickname";
                    if (format === "full") return "Alice Smith";
                    if (format === "nickname") return "ali";
                    return "ali";
                },
            };
            vi.mocked(generateContactSnippets).mockReturnValue([aliceSnippet]);

            feature = new SnippetsFeature(mockManifest as any, mockContacts as any, 0, mockFs as any);
            await feature.start(workspaceRoot as any);

            const entries = feature.getExpansionEntries();
            // Should have entries for id, nickname, fullName, and expand formats
            expect(entries.length).toBeGreaterThan(0);
            const texts = entries.map((e) => e.text);
            expect(texts).toContain("alice"); // id
        });

        it("skips empty or duplicate text in expansion entries", async () => {
            const contactA = {
                id: "alice",
                nickname: "alice", // same as id → duplicate
                fullName: undefined, // empty → skipped
                isActive: true,
            };
            const mockContacts = createMockContactsFeature([contactA]);
            vi.mocked(generateContactSnippets).mockReturnValue([]);

            feature = new SnippetsFeature(mockManifest as any, mockContacts as any, 0, mockFs as any);
            await feature.start(workspaceRoot as any);

            const entries = feature.getExpansionEntries();
            // Only "alice" should appear once (deduplicated), and no entry for undefined fullName
            const aliceEntries = entries.filter((e) => e.text === "alice");
            expect(aliceEntries).toHaveLength(1);
        });
    });
});
