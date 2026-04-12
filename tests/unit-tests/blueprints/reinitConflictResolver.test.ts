import { describe, it, expect, vi, beforeEach } from "vitest";
import { ReinitConflictResolver } from "../../../src/blueprints/reinitConflictResolver";
import { computeFileHash } from "../../../src/blueprints/hashUtils";
import type { BlueprintDefinition, BlueprintManifest } from "../../../src/blueprints/types";

const mockReadDirectory = vi.fn();
const mockReadFile = vi.fn();
const mockShowQuickPick = vi.fn();
const mockShowInformationMessage = vi.fn();
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
        },
    },
    window: {
        showQuickPick: (...args: any[]) => mockShowQuickPick(...args),
        showInformationMessage: (...args: any[]) => mockShowInformationMessage(...args),
    },
    Uri: {
        joinPath: (...args: any[]) => mockJoinPath(...args),
    },
}));

const mockFs = {
    readDirectory: (...args: any[]) => mockReadDirectory(...args),
    readFile: (...args: any[]) => mockReadFile(...args),
} as any;

const encoder = new TextEncoder();
const workspaceRoot = { path: "/workspace" } as any;

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
    decorations: [],
};

const existingManifest: BlueprintManifest = {
    blueprintId: "individual-contributor",
    blueprintVersion: "1.0.0",
    initializedAt: "2026-01-01T00:00:00.000Z",
    lastReinitAt: null,
    fileManifest: {
        "00-ToDo/Main.todo": computeFileHash(encoder.encode("# original content")),
    },
};

describe("ReinitConflictResolver", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe("resolveConflicts", () => {
        it("should return no extra folders when all on-disk folders match the blueprint", async () => {
            mockReadDirectory.mockResolvedValue([
                ["00-ToDo", 2],
                ["01-ToRemember", 2],
            ]);
            mockReadFile.mockResolvedValue(encoder.encode("# original content"));
            mockShowQuickPick.mockResolvedValue([]);

            const resolver = new ReinitConflictResolver(mockFs);
            const plan = await resolver.resolveConflicts(workspaceRoot, existingManifest, blueprintDefinition);

            expect(plan.foldersToCleanup).toEqual([]);
            expect(plan.currentFileHashes).toBeDefined();
        });

        it("should identify extra folders not in the new blueprint", async () => {
            mockReadDirectory.mockResolvedValue([
                ["00-ToDo", 2],
                ["01-ToRemember", 2],
                ["ExtraFolder", 2],
            ]);
            mockReadFile.mockResolvedValue(encoder.encode("# original content"));
            mockShowQuickPick.mockResolvedValue([{ label: "ExtraFolder" }]);

            const resolver = new ReinitConflictResolver(mockFs);
            const plan = await resolver.resolveConflicts(workspaceRoot, existingManifest, blueprintDefinition);

            expect(plan.foldersToCleanup).toEqual(["ExtraFolder"]);
        });

        it("should not include .memoria or ReInitializationCleanup as extra folders", async () => {
            mockReadDirectory.mockResolvedValue([
                [".memoria", 2],
                ["ReInitializationCleanup", 2],
                ["00-ToDo", 2],
            ]);
            mockReadFile.mockResolvedValue(encoder.encode("# original content"));
            mockShowQuickPick.mockResolvedValue([]);

            const resolver = new ReinitConflictResolver(mockFs);
            await resolver.resolveConflicts(workspaceRoot, existingManifest, blueprintDefinition);

            // .memoria and ReInitializationCleanup are excluded from the QuickPick items
            const quickPickItems = mockShowQuickPick.mock.calls[0]?.[0] ?? [];
            const labels = quickPickItems.map((i: any) => i.label);
            expect(labels).not.toContain(".memoria");
            expect(labels).not.toContain("ReInitializationCleanup");
        });

        it("should categorise unmodified files (hash matches stored) correctly", async () => {
            mockReadDirectory.mockResolvedValue([["00-ToDo", 2], ["01-ToRemember", 2]]);
            // File on disk matches the stored hash
            mockReadFile.mockResolvedValue(encoder.encode("# original content"));
            mockShowQuickPick.mockResolvedValue([]);

            const resolver = new ReinitConflictResolver(mockFs);
            const plan = await resolver.resolveConflicts(workspaceRoot, existingManifest, blueprintDefinition);

            expect(plan.unmodifiedBlueprintFiles).toContain("00-ToDo/Main.todo");
            expect(plan.modifiedBlueprintFiles.has("00-ToDo/Main.todo")).toBe(false);
        });

        it("should categorise modified files (hash differs from stored) correctly", async () => {
            mockReadDirectory.mockResolvedValue([["00-ToDo", 2], ["01-ToRemember", 2]]);
            // File on disk has been changed by the user
            mockReadFile.mockResolvedValue(encoder.encode("# user modifications"));
            mockShowQuickPick.mockResolvedValue([]);

            const resolver = new ReinitConflictResolver(mockFs);
            const plan = await resolver.resolveConflicts(workspaceRoot, existingManifest, blueprintDefinition);

            expect(plan.modifiedBlueprintFiles.has("00-ToDo/Main.todo")).toBe(true);
            expect(plan.unmodifiedBlueprintFiles).not.toContain("00-ToDo/Main.todo");
        });

        it("should populate currentFileHashes for files that have a stored hash", async () => {
            mockReadDirectory.mockResolvedValue([["00-ToDo", 2], ["01-ToRemember", 2]]);
            mockReadFile.mockResolvedValue(encoder.encode("# user modifications"));
            mockShowQuickPick.mockResolvedValue([]);

            const resolver = new ReinitConflictResolver(mockFs);
            const plan = await resolver.resolveConflicts(workspaceRoot, existingManifest, blueprintDefinition);

            expect(plan.currentFileHashes["00-ToDo/Main.todo"]).toBe(
                computeFileHash(encoder.encode("# user modifications"))
            );
        });

        it("should treat missing files (not in old manifest) as unmodified (new in blueprint)", async () => {
            mockReadDirectory.mockResolvedValue([["00-ToDo", 2], ["01-ToRemember", 2]]);
            mockReadFile.mockResolvedValue(encoder.encode("some content"));
            mockShowQuickPick.mockResolvedValue([]);

            const manifest = { ...existingManifest, fileManifest: {} }; // no stored hashes
            const resolver = new ReinitConflictResolver(mockFs);
            const plan = await resolver.resolveConflicts(workspaceRoot, manifest, blueprintDefinition);

            expect(plan.unmodifiedBlueprintFiles).toContain("00-ToDo/Main.todo");
            expect(plan.modifiedBlueprintFiles.size).toBe(0);
        });

        it("should treat all folders as extra when switching to a different blueprint", async () => {
            mockReadDirectory.mockResolvedValue([
                ["00-ToDo", 2],
                ["SomeOtherFolder", 2],
            ]);
            mockReadFile.mockResolvedValue(encoder.encode("# original content"));
            mockShowQuickPick.mockResolvedValue([]);

            const differentBlueprint: BlueprintDefinition = {
                ...blueprintDefinition,
                id: "manager",
                workspace: [{ name: "NewFolder/", isFolder: true }],
            };
            const oldManifest: BlueprintManifest = { ...existingManifest, blueprintId: "original-id" };
            const resolver = new ReinitConflictResolver(mockFs);

            await resolver.resolveConflicts(workspaceRoot, oldManifest, differentBlueprint);

            // When blueprintId differs → all on-disk folders are "extra"
            const quickPickItems = mockShowQuickPick.mock.calls[0]?.[0] ?? [];
            const labels = quickPickItems.map((i: any) => i.label);
            expect(labels).toContain("00-ToDo");
            expect(labels).toContain("SomeOtherFolder");
        });

        it("should not prompt folder cleanup when no extra folders are found", async () => {
            mockReadDirectory.mockResolvedValue([["00-ToDo", 2], ["01-ToRemember", 2]]);
            mockReadFile.mockResolvedValue(encoder.encode("# original content"));

            const resolver = new ReinitConflictResolver(mockFs);
            await resolver.resolveConflicts(workspaceRoot, existingManifest, blueprintDefinition);

            expect(mockShowQuickPick).not.toHaveBeenCalled();
        });

        it("should return empty foldersToCleanup when user cancels the folder cleanup QuickPick", async () => {
            mockReadDirectory.mockResolvedValue([
                ["00-ToDo", 2],
                ["ExtraFolder", 2],
            ]);
            mockReadFile.mockResolvedValue(encoder.encode("# original content"));
            mockShowQuickPick.mockResolvedValue(undefined); // user cancels

            const resolver = new ReinitConflictResolver(mockFs);
            const plan = await resolver.resolveConflicts(workspaceRoot, existingManifest, blueprintDefinition);

            expect(plan.foldersToCleanup).toEqual([]);
        });
    });

    describe("promptFolderCleanup", () => {
        it("should show a multi-select QuickPick with all extra folders", async () => {
            mockShowQuickPick.mockResolvedValue([]);
            const resolver = new ReinitConflictResolver(mockFs);
            await resolver.promptFolderCleanup(["FolderA", "FolderB"]);
            expect(mockShowQuickPick).toHaveBeenCalledWith(
                expect.arrayContaining([
                    expect.objectContaining({ label: "FolderA" }),
                    expect.objectContaining({ label: "FolderB" }),
                ]),
                expect.objectContaining({ canPickMany: true })
            );
        });

        it("should return the labels of selected folders", async () => {
            mockShowQuickPick.mockResolvedValue([{ label: "FolderA" }]);
            const resolver = new ReinitConflictResolver(mockFs);
            const result = await resolver.promptFolderCleanup(["FolderA", "FolderB"]);
            expect(result).toEqual(["FolderA"]);
        });

        it("should return an empty array when the user cancels", async () => {
            mockShowQuickPick.mockResolvedValue(undefined);
            const resolver = new ReinitConflictResolver(mockFs);
            const result = await resolver.promptFolderCleanup(["FolderA"]);
            expect(result).toEqual([]);
        });
    });

    describe("promptFileOverwrite", () => {
        it("should return 'yes' when the user chooses to overwrite this file only", async () => {
            mockShowInformationMessage.mockResolvedValue("Yes");
            const resolver = new ReinitConflictResolver(mockFs);
            const choice = await resolver.promptFileOverwrite("00-ToDo/Main.todo");
            expect(choice).toBe("yes");
        });

        it("should return 'yes-folder' when the user chooses to overwrite all in folder (non-recursive)", async () => {
            mockShowInformationMessage.mockResolvedValue("Yes — all in 00-ToDo/");
            const resolver = new ReinitConflictResolver(mockFs);
            const choice = await resolver.promptFileOverwrite("00-ToDo/Main.todo");
            expect(choice).toBe("yes-folder");
        });

        it("should return 'yes-folder-recursive' when the user chooses recursive overwrite", async () => {
            mockShowInformationMessage.mockResolvedValue("Yes — all in 00-ToDo/ (recursive)");
            const resolver = new ReinitConflictResolver(mockFs);
            const choice = await resolver.promptFileOverwrite("00-ToDo/Main.todo");
            expect(choice).toBe("yes-folder-recursive");
        });

        it("should return 'no' when the user chooses not to overwrite", async () => {
            mockShowInformationMessage.mockResolvedValue("No");
            const resolver = new ReinitConflictResolver(mockFs);
            const choice = await resolver.promptFileOverwrite("00-ToDo/Main.todo");
            expect(choice).toBe("no");
        });

        it("should return 'no' when the user dismisses the dialog", async () => {
            mockShowInformationMessage.mockResolvedValue(undefined);
            const resolver = new ReinitConflictResolver(mockFs);
            const choice = await resolver.promptFileOverwrite("00-ToDo/Main.todo");
            expect(choice).toBe("no");
        });
    });
});
