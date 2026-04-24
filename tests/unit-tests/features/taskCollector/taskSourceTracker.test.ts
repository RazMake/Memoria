import { describe, it, expect, vi, beforeEach } from "vitest";
import type * as vscode from "vscode";
import type { ManifestManager } from "../../../../src/blueprints/manifestManager";

const { mockGetWorkspaceFolder, mockFindFiles, mockJoinPath, mockWorkspace } = vi.hoisted(() => {
    const mockGetWorkspaceFolder = vi.fn();
    const mockFindFiles = vi.fn(() => []);
    const mockJoinPath = vi.fn((...args: any[]) => ({
        toString: () => args.map(String).join("/"),
        path: args.map(String).join("/"),
        fsPath: args.map(String).join("/"),
    }));
    const mockWorkspace: Record<string, any> = {
        workspaceFolders: [],
        findFiles: mockFindFiles,
        getWorkspaceFolder: mockGetWorkspaceFolder,
    };
    return { mockGetWorkspaceFolder, mockFindFiles, mockJoinPath, mockWorkspace };
});

vi.mock("vscode", () => ({
    Uri: { joinPath: (...args: any[]) => mockJoinPath(...args) },
    workspace: mockWorkspace,
    RelativePattern: vi.fn(),
}));

import { TaskSourceTracker } from "../../../../src/features/taskCollector/taskSourceTracker";

function makeUri(value: string): vscode.Uri {
    return {
        toString: () => value,
        path: value,
        fsPath: value,
    } as unknown as vscode.Uri;
}

function makeFolder(name: string, fsPath: string): vscode.WorkspaceFolder {
    return {
        name,
        index: 0,
        uri: makeUri(fsPath),
    } as vscode.WorkspaceFolder;
}

describe("TaskSourceTracker", () => {
    let tracker: TaskSourceTracker;
    const workspaceRoot = makeUri("/workspace");
    const collectorPath = ".memoria/tasks.md";
    const manifest: ManifestManager = {
        readTaskCollectorConfig: vi.fn(() => null),
    } as unknown as ManifestManager;

    beforeEach(() => {
        vi.clearAllMocks();
        mockWorkspace.workspaceFolders = [];
        tracker = new TaskSourceTracker(workspaceRoot, collectorPath, manifest);
    });

    describe("isCollectorUri", () => {
        it("should return true for collector path", () => {
            const collectorUri = tracker.getCollectorUri();
            expect(tracker.isCollectorUri(collectorUri)).toBe(true);
        });

        it("should return false for other paths", () => {
            const otherUri = makeUri("/workspace/notes.md");
            expect(tracker.isCollectorUri(otherUri)).toBe(false);
        });
    });

    describe("getCollectorUri", () => {
        it("should build URI from root + collector path segments", () => {
            const uri = tracker.getCollectorUri();
            const str = uri.toString();
            expect(str).toContain(".memoria");
            expect(str).toContain("tasks.md");
        });
    });

    describe("describeUri", () => {
        it("should return null for non-markdown URI", () => {
            const uri = makeUri("/workspace/script.ts");
            mockGetWorkspaceFolder.mockReturnValue(
                makeFolder("myProject", "/workspace"),
            );

            const result = tracker.describeUri(uri);

            expect(result).toBeNull();
        });

        it("should return null when no workspace folder matches", () => {
            const uri = makeUri("/other/notes.md");
            mockGetWorkspaceFolder.mockReturnValue(undefined);

            const result = tracker.describeUri(uri);

            expect(result).toBeNull();
        });

        it("should return SourceContext for valid markdown URI", () => {
            const uri = makeUri("/workspace/docs/notes.md");
            const folder = makeFolder("myProject", "/workspace");
            mockGetWorkspaceFolder.mockReturnValue(folder);

            const result = tracker.describeUri(uri);

            expect(result).not.toBeNull();
            expect(result!.uri).toBe(uri);
            expect(result!.workspaceFolder).toBe(folder);
            expect(result!.sourceRoot).toBe("myProject");
            expect(result!.relativePath).toContain("notes.md");
            expect(result!.sourceKey).toContain("notes.md");
        });
    });

    describe("resolveSourceUri", () => {
        it("should return null when source is null", () => {
            const result = tracker.resolveSourceUri(null, null);
            expect(result).toBeNull();
        });

        it("should return null when source is empty string", () => {
            const result = tracker.resolveSourceUri("", null);
            expect(result).toBeNull();
        });

        it("should resolve URI from matching workspace folder", () => {
            const folder = makeFolder("myProject", "/workspace");
            mockWorkspace.workspaceFolders = [folder];

            const result = tracker.resolveSourceUri("docs/notes.md", "myProject");

            expect(result).not.toBeNull();
            expect(mockJoinPath).toHaveBeenCalledWith(folder.uri, "docs", "notes.md");
        });

        it("should resolve from first folder when sourceRoot is null", () => {
            const folder = makeFolder("myProject", "/workspace");
            mockWorkspace.workspaceFolders = [folder];

            const result = tracker.resolveSourceUri("notes.md", null);

            expect(result).not.toBeNull();
            expect(mockJoinPath).toHaveBeenCalledWith(folder.uri, "notes.md");
        });

        it("should return null when no matching folder exists", () => {
            mockWorkspace.workspaceFolders = [
                makeFolder("otherProject", "/other"),
            ];

            const result = tracker.resolveSourceUri("notes.md", "myProject");

            expect(result).toBeNull();
        });

        it("should return null when workspaceFolders is empty", () => {
            mockWorkspace.workspaceFolders = [];

            const result = tracker.resolveSourceUri("notes.md", null);

            expect(result).toBeNull();
        });
    });

    describe("isTrackedSourceUri", () => {
        const defaultConfig = {
            completedRetentionDays: 7,
            syncOnStartup: true,
            include: ["**/*.md"],
            exclude: ["**/node_modules/**", "**/.git/**", "**/.memoria/**"],
            debounceMs: 300,
        };

        it("should return false for non-markdown files", async () => {
            const uri = makeUri("/workspace/script.ts");

            const result = await tracker.isTrackedSourceUri(uri, defaultConfig);

            expect(result).toBe(false);
        });

        it("should return false for collector URI", async () => {
            const collectorUri = tracker.getCollectorUri();

            const result = await tracker.isTrackedSourceUri(collectorUri, defaultConfig);

            expect(result).toBe(false);
        });

        it("should return false for .memoria/ paths", async () => {
            const uri = makeUri("/workspace/.memoria/config.md");
            const folder = makeFolder("myProject", "/workspace");
            mockGetWorkspaceFolder.mockReturnValue(folder);

            const result = await tracker.isTrackedSourceUri(uri, defaultConfig);

            expect(result).toBe(false);
        });

        it("should return false for WorkspaceInitializationBackups/ paths", async () => {
            const uri = makeUri("/workspace/WorkspaceInitializationBackups/old.md");
            const folder = makeFolder("myProject", "/workspace");
            mockGetWorkspaceFolder.mockReturnValue(folder);

            const result = await tracker.isTrackedSourceUri(uri, defaultConfig);

            expect(result).toBe(false);
        });

        it("should return true for matching include pattern", async () => {
            const uri = makeUri("/workspace/docs/notes.md");
            const folder = makeFolder("myProject", "/workspace");
            mockGetWorkspaceFolder.mockReturnValue(folder);

            const result = await tracker.isTrackedSourceUri(uri, defaultConfig);

            expect(result).toBe(true);
        });

        it("should return false for matching exclude pattern", async () => {
            const uri = makeUri("/workspace/node_modules/pkg/readme.md");
            const folder = makeFolder("myProject", "/workspace");
            mockGetWorkspaceFolder.mockReturnValue(folder);

            const result = await tracker.isTrackedSourceUri(uri, defaultConfig);

            expect(result).toBe(false);
        });

        it("should return false when no include pattern matches", async () => {
            const uri = makeUri("/workspace/docs/notes.md");
            const folder = makeFolder("myProject", "/workspace");
            mockGetWorkspaceFolder.mockReturnValue(folder);
            const restrictiveConfig = { ...defaultConfig, include: ["specific-dir/**/*.md"] };

            const result = await tracker.isTrackedSourceUri(uri, restrictiveConfig);

            expect(result).toBe(false);
        });

        it("should read config from manifest when config is not provided", async () => {
            const uri = makeUri("/workspace/docs/notes.md");
            const folder = makeFolder("myProject", "/workspace");
            mockGetWorkspaceFolder.mockReturnValue(folder);

            const result = await tracker.isTrackedSourceUri(uri);

            expect(manifest.readTaskCollectorConfig).toHaveBeenCalledWith(workspaceRoot);
            expect(result).toBe(true);
        });
    });
});
