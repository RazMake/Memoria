import { describe, it, expect, vi, beforeEach } from "vitest";
import * as vscode from "vscode";
import { listImmediateSubfolders, buildFileValueCompletions } from "../../../../src/features/navigator/folderTraversal";

// ────────────────────────────────────────────────────────────────────────────
// VS Code mock
// ────────────────────────────────────────────────────────────────────────────
const _readDir = vi.fn();
const _wsFolders = vi.fn();

vi.mock("vscode", () => ({
    CompletionItem: class {
        insertText: any;
        detail?: string;
        sortText?: string;
        filterText?: string;
        kind?: number;
        command?: any;
        range?: any;
        constructor(public label: string, public _kind?: number) {
            this.kind = _kind;
        }
    },
    CompletionItemKind: {
        Folder: 19,
        File: 17,
    },
    FileType: {
        File: 1,
        Directory: 2,
        SymbolicLink: 64,
    },
    Uri: {
        joinPath: (base: any, ...segments: string[]) => {
            const basePath = base.path.endsWith("/") ? base.path.slice(0, -1) : base.path;
            if (segments.length === 0) {
                return { path: basePath, scheme: "file", toString: () => `file://${basePath}` };
            }
            const joined = basePath + "/" + segments.join("/");
            return { path: joined, scheme: "file", toString: () => `file://${joined}` };
        },
    },
    Range: class {
        constructor(
            public startLine: number,
            public startCharacter: number,
            public endLine: number,
            public endCharacter: number,
        ) {}
    },
    workspace: {
        get workspaceFolders() {
            return _wsFolders();
        },
        fs: {
            readDirectory: (...args: any[]) => _readDir(...args),
        },
    },
}));

// ────────────────────────────────────────────────────────────────────────────
// workspaceUtils mock
// ────────────────────────────────────────────────────────────────────────────
vi.mock("../../../../src/blueprints/workspaceUtils", () => ({
    getWorkspaceRoots: () => _wsFolders()?.map((f: any) => f.uri) ?? [],
    getRootFolderName: (uri: { path: string }) => {
        const p = uri.path.endsWith("/") ? uri.path.slice(0, -1) : uri.path;
        const i = p.lastIndexOf("/");
        return i >= 0 ? p.slice(i + 1) : p;
    },
    classifyFolderKey: (key: string, rootNameSet: ReadonlySet<string>) => {
        const firstSlash = key.indexOf("/");
        const firstSegment = key.slice(0, firstSlash);
        const isRootSpecific = rootNameSet.has(firstSegment) && key.length > firstSlash + 1;
        const relFolder = isRootSpecific ? key.slice(firstSlash + 1) : key;
        return { isRootSpecific, relFolder, rootName: firstSegment };
    },
    classifyFilePath: (filePath: string, rootNameSet: ReadonlySet<string>) => {
        const firstSlash = filePath.indexOf("/");
        if (firstSlash === -1) return { isWorkspaceAbsolute: false, rootName: "", relPath: filePath };
        const firstSegment = filePath.slice(0, firstSlash);
        const isWorkspaceAbsolute = rootNameSet.has(firstSegment);
        const relPath = isWorkspaceAbsolute ? filePath.slice(firstSlash + 1) : filePath;
        return { isWorkspaceAbsolute, rootName: firstSegment, relPath };
    },
}));

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────
function setWorkspaceFolders(...paths: string[]): void {
    const folders = paths.map((p) => ({
        uri: { path: p, scheme: "file", toString: () => `file://${p}` },
    }));
    _wsFolders.mockReturnValue(folders.length > 0 ? folders : undefined);
}

function makeRange() {
    return new vscode.Range(0, 0, 0, 0);
}

// ────────────────────────────────────────────────────────────────────────────
// Tests
// ────────────────────────────────────────────────────────────────────────────

describe("listImmediateSubfolders", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("should return folder names from directory listing", async () => {
        const parentUri = { path: "/workspace", scheme: "file" };
        _readDir.mockResolvedValue([
            ["docs", 2],
            ["src", 2],
        ]);

        const result = await listImmediateSubfolders(parentUri as any);

        expect(result).toEqual(["docs", "src"]);
    });

    it("should exclude dot-folders", async () => {
        const parentUri = { path: "/workspace", scheme: "file" };
        _readDir.mockResolvedValue([
            [".git", 2],
            [".vscode", 2],
            ["src", 2],
        ]);

        const result = await listImmediateSubfolders(parentUri as any);

        expect(result).toEqual(["src"]);
    });

    it("should exclude files (only return directories)", async () => {
        const parentUri = { path: "/workspace", scheme: "file" };
        _readDir.mockResolvedValue([
            ["README.md", 1],
            ["src", 2],
            ["package.json", 1],
        ]);

        const result = await listImmediateSubfolders(parentUri as any);

        expect(result).toEqual(["src"]);
    });

    it("should return empty array when readDirectory throws", async () => {
        const parentUri = { path: "/nonexistent", scheme: "file" };
        _readDir.mockRejectedValue(new Error("ENOENT"));

        const result = await listImmediateSubfolders(parentUri as any);

        expect(result).toEqual([]);
    });
});

describe("buildFileValueCompletions", () => {
    const json = `{
    "defaultFiles": {
        "00-ToDo/": {
            "filesToOpen": ["notes.md"],
            "closeOtherEditors": true
        }
    }
}`;

    beforeEach(() => {
        vi.clearAllMocks();
        setWorkspaceFolders("/workspace");
    });

    it("should return file completion items for folder-relative paths", async () => {
        _readDir.mockResolvedValue([
            ["tasks.md", 1],
            ["ideas.md", 1],
        ]);

        const items = await buildFileValueCompletions(json, "00-ToDo/", "", makeRange());

        const labels = items.map((i) => i.label);
        expect(labels).toContain("tasks.md");
        expect(labels).toContain("ideas.md");
        expect(items.every((i) => i.kind === 17)).toBe(true); // File kind
    });

    it("should return folder items with triggerSuggest command", async () => {
        _readDir.mockResolvedValue([
            ["sub", 2],
        ]);

        const items = await buildFileValueCompletions(json, "00-ToDo/", "", makeRange());

        expect(items).toHaveLength(1);
        expect(items[0].label).toBe("sub/");
        expect(items[0].kind).toBe(19); // Folder kind
        expect(items[0].command).toEqual({
            command: "editor.action.triggerSuggest",
            title: "Re-trigger completions",
        });
    });

    it("should exclude already-existing values", async () => {
        _readDir.mockResolvedValue([
            ["notes.md", 1],   // already in JSON
            ["tasks.md", 1],   // new
        ]);

        const items = await buildFileValueCompletions(json, "00-ToDo/", "", makeRange());

        const labels = items.map((i) => i.label);
        expect(labels).not.toContain("notes.md");
        expect(labels).toContain("tasks.md");
    });
});
