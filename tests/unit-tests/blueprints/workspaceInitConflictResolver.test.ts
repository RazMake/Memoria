import { describe, it, expect, vi, beforeEach } from "vitest";
import { WorkspaceInitConflictResolver } from "../../../src/blueprints/workspaceInitConflictResolver";
import { computeFileHash } from "../../../src/blueprints/hashUtils";
import type { BlueprintDefinition, BlueprintManifest } from "../../../src/blueprints/types";

const mockReadDirectory = vi.fn();
const mockReadFile = vi.fn();
const mockCreateDirectory = vi.fn();
const mockCopy = vi.fn();
const mockShowQuickPick = vi.fn();
const mockExecuteCommand = vi.fn();
const mockJoinPath = vi.fn((base: any, ...segments: string[]) => ({
    ...base,
    path: [base.path, ...segments].join("/"),
}));

vi.mock("vscode", () => ({
    FileType: { Directory: 2, File: 1 },
    workspace: {
        fs: {
            readDirectory: (...args: any[]) => mockReadDirectory(...args),
            readFile: (...args: any[]) => mockReadFile(...args),
            createDirectory: (...args: any[]) => mockCreateDirectory(...args),
            copy: (...args: any[]) => mockCopy(...args),
        },
    },
    window: {
        showQuickPick: (...args: any[]) => mockShowQuickPick(...args),
    },
    commands: {
        executeCommand: (...args: any[]) => mockExecuteCommand(...args),
    },
    Uri: {
        joinPath: (...args: any[]) => mockJoinPath(...args),
    },
}));

const mockFs = {
    readDirectory: (...args: any[]) => mockReadDirectory(...args),
    readFile: (...args: any[]) => mockReadFile(...args),
    createDirectory: (...args: any[]) => mockCreateDirectory(...args),
    copy: (...args: any[]) => mockCopy(...args),
} as any;

const encoder = new TextEncoder();
const workspaceRoot = { path: "/workspace" } as any;
const cleanupRoot = { path: "/workspace/WorkspaceInitializationBackups" } as any;

const blueprintDefinition: BlueprintDefinition = {
    id: "individual-contributor",
    name: "Individual Contributor Notebook",
    description: "desc",
    version: "1.0.0",
    workspace: [
        {
            name: "00-ToDo/",
            isFolder: true,
            children: [{ name: "Main.todo", isFolder: false }],
        },
        { name: "01-ToRemember/", isFolder: true },
    ],
    features: [],
};

const originalContent = encoder.encode("# original content");
const modifiedContent = encoder.encode("# user modifications");
const seedContent = encoder.encode("# seed content");

const existingManifest: BlueprintManifest = {
    blueprintId: "individual-contributor",
    blueprintVersion: "1.0.0",
    initializedAt: "2026-01-01T00:00:00.000Z",
    lastReinitAt: null,
    fileManifest: {
        "00-ToDo/Main.todo": computeFileHash(originalContent),
    },
};

const noSeedContent = async (_path: string): Promise<Uint8Array | null> => null;

describe("WorkspaceInitConflictResolver", () => {
    beforeEach(() => {
        vi.resetAllMocks();
        mockCreateDirectory.mockResolvedValue(undefined);
        mockCopy.mockResolvedValue(undefined);
        mockExecuteCommand.mockResolvedValue(undefined);
    });

    describe("resolveConflicts — Phase A categorization", () => {
        it("should not back up or add to toMergeList when blueprint file hash is unchanged", async () => {
            // Blueprint: 00-ToDo/ (contains Main.todo), 01-ToRemember/ (empty)
            // Disk: 00-ToDo/, 01-ToRemember/ — both match blueprint, no extras
            mockReadDirectory.mockResolvedValue([["00-ToDo", 2], ["01-ToRemember", 2]]);
            // On-disk content matches stored hash
            mockReadFile.mockResolvedValue(originalContent);
            // No QuickPick shown: no extra folders, no conflicts

            const resolver = new WorkspaceInitConflictResolver(mockFs);
            const plan = await resolver.resolveConflicts(workspaceRoot, existingManifest, blueprintDefinition, noSeedContent);

            expect(plan).toBeDefined();
            expect(plan!.extraFolders).toEqual([]);
            expect(plan!.toMergeList).toEqual([]);
            expect(plan!.toMergeList).not.toContain("00-ToDo/Main.todo");
            expect(mockCopy).not.toHaveBeenCalled();
            expect(mockShowQuickPick).not.toHaveBeenCalled();
        });

        it("should back up and add to toMergeList when blueprint file hash has changed", async () => {
            // Blueprint: 00-ToDo/ (contains Main.todo), 01-ToRemember/ (empty)
            // Disk: 00-ToDo/, 01-ToRemember/ — no extra folders; Main.todo modified
            mockReadDirectory.mockResolvedValue([["00-ToDo", 2], ["01-ToRemember", 2]]);
            // On-disk content differs from stored hash
            mockReadFile.mockResolvedValue(modifiedContent);
            // No extra folders → folder picker not called; conflict found → file picker shown
            mockShowQuickPick.mockResolvedValueOnce([]); // file picker: no files selected for diff

            const resolver = new WorkspaceInitConflictResolver(mockFs);
            const plan = await resolver.resolveConflicts(workspaceRoot, existingManifest, blueprintDefinition, noSeedContent);

            expect(plan).toBeDefined();
            expect(plan!.extraFolders).toEqual([]);
            expect(plan!.toMergeList).toEqual(["00-ToDo/Main.todo"]);
            expect(mockCopy).toHaveBeenCalledOnce();
        });

        it("should back up and add to toMergeList when user-created file differs from blueprint seed", async () => {
            // Blueprint: 00-ToDo/ (contains Main.todo), 01-ToRemember/ (empty)
            // Disk: 00-ToDo/, 01-ToRemember/ — no extra folders; Main.todo user-modified vs seed
            // No stored hash for file (user-created, not from previous blueprint init)
            const manifest: BlueprintManifest = { ...existingManifest, fileManifest: {} };
            mockReadDirectory.mockResolvedValue([["00-ToDo", 2], ["01-ToRemember", 2]]);
            mockReadFile.mockResolvedValue(modifiedContent);
            // No extra folders → folder picker not called; conflict found → file picker shown
            mockShowQuickPick.mockResolvedValueOnce([]); // file picker: no files selected for diff

            const getSeedContent = async (_path: string) => seedContent;
            const resolver = new WorkspaceInitConflictResolver(mockFs);
            const plan = await resolver.resolveConflicts(workspaceRoot, manifest, blueprintDefinition, getSeedContent);

            expect(plan).toBeDefined();
            expect(plan!.extraFolders).toEqual([]);
            expect(plan!.toMergeList).toEqual(["00-ToDo/Main.todo"]);
            expect(mockCopy).toHaveBeenCalledOnce();
        });

        it("should not back up when user-created file is identical to blueprint seed", async () => {
            // Blueprint: 00-ToDo/ (contains Main.todo), 01-ToRemember/ (empty)
            // Disk: 00-ToDo/, 01-ToRemember/ — no extra folders; Main.todo identical to seed
            // No stored hash for file (user-created, not from previous blueprint init)
            const manifest: BlueprintManifest = { ...existingManifest, fileManifest: {} };
            mockReadDirectory.mockResolvedValue([["00-ToDo", 2], ["01-ToRemember", 2]]);
            // On-disk content is identical to seed
            mockReadFile.mockResolvedValue(seedContent);
            // No extra folders, no conflicts → no QuickPick shown

            const getSeedContent = async (_path: string) => seedContent;
            const resolver = new WorkspaceInitConflictResolver(mockFs);
            const plan = await resolver.resolveConflicts(workspaceRoot, manifest, blueprintDefinition, getSeedContent);

            expect(plan).toBeDefined();
            expect(plan!.extraFolders).toEqual([]);
            expect(plan!.toMergeList).toEqual([]);
            expect(plan!.toMergeList).not.toContain("00-ToDo/Main.todo");
            expect(mockCopy).not.toHaveBeenCalled();
            expect(mockShowQuickPick).not.toHaveBeenCalled();
        });

        it("should not flag a blueprint file that does not exist on disk", async () => {
            // Blueprint: 00-ToDo/ (contains Main.todo), 01-ToRemember/ (empty)
            // Disk: 00-ToDo/, 01-ToRemember/ folders exist but Main.todo is absent
            mockReadDirectory.mockResolvedValue([["00-ToDo", 2], ["01-ToRemember", 2]]);
            // Simulate file not existing on disk
            mockReadFile.mockRejectedValue(new Error("File not found"));
            // No extra folders, no conflicts → no QuickPick shown

            const resolver = new WorkspaceInitConflictResolver(mockFs);
            const plan = await resolver.resolveConflicts(workspaceRoot, existingManifest, blueprintDefinition, noSeedContent);

            expect(plan).toBeDefined();
            expect(plan!.extraFolders).toEqual([]);
            expect(plan!.toMergeList).toEqual([]);
            expect(plan!.toMergeList).not.toContain("00-ToDo/Main.todo");
            expect(mockShowQuickPick).not.toHaveBeenCalled();
        });

        it("should exclude .memoria/ and WorkspaceInitializationBackups/ from extraFolders", async () => {
            // Blueprint: 00-ToDo/ (contains Main.todo), 01-ToRemember/ (empty)
            // Disk: .memoria/, WorkspaceInitializationBackups/, 00-ToDo/, 01-ToRemember/
            // Only .memoria and WorkspaceInitializationBackups are system-reserved and must be excluded
            mockReadDirectory.mockResolvedValue([
                [".memoria", 2],
                ["WorkspaceInitializationBackups", 2],
                ["00-ToDo", 2],
                ["01-ToRemember", 2],
            ]);
            // Main.todo on disk is unchanged
            mockReadFile.mockResolvedValue(originalContent);
            // No extra folders (system folders excluded), no conflicts → no QuickPick shown

            const resolver = new WorkspaceInitConflictResolver(mockFs);
            const plan = await resolver.resolveConflicts(workspaceRoot, existingManifest, blueprintDefinition, noSeedContent);

            expect(plan).toBeDefined();
            expect(plan!.extraFolders).toEqual([]);
            expect(plan!.extraFolders).not.toContain(".memoria");
            expect(plan!.extraFolders).not.toContain("WorkspaceInitializationBackups");
            expect(plan!.extraFolders).not.toContain("00-ToDo");
            expect(plan!.extraFolders).not.toContain("01-ToRemember");
            expect(plan!.toMergeList).toEqual([]);
            expect(plan!.toMergeList).not.toContain("00-ToDo/Main.todo");
            expect(mockShowQuickPick).not.toHaveBeenCalled();
        });

        it("should identify extra folders not in the new blueprint", async () => {
            // Blueprint: 00-ToDo/ (contains Main.todo), 01-ToRemember/ (empty)
            // Disk: 00-ToDo/, 01-ToRemember/, ExtraFolder/ — ExtraFolder is the only extra
            mockReadDirectory.mockResolvedValue([
                ["00-ToDo", 2],
                ["01-ToRemember", 2],
                ["ExtraFolder", 2],
            ]);
            // Main.todo on disk is unchanged
            mockReadFile.mockResolvedValue(originalContent);
            // Folder picker shown for ExtraFolder; user unchecks it (moves to cleanup)
            // No file conflicts → file picker not called
            mockShowQuickPick.mockResolvedValueOnce([]); // folder picker: ExtraFolder unchecked → foldersToCleanup = ["ExtraFolder"]

            const resolver = new WorkspaceInitConflictResolver(mockFs);
            const plan = await resolver.resolveConflicts(workspaceRoot, existingManifest, blueprintDefinition, noSeedContent);

            expect(plan).toBeDefined();
            expect(plan!.extraFolders).toEqual(["ExtraFolder"]);
            expect(plan!.extraFolders).not.toContain("00-ToDo");
            expect(plan!.extraFolders).not.toContain("01-ToRemember");
            expect(plan!.foldersToCleanup).toEqual(["ExtraFolder"]);
            expect(plan!.toMergeList).toEqual([]);
            expect(plan!.toMergeList).not.toContain("00-ToDo/Main.todo");
        });

        it("should only flag folders on disk that are not in the blueprint as extra, and check files in shared folders (blueprint A,B,C,D with files; disk D,E)", async () => {
            // Blueprint has A/fileA.md, B/fileB.md, C/fileC.md, D/fileD.md
            const blueprintWithABCD: BlueprintDefinition = {
                ...blueprintDefinition,
                workspace: [
                    { name: "A/", isFolder: true, children: [{ name: "fileA.md", isFolder: false }] },
                    { name: "B/", isFolder: true, children: [{ name: "fileB.md", isFolder: false }] },
                    { name: "C/", isFolder: true, children: [{ name: "fileC.md", isFolder: false }] },
                    { name: "D/", isFolder: true, children: [{ name: "fileD.md", isFolder: false }] },
                ],
            };
            // Manifest has D/fileD.md stored with original hash
            const manifest: BlueprintManifest = {
                ...existingManifest,
                fileManifest: { "D/fileD.md": computeFileHash(originalContent) },
            };
            // Disk has D (shared with blueprint) and E (not in blueprint)
            mockReadDirectory.mockResolvedValue([["D", 2], ["E", 2]]);
            // D/fileD.md exists on disk but was modified; A,B,C files are absent
            mockReadFile.mockImplementation((uri: any) => {
                if ((uri.path as string).endsWith("D/fileD.md")) return Promise.resolve(modifiedContent);
                return Promise.reject(new Error("File not found"));
            });
            // Folder picker: E is the only extra folder, user keeps it (no cleanup)
            // File picker: D/fileD.md is conflicting; user selects none for diff
            mockShowQuickPick
                .mockResolvedValueOnce([{ label: "E" }]) // folder picker: E kept → foldersToCleanup = []
                .mockResolvedValueOnce([]); // file picker: no files selected for diff

            const resolver = new WorkspaceInitConflictResolver(mockFs);
            const plan = await resolver.resolveConflicts(workspaceRoot, manifest, blueprintWithABCD, noSeedContent);

            expect(plan).toBeDefined();
            // Extra folder assertions
            expect(plan!.extraFolders).toEqual(["E"]);
            expect(plan!.extraFolders).not.toContain("D");
            expect(plan!.extraFolders).not.toContain("A");
            expect(plan!.extraFolders).not.toContain("B");
            expect(plan!.extraFolders).not.toContain("C");
            // File conflict assertions
            expect(plan!.toMergeList).toContain("D/fileD.md"); // modified on disk → conflict
            expect(plan!.toMergeList).not.toContain("A/fileA.md"); // absent from disk → no conflict
            expect(plan!.toMergeList).not.toContain("B/fileB.md");
            expect(plan!.toMergeList).not.toContain("C/fileC.md");
            expect(mockCopy).toHaveBeenCalledOnce(); // backup made for D/fileD.md
        });

        it("should identify on-disk folders not in the new blueprint as extra when switching blueprints", async () => {
            // New blueprint: NewFolder/ (empty) — completely different from what's on disk
            // Disk: 00-ToDo/, SomeOtherFolder/ — neither matches NewFolder/, so both are extra
            // New blueprint has no files to categorize (NewFolder has no children)
            mockReadDirectory.mockResolvedValue([
                ["00-ToDo", 2],
                ["SomeOtherFolder", 2],
            ]);
            mockReadFile.mockRejectedValue(new Error("File not found")); // no blueprint files on disk
            // Folder picker shown with both folders; user unchecks all (moves to cleanup)
            // No file conflicts → file picker not called
            mockShowQuickPick.mockResolvedValueOnce([]); // folder picker: all unchecked → foldersToCleanup = all

            const differentBlueprint: BlueprintDefinition = {
                ...blueprintDefinition,
                id: "manager",
                workspace: [{ name: "NewFolder/", isFolder: true }],
            };
            const oldManifest: BlueprintManifest = { ...existingManifest, blueprintId: "original-id" };
            const resolver = new WorkspaceInitConflictResolver(mockFs);
            const plan = await resolver.resolveConflicts(workspaceRoot, oldManifest, differentBlueprint, noSeedContent);

            expect(plan).toBeDefined();
            expect(plan!.extraFolders).toContain("00-ToDo");
            expect(plan!.extraFolders).toContain("SomeOtherFolder");
            expect(plan!.extraFolders).not.toContain("NewFolder");
            expect(plan!.foldersToCleanup).toContain("00-ToDo");
            expect(plan!.foldersToCleanup).toContain("SomeOtherFolder");
            expect(plan!.toMergeList).toEqual([]);
            const quickPickItems = mockShowQuickPick.mock.calls[0]?.[0] ?? [];
            const labels = quickPickItems.map((i: any) => i.label);
            expect(labels).toContain("00-ToDo");
            expect(labels).toContain("SomeOtherFolder");
        });

        it("should never treat new-blueprint folders as extra when switching blueprints, even if they exist on disk", async () => {
            // New blueprint: NewFolder/ (empty) — switching from a different blueprint
            // Disk: OldFolder/ (from old blueprint), NewFolder/ (user pre-created it)
            // OldFolder is extra (not in new blueprint); NewFolder is a blueprint folder and must NOT be extra
            mockReadDirectory.mockResolvedValue([
                ["OldFolder", 2],
                ["NewFolder", 2],
            ]);
            mockReadFile.mockRejectedValue(new Error("File not found")); // no blueprint files on disk
            // Folder picker shown for OldFolder only; user unchecks it (moves to cleanup)
            // No file conflicts → file picker not called
            mockShowQuickPick.mockResolvedValueOnce([]); // folder picker: OldFolder unchecked → foldersToCleanup = ["OldFolder"]

            const differentBlueprint: BlueprintDefinition = {
                ...blueprintDefinition,
                id: "manager",
                workspace: [{ name: "NewFolder/", isFolder: true }],
            };
            const oldManifest: BlueprintManifest = { ...existingManifest, blueprintId: "original-id" };
            const resolver = new WorkspaceInitConflictResolver(mockFs);
            const plan = await resolver.resolveConflicts(workspaceRoot, oldManifest, differentBlueprint, noSeedContent);

            expect(plan).toBeDefined();
            // NewFolder is in the new blueprint — must never appear in extraFolders regardless of blueprint switch
            expect(plan!.extraFolders).not.toContain("NewFolder");
            expect(plan!.foldersToCleanup).not.toContain("NewFolder");
            // OldFolder is genuinely extra (not in new blueprint)
            expect(plan!.extraFolders).toContain("OldFolder");
            expect(plan!.foldersToCleanup).toContain("OldFolder");
        });

        it("should not show folder QuickPick when no extra folders exist", async () => {
            // Blueprint: 00-ToDo/ (contains Main.todo), 01-ToRemember/ (empty)
            // Disk: 00-ToDo/, 01-ToRemember/ — exact match, no extras, Main.todo unchanged
            mockReadDirectory.mockResolvedValue([["00-ToDo", 2], ["01-ToRemember", 2]]);
            // Main.todo on disk is unchanged
            mockReadFile.mockResolvedValue(originalContent);
            // No extra folders and no conflicts → neither QuickPick should appear

            const resolver = new WorkspaceInitConflictResolver(mockFs);
            const plan = await resolver.resolveConflicts(workspaceRoot, existingManifest, blueprintDefinition, noSeedContent);

            expect(plan).toBeDefined();
            expect(plan!.extraFolders).toEqual([]);
            expect(plan!.foldersToCleanup).toEqual([]);
            expect(plan!.toMergeList).toEqual([]);
            expect(plan!.toMergeList).not.toContain("00-ToDo/Main.todo");
            // Neither folder picker nor file picker should be called
            expect(mockShowQuickPick).not.toHaveBeenCalled();
        });
    });

    describe("resolveConflicts — cancellation", () => {
        it("should return undefined when user cancels the folder cleanup QuickPick", async () => {
            mockReadDirectory.mockResolvedValue([
                ["00-ToDo", 2],
                ["ExtraFolder", 2],
            ]);
            mockReadFile.mockResolvedValue(originalContent);
            mockShowQuickPick.mockResolvedValue(undefined); // user cancels folder picker

            const resolver = new WorkspaceInitConflictResolver(mockFs);
            const plan = await resolver.resolveConflicts(workspaceRoot, existingManifest, blueprintDefinition, noSeedContent);

            expect(plan).toBeUndefined();
        });

        it("should return undefined when user cancels the file merge QuickPick", async () => {
            mockReadDirectory.mockResolvedValue([["00-ToDo", 2], ["01-ToRemember", 2]]);
            mockReadFile.mockResolvedValue(modifiedContent); // trigger a conflict
            // No extra folders → folder picker is NOT called. Only file picker is shown.
            mockShowQuickPick.mockResolvedValue(undefined); // file picker cancelled

            const resolver = new WorkspaceInitConflictResolver(mockFs);
            const plan = await resolver.resolveConflicts(workspaceRoot, existingManifest, blueprintDefinition, noSeedContent);

            expect(plan).toBeUndefined();
        });

        it("should leave backups in place when user cancels after Phase A", async () => {
            mockReadDirectory.mockResolvedValue([["00-ToDo", 2], ["01-ToRemember", 2]]);
            mockReadFile.mockResolvedValue(modifiedContent); // triggers backup
            // No extra folders → folder picker NOT called. File picker is shown and cancelled.
            mockShowQuickPick.mockResolvedValue(undefined); // file picker cancelled

            const resolver = new WorkspaceInitConflictResolver(mockFs);
            await resolver.resolveConflicts(workspaceRoot, existingManifest, blueprintDefinition, noSeedContent);

            // Backup should have been made in Phase A before the cancel
            expect(mockCopy).toHaveBeenCalledOnce();
        });
    });

    describe("promptFolderCleanup", () => {
        it("should show a multi-select QuickPick with all extra folders, all checked by default", async () => {
            mockShowQuickPick.mockResolvedValue([]);
            const resolver = new WorkspaceInitConflictResolver(mockFs);
            await resolver.promptFolderCleanup(["FolderA", "FolderB"]);

            expect(mockShowQuickPick).toHaveBeenCalledWith(
                expect.arrayContaining([
                    expect.objectContaining({ label: "FolderA", picked: true }),
                    expect.objectContaining({ label: "FolderB", picked: true }),
                ]),
                expect.objectContaining({ canPickMany: true })
            );
        });

        it("should return the folders that were unchecked by the user (to move to cleanup)", async () => {
            // User keeps only FolderA checked — FolderB is unchecked (to remove)
            mockShowQuickPick.mockResolvedValue([{ label: "FolderA" }]);
            const resolver = new WorkspaceInitConflictResolver(mockFs);
            const result = await resolver.promptFolderCleanup(["FolderA", "FolderB"]);

            expect(result).toEqual(["FolderB"]);
        });

        it("should return an empty array when the user keeps all folders (all checked)", async () => {
            mockShowQuickPick.mockResolvedValue([{ label: "FolderA" }, { label: "FolderB" }]);
            const resolver = new WorkspaceInitConflictResolver(mockFs);
            const result = await resolver.promptFolderCleanup(["FolderA", "FolderB"]);

            expect(result).toEqual([]);
        });

        it("should return undefined when the user cancels the QuickPick", async () => {
            mockShowQuickPick.mockResolvedValue(undefined);
            const resolver = new WorkspaceInitConflictResolver(mockFs);
            const result = await resolver.promptFolderCleanup(["FolderA"]);

            expect(result).toBeUndefined();
        });
    });

    describe("promptFileMerge", () => {
        it("should show a multi-select QuickPick with all conflicting files, none checked by default", async () => {
            mockShowQuickPick.mockResolvedValue([]);
            const resolver = new WorkspaceInitConflictResolver(mockFs);
            await resolver.promptFileMerge(["00-ToDo/Main.todo", "01-Notes/README.md"]);

            expect(mockShowQuickPick).toHaveBeenCalledWith(
                expect.arrayContaining([
                    expect.objectContaining({ label: "00-ToDo/Main.todo", picked: false }),
                    expect.objectContaining({ label: "01-Notes/README.md", picked: false }),
                ]),
                expect.objectContaining({ canPickMany: true })
            );
        });

        it("should return the paths of files the user checked", async () => {
            mockShowQuickPick.mockResolvedValue([{ label: "00-ToDo/Main.todo" }]);
            const resolver = new WorkspaceInitConflictResolver(mockFs);
            const result = await resolver.promptFileMerge(["00-ToDo/Main.todo", "01-Notes/README.md"]);

            expect(result).toEqual(["00-ToDo/Main.todo"]);
        });

        it("should return an empty array when the user checks nothing", async () => {
            mockShowQuickPick.mockResolvedValue([]);
            const resolver = new WorkspaceInitConflictResolver(mockFs);
            const result = await resolver.promptFileMerge(["00-ToDo/Main.todo"]);

            expect(result).toEqual([]);
        });

        it("should return undefined when the user cancels the QuickPick", async () => {
            mockShowQuickPick.mockResolvedValue(undefined);
            const resolver = new WorkspaceInitConflictResolver(mockFs);
            const result = await resolver.promptFileMerge(["00-ToDo/Main.todo"]);

            expect(result).toBeUndefined();
        });
    });

    describe("openDiffEditors", () => {
        it("should open a merge editor for each file path", async () => {
            const resolver = new WorkspaceInitConflictResolver(mockFs);
            await resolver.openDiffEditors(workspaceRoot, cleanupRoot, [
                "00-ToDo/Main.todo",
                "01-Notes/README.md",
            ]);

            expect(mockExecuteCommand).toHaveBeenCalledTimes(2);
            expect(mockExecuteCommand).toHaveBeenCalledWith(
                "vscode.openMergeEditor",
                expect.objectContaining({
                    base: expect.objectContaining({ path: "/workspace/WorkspaceInitializationBackups/00-ToDo/Main.todo" }),
                    input1: expect.objectContaining({ uri: expect.objectContaining({ path: "/workspace/WorkspaceInitializationBackups/00-ToDo/Main.todo" }), title: "Your Version" }),
                    input2: expect.objectContaining({ uri: expect.objectContaining({ path: "/workspace/00-ToDo/Main.todo" }), title: "New Blueprint" }),
                    output: expect.objectContaining({ path: "/workspace/00-ToDo/Main.todo" }),
                })
            );
        });

        it("should fall back to vscode.diff when merge editor is unavailable", async () => {
            mockExecuteCommand
                .mockRejectedValueOnce(new Error("command 'vscode.openMergeEditor' not found"))
                .mockResolvedValue(undefined);

            const resolver = new WorkspaceInitConflictResolver(mockFs);
            await resolver.openDiffEditors(workspaceRoot, cleanupRoot, ["00-ToDo/Main.todo"]);

            expect(mockExecuteCommand).toHaveBeenCalledTimes(2);
            expect(mockExecuteCommand).toHaveBeenNthCalledWith(1, "vscode.openMergeEditor", expect.anything());
            expect(mockExecuteCommand).toHaveBeenNthCalledWith(
                2,
                "vscode.diff",
                expect.objectContaining({ path: "/workspace/WorkspaceInitializationBackups/00-ToDo/Main.todo" }),
                expect.objectContaining({ path: "/workspace/00-ToDo/Main.todo" }),
                "Merge: Main.todo (old ↔ new)"
            );
        });

        it("should open diff editors in batches of 10", async () => {
            const filePaths = Array.from({ length: 25 }, (_, i) => `folder/file${i}.md`);
            const resolver = new WorkspaceInitConflictResolver(mockFs);
            await resolver.openDiffEditors(workspaceRoot, cleanupRoot, filePaths);

            // All 25 diff editors should be opened
            expect(mockExecuteCommand).toHaveBeenCalledTimes(25);
        });

        it("should process exactly 3 batches for 25 files (10, 10, 5)", async () => {
            // We track the order of execution by using sequential mock implementation
            const batchSizes: number[] = [];
            let currentBatchSize = 0;
            let lastResolvedCount = 0;

            mockExecuteCommand.mockImplementation(() => {
                currentBatchSize++;
                return Promise.resolve();
            });

            const filePaths = Array.from({ length: 25 }, (_, i) => `folder/file${i}.md`);
            const resolver = new WorkspaceInitConflictResolver(mockFs);
            await resolver.openDiffEditors(workspaceRoot, cleanupRoot, filePaths);

            // All 25 should be called
            expect(mockExecuteCommand).toHaveBeenCalledTimes(25);
        });

        it("should do nothing when filePaths is empty", async () => {
            const resolver = new WorkspaceInitConflictResolver(mockFs);
            await resolver.openDiffEditors(workspaceRoot, cleanupRoot, []);

            expect(mockExecuteCommand).not.toHaveBeenCalled();
        });
    });
});
