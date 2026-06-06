import { describe, it, expect, vi, beforeEach } from "vitest";
import { createToggleVisibilityCommand } from "../../../src/commands/toggleDotFolders";

const mockShowErrorMessage = vi.fn();
const mockShowInformationMessage = vi.fn();
const mockShowQuickPick = vi.fn();
const mockReadDirectory = vi.fn();
const mockGetConfiguration = vi.fn();
const mockConfigUpdate = vi.fn();
const mockWorkspaceFolders: any[] = [];

vi.mock("vscode", () => ({
    FileType: { Directory: 2, File: 1 },
    ConfigurationTarget: { Workspace: 2 },
    workspace: {
        get workspaceFolders() {
            return mockWorkspaceFolders;
        },
        fs: {
            readDirectory: (...args: any[]) => mockReadDirectory(...args),
        },
        getConfiguration: (...args: any[]) => mockGetConfiguration(...args),
    },
    window: {
        showErrorMessage: (...args: any[]) => mockShowErrorMessage(...args),
        showInformationMessage: (...args: any[]) => mockShowInformationMessage(...args),
        showQuickPick: (...args: any[]) => mockShowQuickPick(...args),
    },
    Uri: {
        joinPath: vi.fn((base: any, ...segments: string[]) => ({
            ...base,
            path: [base.path, ...segments].join("/"),
        })),
    },
}));

const rootUri = { path: "/workspace" } as any;

const makeConfigWith = (exclude: Record<string, boolean>) => ({
    get: vi.fn((key: string) => (key === "exclude" ? exclude : undefined)),
    update: mockConfigUpdate,
});

describe("createToggleVisibilityCommand", () => {
    let mockManifest: any;
    let mockTelemetry: any;

    const makeHandler = () => createToggleVisibilityCommand(mockManifest, mockTelemetry);

    beforeEach(() => {
        vi.clearAllMocks();
        mockWorkspaceFolders.length = 0;
        mockManifest = {
            isInitialized: vi.fn().mockResolvedValue(true),
            findInitializedRoot: vi.fn().mockResolvedValue(rootUri),
            readDotfolders: vi.fn().mockResolvedValue(null),
            readVisibilityConfig: vi.fn().mockResolvedValue(null),
            writeDotfolders: vi.fn().mockResolvedValue(undefined),
        };
        mockTelemetry = { logUsage: vi.fn() };
        mockConfigUpdate.mockResolvedValue(undefined);
    });

    it("should show an error when no workspace is open", async () => {
        await makeHandler()();
        expect(mockShowErrorMessage).toHaveBeenCalledWith(expect.stringContaining("No workspace is open"));
    });

    it("should show an error when the workspace is not initialized", async () => {
        mockWorkspaceFolders.push({ uri: rootUri, name: "workspace" });
        mockManifest.findInitializedRoot.mockResolvedValue(null);
        await makeHandler()();
        expect(mockShowErrorMessage).toHaveBeenCalledWith(expect.stringContaining("not initialized"));
    });

    describe("hide-all path (all visible / first use)", () => {
        beforeEach(() => {
            mockWorkspaceFolders.push({ uri: rootUri, name: "workspace" });
            // No managed entries → empty dotfolders.json
            mockManifest.readVisibilityConfig.mockResolvedValue({ managedEntries: [] });
            // files.exclude has nothing managed
            mockGetConfiguration.mockReturnValue(makeConfigWith({}));
        });

        it("should scan workspace root for dot-entries when no entries are managed", async () => {
            mockReadDirectory.mockResolvedValue([[".git", 2], [".vscode", 2], ["src", 2]]);
            await makeHandler()();
            expect(mockReadDirectory).toHaveBeenCalled();
        });

        it("should add all dot-folders to files.exclude", async () => {
            mockReadDirectory.mockResolvedValue([[".git", 2], [".vscode", 2], ["src", 2]]);
            await makeHandler()();
            expect(mockConfigUpdate).toHaveBeenCalledWith(
                "exclude",
                expect.objectContaining({ ".git": true, ".vscode": true }),
                expect.any(Number)
            );
        });

        it("should add dot-files to files.exclude", async () => {
            mockReadDirectory.mockResolvedValue([[".gitignore", 1], [".editorconfig", 1], ["README.md", 1]]);
            await makeHandler()();
            expect(mockConfigUpdate).toHaveBeenCalledWith(
                "exclude",
                expect.objectContaining({ ".gitignore": true, ".editorconfig": true }),
                expect.any(Number)
            );
            const updatedExclude = mockConfigUpdate.mock.calls[0][1];
            expect(Object.keys(updatedExclude)).not.toContain("README.md");
        });

        it("should not add non-dot entries to files.exclude", async () => {
            mockReadDirectory.mockResolvedValue([[".git", 2], ["src", 2]]);
            await makeHandler()();
            const updatedExclude = mockConfigUpdate.mock.calls[0][1];
            expect(Object.keys(updatedExclude)).not.toContain("src");
        });

        it("should write managedEntries to dotfolders.json", async () => {
            mockReadDirectory.mockResolvedValue([[".git", 2], [".vscode", 2]]);
            await makeHandler()();
            expect(mockManifest.writeDotfolders).toHaveBeenCalledWith(
                rootUri,
                expect.objectContaining({ managedEntries: expect.arrayContaining([".git", ".vscode"]) })
            );
        });

        it("should emit visibility.toggle telemetry with action=hide", async () => {
            mockReadDirectory.mockResolvedValue([[".git", 2]]);
            await makeHandler()();
            expect(mockTelemetry.logUsage).toHaveBeenCalledWith("visibility.toggle", expect.objectContaining({ action: "hide" }));
        });

        it("should show an info message when no dot-entries are found", async () => {
            mockReadDirectory.mockResolvedValue([["src", 2], ["dist", 2]]);
            await makeHandler()();
            expect(mockShowInformationMessage).toHaveBeenCalledWith(expect.stringContaining("No items starting with"));
        });
    });

    describe("QuickPick path (some hidden)", () => {
        beforeEach(() => {
            mockWorkspaceFolders.push({ uri: rootUri, name: "workspace" });
            mockManifest.readVisibilityConfig.mockResolvedValue({ managedEntries: [".git", ".vscode", ".memoria"] });
            // .git and .vscode are hidden; .memoria is visible
            mockGetConfiguration.mockReturnValue(makeConfigWith({ ".git": true, ".vscode": true }));
            mockReadDirectory.mockResolvedValue([[".git", 2], [".vscode", 2], [".memoria", 2]]);
        });

        it("should show a multi-select QuickPick with all managed entries", async () => {
            mockShowQuickPick.mockResolvedValue([]);
            await makeHandler()();
            expect(mockShowQuickPick).toHaveBeenCalledWith(
                expect.arrayContaining([
                    expect.objectContaining({ label: ".git" }),
                    expect.objectContaining({ label: ".vscode" }),
                    expect.objectContaining({ label: ".memoria" }),
                ]),
                expect.objectContaining({ canPickMany: true })
            );
        });

        it("should pre-check currently hidden folders in the QuickPick", async () => {
            mockShowQuickPick.mockResolvedValue([]);
            await makeHandler()();
            const items = mockShowQuickPick.mock.calls[0][0];
            const gitItem = items.find((i: any) => i.label === ".git");
            const memoriaItem = items.find((i: any) => i.label === ".memoria");
            expect(gitItem?.picked).toBe(true);
            expect(memoriaItem?.picked).toBe(false);
        });

        it("should update files.exclude to match the user's QuickPick selection", async () => {
            // User keeps .git hidden, unchecks .vscode
            mockShowQuickPick.mockResolvedValue([{ label: ".git" }]);
            await makeHandler()();
            const updatedExclude = mockConfigUpdate.mock.calls[0][1];
            expect(updatedExclude[".git"]).toBe(true);
            expect(".vscode" in updatedExclude).toBe(false);
        });

        it("should do nothing when the user cancels the QuickPick", async () => {
            mockShowQuickPick.mockResolvedValue(undefined);
            await makeHandler()();
            expect(mockConfigUpdate).not.toHaveBeenCalled();
            expect(mockManifest.writeDotfolders).not.toHaveBeenCalled();
        });

        it("should emit visibility.toggle telemetry with action=update", async () => {
            mockShowQuickPick.mockResolvedValue([{ label: ".git" }]);
            await makeHandler()();
            expect(mockTelemetry.logUsage).toHaveBeenCalledWith(
                "visibility.toggle",
                expect.objectContaining({ action: "update" })
            );
        });
    });
});
