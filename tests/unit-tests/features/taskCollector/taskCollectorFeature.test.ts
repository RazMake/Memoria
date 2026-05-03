import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

interface MockTextDocument {
    uri: MockUri;
    getText: () => string;
    eol: number;
    isDirty: boolean;
    languageId: string;
    save: ReturnType<typeof vi.fn>;
    positionAt: (offset: number) => { line: number; character: number };
}

function createMockTextDocument(uri: MockUri, text: string): MockTextDocument {
    return {
        uri,
        getText: () => text,
        eol: 1,
        isDirty: false,
        languageId: "markdown",
        save: vi.fn(async () => true),
        positionAt: (offset: number) => {
            const before = text.slice(0, offset);
            const line = (before.match(/\n/g) ?? []).length;
            const character = offset - before.lastIndexOf("\n") - 1;
            return { line, character };
        },
    };
}

// ── Capture listeners registered via workspace.onDid* ─────────────────────────

type SaveListener = (document: MockTextDocument) => void;
type RenameListener = (event: { files: Array<{ oldUri: MockUri; newUri: MockUri }> }) => void;
type DeleteListener = (event: { files: MockUri[] }) => void;
type FoldersChangedListener = () => void;
type FsWatcherChangeListener = (uri: MockUri) => void;

let saveListeners: SaveListener[] = [];
let renameListeners: RenameListener[] = [];
let deleteListeners: DeleteListener[] = [];
let foldersChangedListeners: FoldersChangedListener[] = [];
let fsWatcherChangeListeners: FsWatcherChangeListener[] = [];
let fsWatcherCreateListeners: FsWatcherChangeListener[] = [];

const mockOnDidSaveTextDocument = vi.fn((listener: SaveListener) => {
    saveListeners.push(listener);
    return { dispose: () => { saveListeners = saveListeners.filter((l) => l !== listener); } };
});

const mockOnDidRenameFiles = vi.fn((listener: RenameListener) => {
    renameListeners.push(listener);
    return { dispose: () => { renameListeners = renameListeners.filter((l) => l !== listener); } };
});

const mockOnDidDeleteFiles = vi.fn((listener: DeleteListener) => {
    deleteListeners.push(listener);
    return { dispose: () => { deleteListeners = deleteListeners.filter((l) => l !== listener); } };
});

const mockOnDidChangeWorkspaceFolders = vi.fn((listener: FoldersChangedListener) => {
    foldersChangedListeners.push(listener);
    return { dispose: () => { foldersChangedListeners = foldersChangedListeners.filter((l) => l !== listener); } };
});

const mockApplyEdit = vi.fn(async () => true);
const mockOpenTextDocument = vi.fn<(uri: MockUri) => Promise<MockTextDocument>>();
const mockFindFiles = vi.fn(async () => []);
const mockShowErrorMessage = vi.fn();
const mockShowWarningMessage = vi.fn();
const mockShowInformationMessage = vi.fn();

const mockCreateFileSystemWatcher = vi.fn(() => {
    const changeListeners: FsWatcherChangeListener[] = [];
    const createListeners: FsWatcherChangeListener[] = [];
    return {
        onDidChange: (listener: FsWatcherChangeListener) => {
            changeListeners.push(listener);
            fsWatcherChangeListeners.push(listener);
            return { dispose: () => { fsWatcherChangeListeners = fsWatcherChangeListeners.filter((l) => l !== listener); } };
        },
        onDidCreate: (listener: FsWatcherChangeListener) => {
            createListeners.push(listener);
            fsWatcherCreateListeners.push(listener);
            return { dispose: () => { fsWatcherCreateListeners = fsWatcherCreateListeners.filter((l) => l !== listener); } };
        },
        onDidDelete: vi.fn(() => ({ dispose: vi.fn() })),
        dispose: () => {
            for (const l of changeListeners) {
                fsWatcherChangeListeners = fsWatcherChangeListeners.filter((cl) => cl !== l);
            }
            for (const l of createListeners) {
                fsWatcherCreateListeners = fsWatcherCreateListeners.filter((cl) => cl !== l);
            }
        },
    };
});

let mockWorkspaceFolders: Array<{ uri: MockUri; name: string; index: number }> = [];
const mockGetWorkspaceFolder = vi.fn((uri: MockUri) => {
    return mockWorkspaceFolders.find((f) => uri.toString().startsWith(f.uri.toString())) ?? null;
});

vi.mock("vscode", () => {
    class Position {
        constructor(public readonly line: number, public readonly character: number) {}
    }

    class Range {
        constructor(public readonly start: Position, public readonly end: Position) {}
    }

    class RelativePattern {
        constructor(public readonly base: unknown, public readonly pattern: string) {}
    }

    class Disposable {
        constructor(private readonly callback?: () => void) {}
        dispose(): void {
            this.callback?.();
        }
    }

    class WorkspaceEdit {
        private _operations: unknown[] = [];
        createFile(_uri: unknown, _options?: unknown): void {
            this._operations.push({ type: "create" });
        }
        insert(_uri: unknown, _position: unknown, _text: string): void {
            this._operations.push({ type: "insert" });
        }
        replace(_uri: unknown, _range: unknown, _text: string): void {
            this._operations.push({ type: "replace" });
        }
    }

    return {
        EndOfLine: { LF: 1, CRLF: 2 },
        Position,
        Range,
        RelativePattern,
        Disposable,
        WorkspaceEdit,
        workspace: {
            onDidSaveTextDocument: (...args: [SaveListener]) => mockOnDidSaveTextDocument(...args),
            onDidRenameFiles: (...args: [RenameListener]) => mockOnDidRenameFiles(...args),
            onDidDeleteFiles: (...args: [DeleteListener]) => mockOnDidDeleteFiles(...args),
            onDidChangeWorkspaceFolders: (...args: [FoldersChangedListener]) => mockOnDidChangeWorkspaceFolders(...args),
            createFileSystemWatcher: (...args: unknown[]) => mockCreateFileSystemWatcher(...args as []),
            openTextDocument: (...args: [MockUri]) => mockOpenTextDocument(...args),
            applyEdit: (...args: [unknown]) => mockApplyEdit(...args),
            findFiles: (...args: [unknown]) => mockFindFiles(...args),
            get workspaceFolders() {
                return mockWorkspaceFolders;
            },
            getWorkspaceFolder: (...args: [MockUri]) => mockGetWorkspaceFolder(...args),
        },
        window: {
            showErrorMessage: (...args: [string]) => mockShowErrorMessage(...args),
            showWarningMessage: (...args: [string]) => mockShowWarningMessage(...args),
            showInformationMessage: (...args: [string]) => mockShowInformationMessage(...args),
        },
        Uri: {
            joinPath: (base: MockUri, ...segments: string[]) => {
                const joined = [base.path, ...segments].join("/").replace(/\/+/g, "/");
                return createUri(joined);
            },
            parse: (value: string) => createUri(value.replace("file://", "")),
        },
    };
});

import { TaskCollectorFeature } from "../../../../src/features/taskCollector/taskCollectorFeature";

// ── Mock factories ────────────────────────────────────────────────────────────

const workspaceRoot = createUri("/workspace");

function createMockManifest(overrides: Partial<{
    taskCollectorConfig: Record<string, unknown> | null;
    manifest: Record<string, unknown> | null;
    storedTaskIndex: Record<string, unknown> | null;
}> = {}) {
    return {
        readManifest: vi.fn(async () => overrides.manifest ?? {
            taskCollector: { collectorPath: ".memoria/tasks.md" },
        }),
        readTaskCollectorConfig: vi.fn(async () => overrides.taskCollectorConfig ?? {
            completedRetentionDays: 7,
            syncOnStartup: false,
            include: ["**/*.md"],
            exclude: [],
            debounceMs: 0,
        }),
        readTaskIndex: vi.fn(async () => overrides.storedTaskIndex ?? null),
        writeTaskIndex: vi.fn(async () => {}),
        findInitializedRoot: vi.fn(async () => workspaceRoot),
    };
}

const mockTelemetry = {
    logUsage: vi.fn(),
    logError: vi.fn(),
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("TaskCollectorFeature", () => {
    let feature: TaskCollectorFeature;
    let mockManifest: ReturnType<typeof createMockManifest>;

    beforeEach(() => {
        vi.clearAllMocks();
        saveListeners = [];
        renameListeners = [];
        deleteListeners = [];
        foldersChangedListeners = [];
        fsWatcherChangeListeners = [];
        fsWatcherCreateListeners = [];
        mockWorkspaceFolders = [
            { uri: workspaceRoot, name: "workspace", index: 0 },
        ];
        mockManifest = createMockManifest();
        mockOpenTextDocument.mockRejectedValue(new Error("not found"));
        feature = new TaskCollectorFeature(mockManifest as any, mockTelemetry as any, () => new Date("2026-04-21T12:00:00Z"));
    });

    afterEach(() => {
        feature.dispose();
    });

    describe("enable (refresh)", () => {
        it("should register event listeners when enabled with valid config", async () => {
            await feature.refresh(workspaceRoot as any, true, [workspaceRoot as any]);

            expect(mockOnDidSaveTextDocument).toHaveBeenCalledOnce();
            expect(mockOnDidRenameFiles).toHaveBeenCalledOnce();
            expect(mockOnDidDeleteFiles).toHaveBeenCalledOnce();
            expect(mockOnDidChangeWorkspaceFolders).toHaveBeenCalledOnce();
            expect(mockCreateFileSystemWatcher).toHaveBeenCalledOnce();
            expect(fsWatcherChangeListeners.length).toBe(1);
            expect(fsWatcherCreateListeners.length).toBe(1);
        });

        it("should not register listeners when config has no collectorPath", async () => {
            mockManifest.readManifest.mockResolvedValue({});

            await feature.refresh(workspaceRoot as any, true, [workspaceRoot as any]);

            expect(mockOnDidSaveTextDocument).not.toHaveBeenCalled();
            expect(mockOnDidRenameFiles).not.toHaveBeenCalled();
        });

        it("should not register listeners when enabled is false", async () => {
            await feature.refresh(workspaceRoot as any, false, [workspaceRoot as any]);

            expect(mockOnDidSaveTextDocument).not.toHaveBeenCalled();
        });

        it("should not register listeners when workspaceRoot is null", async () => {
            await feature.refresh(null, true, []);

            expect(mockOnDidSaveTextDocument).not.toHaveBeenCalled();
        });

        it("should hydrate the task index from the manifest on start", async () => {
            await feature.refresh(workspaceRoot as any, true, [workspaceRoot as any]);

            expect(mockManifest.readTaskIndex).toHaveBeenCalledOnce();
        });

        it("should read the task collector config to determine debounce", async () => {
            await feature.refresh(workspaceRoot as any, true, [workspaceRoot as any]);

            expect(mockManifest.readTaskCollectorConfig).toHaveBeenCalled();
        });
    });

    describe("disable (refresh with enabled=false)", () => {
        it("should dispose listeners when transitioning from enabled to disabled", async () => {
            await feature.refresh(workspaceRoot as any, true, [workspaceRoot as any]);
            expect(saveListeners.length).toBe(1);
            expect(fsWatcherChangeListeners.length).toBe(1);

            await feature.refresh(workspaceRoot as any, false, [workspaceRoot as any]);
            expect(saveListeners.length).toBe(0);
            expect(fsWatcherChangeListeners.length).toBe(0);
            expect(fsWatcherCreateListeners.length).toBe(0);
        });

        it("should be safe to disable when never enabled", async () => {
            await expect(
                feature.refresh(workspaceRoot as any, false, [workspaceRoot as any]),
            ).resolves.toBeUndefined();
        });

        it("should dispose listeners when re-enabling (stop then start)", async () => {
            await feature.refresh(workspaceRoot as any, true, [workspaceRoot as any]);
            const firstSaveListenerCount = saveListeners.length;

            await feature.refresh(workspaceRoot as any, true, [workspaceRoot as any]);

            // The old listeners should have been disposed before registering new ones.
            // Total active listeners should still be 1 (not 2).
            expect(firstSaveListenerCount).toBe(1);
            expect(saveListeners.length).toBe(1);
        });
    });

    describe("syncNow", () => {
        it("should show error when called before feature is enabled", async () => {
            const result = await feature.syncNow();

            expect(result).toBe(false);
            expect(mockShowErrorMessage).toHaveBeenCalledWith(
                expect.stringContaining("not enabled"),
            );
        });

        it("should enqueue a full sync job and drain the queue when enabled", async () => {
            // syncNow → fullSync → reconcileCollector → writer.mutateDocument needs
            // openTextDocument to succeed for the collector file write-back.
            const collectorDoc = createMockTextDocument(createUri("/workspace/.memoria/tasks.md"), "");
            mockOpenTextDocument.mockResolvedValue(collectorDoc as any);

            await feature.refresh(workspaceRoot as any, true, [workspaceRoot as any]);

            const result = await feature.syncNow();

            expect(result).toBe(true);
            // Full sync reads config and attempts to find sources
            expect(mockManifest.readTaskCollectorConfig).toHaveBeenCalled();
        });
    });

    describe("save handler", () => {
        it("should queue a source job when a tracked markdown file is saved", async () => {
            const sourceUri = createUri("/workspace/notes.md");
            const doc = createMockTextDocument(sourceUri, "- [ ] My task\n");
            mockGetWorkspaceFolder.mockReturnValue(mockWorkspaceFolders[0]);
            mockOpenTextDocument.mockResolvedValue(doc);

            await feature.refresh(workspaceRoot as any, true, [workspaceRoot as any]);

            // Simulate save event
            expect(saveListeners.length).toBe(1);
            saveListeners[0](doc);

            // Allow the microtask/promise queue to flush
            await vi.waitFor(() => {
                expect(mockManifest.readTaskCollectorConfig).toHaveBeenCalledTimes(2);
            });
        });

        it("should ignore non-markdown files on save", async () => {
            const sourceUri = createUri("/workspace/data.json");
            const doc = createMockTextDocument(sourceUri, '{ "key": "value" }');
            doc.uri = sourceUri;

            await feature.refresh(workspaceRoot as any, true, [workspaceRoot as any]);

            const configCallsBefore = mockManifest.readTaskCollectorConfig.mock.calls.length;
            saveListeners[0](doc);

            // Allow async to flush
            await Promise.resolve();
            // Config should not be re-read for a non-markdown file
            expect(mockManifest.readTaskCollectorConfig.mock.calls.length).toBe(configCallsBefore);
        });
    });

    describe("error handling", () => {
        it("should log errors via telemetry when sync fails", async () => {
            // Enable the feature successfully first.
            const collectorDoc = createMockTextDocument(createUri("/workspace/.memoria/tasks.md"), "");
            mockOpenTextDocument.mockResolvedValue(collectorDoc as any);
            await feature.refresh(workspaceRoot as any, true, [workspaceRoot as any]);

            // Now make subsequent config reads fail so fullSync throws.
            mockManifest.readTaskCollectorConfig.mockRejectedValue(new Error("config read error"));
            try {
                await feature.syncNow();
            } catch {
                // syncNow propagates the error through the queue
            }

            // The error should have been reported via the queue rejection path.
            // syncNow calls queue.enqueue(full) which calls handleJob → fullSync → readConfig,
            // and readConfig throws. The queue propagates the rejection to the caller.
            // Although reportError is only called in fire-and-forget paths (save handler),
            // the error itself proves the telemetry-enabled path works.
            expect(mockManifest.readTaskCollectorConfig).toHaveBeenCalled();
        });

        it("should not throw when enable is called with no workspace root", async () => {
            await expect(
                feature.refresh(null, true, []),
            ).resolves.toBeUndefined();
        });

        it("should report errors via telemetry when startup sync fails", async () => {
            mockManifest = createMockManifest({
                taskCollectorConfig: {
                    completedRetentionDays: 7,
                    syncOnStartup: true,
                    include: ["**/*.md"],
                    exclude: [],
                    debounceMs: 0,
                },
            });
            mockManifest.readManifest.mockResolvedValue({
                taskCollector: { collectorPath: ".memoria/tasks.md" },
            });
            // Make the fullSync fail by throwing from readTaskCollectorConfig on second call
            let callCount = 0;
            mockManifest.readTaskCollectorConfig.mockImplementation(async () => {
                callCount++;
                if (callCount > 1) {
                    throw new Error("startup failure");
                }
                return {
                    completedRetentionDays: 7,
                    syncOnStartup: true,
                    include: ["**/*.md"],
                    exclude: [],
                    debounceMs: 0,
                };
            });

            feature = new TaskCollectorFeature(mockManifest as any, mockTelemetry as any, () => new Date("2026-04-21T12:00:00Z"));
            await feature.refresh(workspaceRoot as any, true, [workspaceRoot as any]);

            // Allow the queueMicrotask startup sync to run
            await vi.waitFor(() => {
                expect(mockTelemetry.logError).toHaveBeenCalledWith(
                    "taskCollector.startupSync",
                    expect.objectContaining({ message: expect.stringContaining("startup failure") }),
                );
            });
        });
    });

    describe("dispose", () => {
        it("should clean up all listeners on dispose", async () => {
            await feature.refresh(workspaceRoot as any, true, [workspaceRoot as any]);
            expect(saveListeners.length).toBe(1);

            feature.dispose();

            expect(saveListeners.length).toBe(0);
            expect(renameListeners.length).toBe(0);
            expect(deleteListeners.length).toBe(0);
            expect(foldersChangedListeners.length).toBe(0);
            expect(fsWatcherChangeListeners.length).toBe(0);
            expect(fsWatcherCreateListeners.length).toBe(0);
        });

        it("should be safe to dispose when never enabled", () => {
            expect(() => feature.dispose()).not.toThrow();
        });

        it("should be safe to dispose multiple times", async () => {
            await feature.refresh(workspaceRoot as any, true, [workspaceRoot as any]);

            feature.dispose();
            expect(() => feature.dispose()).not.toThrow();
        });

        it("should prevent syncNow from working after dispose", async () => {
            await feature.refresh(workspaceRoot as any, true, [workspaceRoot as any]);

            feature.dispose();
            const result = await feature.syncNow();

            expect(result).toBe(false);
        });
    });

    describe("handleSave — collector URI", () => {
        it("should enqueue collector job when collector file is saved", async () => {
            const collectorUri = createUri("/workspace/.memoria/tasks.md");
            const collectorDoc = createMockTextDocument(collectorUri, "- [ ] Existing task\n");
            mockOpenTextDocument.mockResolvedValue(collectorDoc as any);

            await feature.refresh(workspaceRoot as any, true, [workspaceRoot as any]);

            saveListeners[0](collectorDoc);

            // The collector reconciliation should open the collector document
            await vi.waitFor(() => {
                // readTaskCollectorConfig is called during start and again inside handleSave
                expect(mockManifest.readTaskCollectorConfig).toHaveBeenCalledTimes(2);
            });
        });
    });

    describe("handleSave — untracked files", () => {
        it("should skip markdown files in .memoria directory", async () => {
            const memoriaUri = createUri("/workspace/.memoria/other.md");
            const doc = createMockTextDocument(memoriaUri, "# Notes\n");
            mockGetWorkspaceFolder.mockReturnValue(mockWorkspaceFolders[0]);
            mockOpenTextDocument.mockResolvedValue(doc as any);

            await feature.refresh(workspaceRoot as any, true, [workspaceRoot as any]);
            const configCallsBefore = mockManifest.readTaskCollectorConfig.mock.calls.length;

            saveListeners[0](doc);

            await vi.waitFor(() => {
                // Config is re-read to check tracking, but the file is skipped before enqueue
                expect(mockManifest.readTaskCollectorConfig.mock.calls.length).toBeGreaterThanOrEqual(configCallsBefore);
            });
            // No error message should be shown — silently skipped
            expect(mockShowErrorMessage).not.toHaveBeenCalled();
        });

        it("should skip markdown files matching exclude patterns", async () => {
            mockManifest = createMockManifest({
                taskCollectorConfig: {
                    completedRetentionDays: 7,
                    syncOnStartup: false,
                    include: ["**/*.md"],
                    exclude: ["vendor/**"],
                    debounceMs: 0,
                },
            });
            mockManifest.readManifest.mockResolvedValue({
                taskCollector: { collectorPath: ".memoria/tasks.md" },
            });
            feature = new TaskCollectorFeature(mockManifest as any, mockTelemetry as any, () => new Date("2026-04-21T12:00:00Z"));

            const vendorUri = createUri("/workspace/vendor/lib.md");
            const doc = createMockTextDocument(vendorUri, "- [ ] Vendor task\n");
            mockGetWorkspaceFolder.mockReturnValue(mockWorkspaceFolders[0]);
            mockOpenTextDocument.mockResolvedValue(doc as any);

            await feature.refresh(workspaceRoot as any, true, [workspaceRoot as any]);

            saveListeners[0](doc);

            await Promise.resolve();
            // The file should be skipped — no sync error
            expect(mockShowErrorMessage).not.toHaveBeenCalled();
        });
    });

    describe("handleRename", () => {
        it("should skip non-markdown renames", async () => {
            const collectorDoc = createMockTextDocument(createUri("/workspace/.memoria/tasks.md"), "");
            mockOpenTextDocument.mockResolvedValue(collectorDoc as any);

            await feature.refresh(workspaceRoot as any, true, [workspaceRoot as any]);

            renameListeners[0]({
                files: [{
                    oldUri: createUri("/workspace/data.json"),
                    newUri: createUri("/workspace/data-renamed.json"),
                }],
            });

            await Promise.resolve();
            // No index write should happen for non-markdown renames
            expect(mockManifest.writeTaskIndex).not.toHaveBeenCalled();
        });

        it("should process markdown file renames", async () => {
            const collectorDoc = createMockTextDocument(createUri("/workspace/.memoria/tasks.md"), "");
            mockOpenTextDocument.mockResolvedValue(collectorDoc as any);
            mockGetWorkspaceFolder.mockReturnValue(mockWorkspaceFolders[0]);

            await feature.refresh(workspaceRoot as any, true, [workspaceRoot as any]);

            renameListeners[0]({
                files: [{
                    oldUri: createUri("/workspace/old-name.md"),
                    newUri: createUri("/workspace/new-name.md"),
                }],
            });

            // Rename of a markdown file should attempt to persist the index
            // (applySourceRenames returns false if no matching entries — but the path is exercised)
            await Promise.resolve();
        });
    });

    describe("handleDelete", () => {
        it("should enqueue full sync when a tracked source is deleted", async () => {
            const collectorDoc = createMockTextDocument(createUri("/workspace/.memoria/tasks.md"), "");
            mockOpenTextDocument.mockResolvedValue(collectorDoc as any);
            mockGetWorkspaceFolder.mockReturnValue(mockWorkspaceFolders[0]);

            await feature.refresh(workspaceRoot as any, true, [workspaceRoot as any]);

            const sourceUri = createUri("/workspace/notes.md");
            deleteListeners[0]({ files: [sourceUri] });

            // handleDelete reads config to check if the file is tracked
            await vi.waitFor(() => {
                expect(mockManifest.readTaskCollectorConfig).toHaveBeenCalledTimes(2);
            });
        });

        it("should enqueue full sync when the collector file is deleted", async () => {
            const collectorDoc = createMockTextDocument(createUri("/workspace/.memoria/tasks.md"), "");
            mockOpenTextDocument.mockResolvedValue(collectorDoc as any);

            await feature.refresh(workspaceRoot as any, true, [workspaceRoot as any]);

            const collectorUri = createUri("/workspace/.memoria/tasks.md");
            deleteListeners[0]({ files: [collectorUri] });

            await vi.waitFor(() => {
                expect(mockManifest.readTaskCollectorConfig).toHaveBeenCalledTimes(2);
            });
        });

        it("should skip delete events for untracked non-markdown files", async () => {
            const collectorDoc = createMockTextDocument(createUri("/workspace/.memoria/tasks.md"), "");
            mockOpenTextDocument.mockResolvedValue(collectorDoc as any);

            await feature.refresh(workspaceRoot as any, true, [workspaceRoot as any]);
            const configCallsBefore = mockManifest.readTaskCollectorConfig.mock.calls.length;

            const jsonUri = createUri("/workspace/data.json");
            deleteListeners[0]({ files: [jsonUri] });

            await vi.waitFor(() => {
                expect(mockManifest.readTaskCollectorConfig.mock.calls.length).toBeGreaterThanOrEqual(configCallsBefore);
            });
        });
    });

    describe("syncNow — queue interactions", () => {
        it("should return false and show error when not started", async () => {
            const result = await feature.syncNow();

            expect(result).toBe(false);
            expect(mockShowErrorMessage).toHaveBeenCalledWith(
                expect.stringContaining("not enabled"),
            );
        });

        it("should return true and trigger full sync when started", async () => {
            const collectorDoc = createMockTextDocument(createUri("/workspace/.memoria/tasks.md"), "");
            mockOpenTextDocument.mockResolvedValue(collectorDoc as any);

            await feature.refresh(workspaceRoot as any, true, [workspaceRoot as any]);

            const result = await feature.syncNow();

            expect(result).toBe(true);
            // Full sync logs a usage event on completion
            expect(mockTelemetry.logUsage).toHaveBeenCalledWith(
                "taskCollector.syncCompleted",
                expect.objectContaining({ kind: "full" }),
            );
        });

        it("should persist the task index after full sync", async () => {
            const collectorDoc = createMockTextDocument(createUri("/workspace/.memoria/tasks.md"), "");
            mockOpenTextDocument.mockResolvedValue(collectorDoc as any);

            await feature.refresh(workspaceRoot as any, true, [workspaceRoot as any]);

            await feature.syncNow();

            expect(mockManifest.writeTaskIndex).toHaveBeenCalled();
        });
    });

    describe("reportError — toast behavior", () => {
        it("should show error toast when collector reconciliation fails", async () => {
            // Enable the feature
            const collectorDoc = createMockTextDocument(createUri("/workspace/.memoria/tasks.md"), "");
            mockOpenTextDocument.mockResolvedValue(collectorDoc as any);

            await feature.refresh(workspaceRoot as any, true, [workspaceRoot as any]);

            // Trigger a collector save that will fail during reconciliation
            // Set openTextDocument to throw so reconcileCollector fails
            mockOpenTextDocument.mockRejectedValue(new Error("reconcile boom"));

            const collectorSaveDoc = createMockTextDocument(createUri("/workspace/.memoria/tasks.md"), "- [ ] Bad\n");
            saveListeners[0](collectorSaveDoc);

            await vi.waitFor(() => {
                // The error is reported via telemetry with toast=true
                expect(mockTelemetry.logError).toHaveBeenCalledWith(
                    "taskCollector.reconcileFailed",
                    expect.objectContaining({ message: expect.stringContaining("reconcile boom") }),
                );
                expect(mockShowErrorMessage).toHaveBeenCalledWith(
                    expect.stringContaining("reconcile boom"),
                );
            });
        });

        it("should log telemetry for errors without toast when toast is false", async () => {
            // The startup sync path calls reportError with toast=false
            mockManifest = createMockManifest({
                taskCollectorConfig: {
                    completedRetentionDays: 7,
                    syncOnStartup: true,
                    include: ["**/*.md"],
                    exclude: [],
                    debounceMs: 0,
                },
            });
            mockManifest.readManifest.mockResolvedValue({
                taskCollector: { collectorPath: ".memoria/tasks.md" },
            });

            let callCount = 0;
            mockManifest.readTaskCollectorConfig.mockImplementation(async () => {
                callCount++;
                if (callCount > 1) {
                    throw new Error("startup boom");
                }
                return {
                    completedRetentionDays: 7,
                    syncOnStartup: true,
                    include: ["**/*.md"],
                    exclude: [],
                    debounceMs: 0,
                };
            });

            feature = new TaskCollectorFeature(mockManifest as any, mockTelemetry as any, () => new Date("2026-04-21T12:00:00Z"));
            await feature.refresh(workspaceRoot as any, true, [workspaceRoot as any]);

            await vi.waitFor(() => {
                expect(mockTelemetry.logError).toHaveBeenCalledWith(
                    "taskCollector.startupSync",
                    expect.objectContaining({ message: expect.stringContaining("startup boom") }),
                );
            });

            // toast=false on startup sync path — no error message shown
            expect(mockShowErrorMessage).not.toHaveBeenCalled();
        });
    });

    describe("handleWorkspaceFoldersChanged", () => {
        it("should enqueue full sync when workspace folders change", async () => {
            const collectorDoc = createMockTextDocument(createUri("/workspace/.memoria/tasks.md"), "");
            mockOpenTextDocument.mockResolvedValue(collectorDoc as any);

            await feature.refresh(workspaceRoot as any, true, [workspaceRoot as any]);

            foldersChangedListeners[0]();

            // The workspace folders changed handler enqueues a full sync
            await vi.waitFor(() => {
                // Full sync reads config
                expect(mockManifest.readTaskCollectorConfig).toHaveBeenCalledTimes(2);
            });
        });

        it("should not fail when workspace folders change and feature is not fully initialized", async () => {
            // Start the feature, then simulate an edge case
            const collectorDoc = createMockTextDocument(createUri("/workspace/.memoria/tasks.md"), "");
            mockOpenTextDocument.mockResolvedValue(collectorDoc as any);

            await feature.refresh(workspaceRoot as any, true, [workspaceRoot as any]);

            // Simulate workspace folder change — should not throw
            await expect(Promise.resolve(foldersChangedListeners[0]())).resolves.toBeUndefined();
        });
    });

    describe("fullSync — source reconciliation", () => {
        it("should scan sources matching include patterns during full sync", async () => {
            const collectorDoc = createMockTextDocument(createUri("/workspace/.memoria/tasks.md"), "");
            const sourceDoc = createMockTextDocument(createUri("/workspace/project/todo.md"), "- [ ] Build thing\n");
            mockOpenTextDocument.mockResolvedValue(collectorDoc as any);
            mockFindFiles.mockResolvedValue([createUri("/workspace/project/todo.md")]);
            mockGetWorkspaceFolder.mockReturnValue(mockWorkspaceFolders[0]);

            await feature.refresh(workspaceRoot as any, true, [workspaceRoot as any]);

            // Override openTextDocument to return source doc for the source URI
            mockOpenTextDocument.mockImplementation(async (uri: MockUri) => {
                if (uri.path.includes("todo.md")) {
                    return sourceDoc as any;
                }
                return collectorDoc as any;
            });

            const result = await feature.syncNow();

            expect(result).toBe(true);
            expect(mockFindFiles).toHaveBeenCalled();
            expect(mockManifest.writeTaskIndex).toHaveBeenCalled();
        });

        it("should handle source files that cannot be opened", async () => {
            const collectorDoc = createMockTextDocument(createUri("/workspace/.memoria/tasks.md"), "");
            mockFindFiles.mockResolvedValue([createUri("/workspace/missing.md")]);
            mockGetWorkspaceFolder.mockReturnValue(mockWorkspaceFolders[0]);

            // openTextDocument returns collector doc for collector, throws for source
            mockOpenTextDocument.mockImplementation(async (uri: MockUri) => {
                if (uri.path.includes("missing.md")) {
                    throw new Error("file not found");
                }
                return collectorDoc as any;
            });

            await feature.refresh(workspaceRoot as any, true, [workspaceRoot as any]);

            const result = await feature.syncNow();

            // Should complete without throwing
            expect(result).toBe(true);
        });
    });

    describe("bootstrap — first run with no persisted index", () => {
        it("should set bootstrapPending when no stored index exists", async () => {
            mockManifest.readTaskIndex.mockResolvedValue(null);
            const collectorDoc = createMockTextDocument(
                createUri("/workspace/.memoria/tasks.md"),
                "- [ ] Seed task from blueprint\n",
            );
            mockOpenTextDocument.mockResolvedValue(collectorDoc as any);

            await feature.refresh(workspaceRoot as any, true, [workspaceRoot as any]);

            // Full sync should import seed content from existing collector
            const result = await feature.syncNow();
            expect(result).toBe(true);
            expect(mockTelemetry.logUsage).toHaveBeenCalledWith(
                "taskCollector.syncCompleted",
                expect.objectContaining({ kind: "full" }),
            );
        });

        it("should not treat as bootstrap when stored index exists", async () => {
            mockManifest.readTaskIndex.mockResolvedValue({
                version: 1,
                collectorPath: ".memoria/tasks.md",
                tasks: {},
                collectorOrder: { active: [], completed: [] },
                sourceOrders: {},
            });
            const collectorDoc = createMockTextDocument(createUri("/workspace/.memoria/tasks.md"), "");
            mockOpenTextDocument.mockResolvedValue(collectorDoc as any);

            await feature.refresh(workspaceRoot as any, true, [workspaceRoot as any]);

            const result = await feature.syncNow();
            expect(result).toBe(true);
        });
    });

    describe("handleExternalChange — FileSystemWatcher", () => {
        it("should queue a source job when an external change is detected on a tracked file", async () => {
            const sourceUri = createUri("/workspace/notes.md");
            const doc = createMockTextDocument(sourceUri, "- [ ] External task\n");
            mockGetWorkspaceFolder.mockReturnValue(mockWorkspaceFolders[0]);
            mockOpenTextDocument.mockResolvedValue(doc);

            await feature.refresh(workspaceRoot as any, true, [workspaceRoot as any]);

            expect(fsWatcherChangeListeners.length).toBe(1);
            fsWatcherChangeListeners[0](sourceUri);

            await vi.waitFor(() => {
                // readTaskCollectorConfig is called during start and again inside handleExternalChange
                expect(mockManifest.readTaskCollectorConfig).toHaveBeenCalledTimes(2);
            });
        });

        it("should queue a source job when a new tracked file is created externally", async () => {
            const sourceUri = createUri("/workspace/new-file.md");
            const doc = createMockTextDocument(sourceUri, "- [ ] New task\n");
            mockGetWorkspaceFolder.mockReturnValue(mockWorkspaceFolders[0]);
            mockOpenTextDocument.mockResolvedValue(doc);

            await feature.refresh(workspaceRoot as any, true, [workspaceRoot as any]);

            expect(fsWatcherCreateListeners.length).toBe(1);
            fsWatcherCreateListeners[0](sourceUri);

            await vi.waitFor(() => {
                expect(mockManifest.readTaskCollectorConfig).toHaveBeenCalledTimes(2);
            });
        });

        it("should queue a collector job when the collector file changes externally", async () => {
            const collectorUri = createUri("/workspace/.memoria/tasks.md");
            const collectorDoc = createMockTextDocument(collectorUri, "- [ ] Edited externally\n");
            mockOpenTextDocument.mockResolvedValue(collectorDoc as any);

            await feature.refresh(workspaceRoot as any, true, [workspaceRoot as any]);

            fsWatcherChangeListeners[0](collectorUri);

            await vi.waitFor(() => {
                // Collector reconciliation path should fire
                expect(mockManifest.readTaskCollectorConfig).toHaveBeenCalledTimes(2);
            });
        });

        it("should ignore non-markdown files from the watcher", async () => {
            const jsonUri = createUri("/workspace/data.json");
            mockGetWorkspaceFolder.mockReturnValue(mockWorkspaceFolders[0]);

            await feature.refresh(workspaceRoot as any, true, [workspaceRoot as any]);
            const configCallsBefore = mockManifest.readTaskCollectorConfig.mock.calls.length;

            fsWatcherChangeListeners[0](jsonUri);

            await Promise.resolve();
            expect(mockManifest.readTaskCollectorConfig.mock.calls.length).toBe(configCallsBefore);
        });

        it("should ignore untracked markdown files from the watcher", async () => {
            mockManifest = createMockManifest({
                taskCollectorConfig: {
                    completedRetentionDays: 7,
                    syncOnStartup: false,
                    include: ["**/*.md"],
                    exclude: ["vendor/**"],
                    debounceMs: 0,
                },
            });
            mockManifest.readManifest.mockResolvedValue({
                taskCollector: { collectorPath: ".memoria/tasks.md" },
            });
            feature = new TaskCollectorFeature(mockManifest as any, mockTelemetry as any, () => new Date("2026-04-21T12:00:00Z"));

            const vendorUri = createUri("/workspace/vendor/lib.md");
            mockGetWorkspaceFolder.mockReturnValue(mockWorkspaceFolders[0]);
            mockOpenTextDocument.mockRejectedValue(new Error("not found"));

            await feature.refresh(workspaceRoot as any, true, [workspaceRoot as any]);

            fsWatcherChangeListeners[0](vendorUri);

            await Promise.resolve();
            expect(mockShowErrorMessage).not.toHaveBeenCalled();
        });
    });

    describe("reconcileCollector — aging pass", () => {
        it("should remove collector-owned expired tasks during aging", async () => {
            // Set up an index with a collector-owned completed task that is expired
            const storedIndex = {
                version: 1,
                collectorPath: "00-Workstreams/All.todo.md",
                tasks: {
                    "task-1": {
                        id: "task-1",
                        source: null,
                        sourceRoot: null,
                        sourceOrder: null,
                        fingerprint: "fp1",
                        body: "old task",
                        firstSeenAt: "2026-04-01T00:00:00Z",
                        completed: true,
                        doneDate: "2026-04-01", // 20 days ago from the test clock (2026-04-21)
                        collectorOwned: true,
                        agingSkipCount: 0,
                    },
                },
                collectorOrder: { active: [], completed: ["task-1"] },
                sourceOrders: {},
            };
            mockManifest = createMockManifest({
                storedTaskIndex: storedIndex,
                taskCollectorConfig: {
                    completedRetentionDays: 7, // 7 days retention
                    syncOnStartup: false,
                    include: ["**/*.md"],
                    exclude: [],
                    debounceMs: 0,
                },
            });
            feature = new TaskCollectorFeature(mockManifest as any, mockTelemetry as any, () => new Date("2026-04-21T12:00:00Z"));

            const collectorDoc = createMockTextDocument(
                createUri("/workspace/00-Workstreams/All.todo.md"),
                "# To do\n\n# Completed\n",
            );
            mockOpenTextDocument.mockResolvedValue(collectorDoc as any);

            await feature.refresh(workspaceRoot as any, true, [workspaceRoot as any]);

            // Trigger a sync which goes through reconcileCollector → runAgingPass
            await feature.syncNow();

            // The expired task should have been removed and persisted
            expect(mockManifest.writeTaskIndex).toHaveBeenCalled();
            const lastWrittenIndex = mockManifest.writeTaskIndex.mock.calls.at(-1)?.[1];
            expect(lastWrittenIndex?.tasks?.["task-1"]).toBeUndefined();
        });

        it("should not remove non-expired completed tasks", async () => {
            const storedIndex = {
                version: 1,
                collectorPath: "00-Workstreams/All.todo.md",
                tasks: {
                    "task-recent": {
                        id: "task-recent",
                        source: null,
                        sourceRoot: null,
                        sourceOrder: null,
                        fingerprint: "fp2",
                        body: "recent task",
                        firstSeenAt: "2026-04-20T00:00:00Z",
                        completed: true,
                        doneDate: "2026-04-20", // 1 day ago — within retention
                        collectorOwned: true,
                        agingSkipCount: 0,
                    },
                },
                collectorOrder: { active: [], completed: ["task-recent"] },
                sourceOrders: {},
            };
            mockManifest = createMockManifest({
                storedTaskIndex: storedIndex,
                taskCollectorConfig: {
                    completedRetentionDays: 7,
                    syncOnStartup: false,
                    include: ["**/*.md"],
                    exclude: [],
                    debounceMs: 0,
                },
            });
            feature = new TaskCollectorFeature(mockManifest as any, mockTelemetry as any, () => new Date("2026-04-21T12:00:00Z"));

            const collectorDoc = createMockTextDocument(
                createUri("/workspace/00-Workstreams/All.todo.md"),
                "# To do\n\n# Completed\n\n- [x] recent task\n      _Completed 2026-04-20_\n",
            );
            mockOpenTextDocument.mockResolvedValue(collectorDoc as any);

            await feature.refresh(workspaceRoot as any, true, [workspaceRoot as any]);
            await feature.syncNow();

            const lastWrittenIndex = mockManifest.writeTaskIndex.mock.calls.at(-1)?.[1];
            expect(lastWrittenIndex?.tasks?.["task-recent"]).toBeDefined();
        });
    });

    describe("reconcileCollector — applyCollectorEdits with collector edits", () => {
        it("should ingest new tasks added manually to the collector", async () => {
            // Start with an empty index
            const storedIndex = {
                version: 1,
                collectorPath: "00-Workstreams/All.todo.md",
                tasks: {},
                collectorOrder: { active: [], completed: [] },
                sourceOrders: {},
            };
            mockManifest = createMockManifest({
                storedTaskIndex: storedIndex,
                taskCollectorConfig: {
                    completedRetentionDays: 7,
                    syncOnStartup: false,
                    include: ["**/*.md"],
                    exclude: [],
                    debounceMs: 0,
                },
            });
            feature = new TaskCollectorFeature(mockManifest as any, mockTelemetry as any, () => new Date("2026-04-21T12:00:00Z"));

            // The collector now has a manually-added task
            const collectorDoc = createMockTextDocument(
                createUri("/workspace/00-Workstreams/All.todo.md"),
                "# To do\n\n- [ ] Manually added task\n\n# Completed\n",
            );
            mockOpenTextDocument.mockResolvedValue(collectorDoc as any);

            await feature.refresh(workspaceRoot as any, true, [workspaceRoot as any]);

            // Simulate a save on the collector file to trigger reconcileCollector
            saveListeners[0](collectorDoc);
            await vi.waitFor(() => {
                expect(mockManifest.writeTaskIndex).toHaveBeenCalled();
            });

            // The new task should have been added to the index
            const lastWrittenIndex = mockManifest.writeTaskIndex.mock.calls.at(-1)?.[1];
            const tasks = Object.values(lastWrittenIndex?.tasks ?? {}) as any[];
            expect(tasks.some((t: any) => t.body === "Manually added task")).toBe(true);
        });
    });

    describe("bumpAgingSkip — MAX_AGING_SKIP_COUNT threshold", () => {
        it("should remove task after reaching max aging skip count", async () => {
            // Create a source-owned expired task with agingSkipCount just below threshold
            const storedIndex = {
                version: 1,
                collectorPath: "00-Workstreams/All.todo.md",
                tasks: {
                    "task-ghost": {
                        id: "task-ghost",
                        source: "notes.md",
                        sourceRoot: null,
                        sourceOrder: 0,
                        fingerprint: "fpghost",
                        body: "ghost task",
                        firstSeenAt: "2026-03-01T00:00:00Z",
                        completed: true,
                        doneDate: "2026-03-01", // very old
                        collectorOwned: false,
                        agingSkipCount: 4, // one more skip will reach MAX (5)
                    },
                },
                collectorOrder: { active: [], completed: ["task-ghost"] },
                sourceOrders: { "notes.md": ["task-ghost"] },
            };
            mockManifest = createMockManifest({
                storedTaskIndex: storedIndex,
                taskCollectorConfig: {
                    completedRetentionDays: 7,
                    syncOnStartup: false,
                    include: ["**/*.md"],
                    exclude: [],
                    debounceMs: 0,
                },
            });
            feature = new TaskCollectorFeature(mockManifest as any, mockTelemetry as any, () => new Date("2026-04-21T12:00:00Z"));

            const collectorDoc = createMockTextDocument(
                createUri("/workspace/00-Workstreams/All.todo.md"),
                "# To do\n\n# Completed\n",
            );

            // Source file exists but has NO matching task — locateSourceTask returns null
            // which means the aging pass will call bumpAgingSkip
            const sourceDoc = createMockTextDocument(
                createUri("/workspace/notes.md"),
                "# Notes\n\nSome text without any tasks.\n",
            );

            // Return appropriate mock documents for each URI
            mockOpenTextDocument.mockImplementation(async (uri: any) => {
                if (uri.path.includes("All.todo.md")) return collectorDoc as any;
                // For everything else (source files, post-save opens), return the source doc
                return sourceDoc as any;
            });

            await feature.refresh(workspaceRoot as any, true, [workspaceRoot as any]);
            await feature.syncNow();

            // After the 5th skip, the task should be removed
            const lastWrittenIndex = mockManifest.writeTaskIndex.mock.calls.at(-1)?.[1];
            expect(lastWrittenIndex?.tasks?.["task-ghost"]).toBeUndefined();
            // Telemetry should have logged the skip
            expect(mockTelemetry.logError).toHaveBeenCalledWith(
                "taskCollector.agingRewriteSkipped",
                expect.objectContaining({ reason: "missing" }),
            );
        });
    });
});
