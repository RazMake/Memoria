import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as path from "path";
import * as os from "os";
import * as fs from "fs";

// --- vscode mock ---------------------------------------------------------
const showInputBox = vi.fn();
const showQuickPick = vi.fn();
const showOpenDialog = vi.fn();
const showInformationMessage = vi.fn().mockResolvedValue(undefined);
const showErrorMessage = vi.fn().mockResolvedValue(undefined);
const showWarningMessage = vi.fn().mockResolvedValue(undefined);
const executeCommand = vi.fn().mockResolvedValue(undefined);
const readDirectory = vi.fn().mockResolvedValue([]);

vi.mock("vscode", () => ({
    window: {
        showInputBox: (...a: any[]) => showInputBox(...a),
        showQuickPick: (...a: any[]) => showQuickPick(...a),
        showOpenDialog: (...a: any[]) => showOpenDialog(...a),
        showInformationMessage: (...a: any[]) => showInformationMessage(...a),
        showErrorMessage: (...a: any[]) => showErrorMessage(...a),
        showWarningMessage: (...a: any[]) => showWarningMessage(...a),
    },
    commands: { executeCommand: (...a: any[]) => executeCommand(...a) },
    workspace: {
        fs: { readDirectory: (...a: any[]) => readDirectory(...a) },
    },
    Uri: {
        joinPath: (base: any, ...segs: string[]) => ({
            ...base,
            path: [base.path, ...segs].join("/"),
            fsPath: [base.fsPath ?? base.path, ...segs].join("/"),
        }),
        file: (p: string) => ({ fsPath: p, path: p, scheme: "file" }),
    },
    FileType: { Unknown: 0, File: 1, Directory: 2, SymbolicLink: 64 },
}));

import {
    createRunBackupCommand,
    createBackupHistoryCommand,
    createCreateBackupProfileCommand,
} from "../../../src/commands/backupCommands";

const ROOT = { fsPath: "/workspace", path: "/workspace", toString: () => "file:///workspace" } as any;

function makeFeature(overrides: Record<string, any> = {}) {
    return {
        getWorkspaceRoot: vi.fn().mockReturnValue(ROOT),
        getProfileNames: vi.fn().mockReturnValue([]),
        getConfigManager: vi.fn().mockReturnValue({
            read: vi.fn().mockResolvedValue(null),
            upsertProfile: vi.fn().mockResolvedValue(undefined),
        }),
        refresh: vi.fn().mockResolvedValue(undefined),
        runProfile: vi.fn().mockResolvedValue(undefined),
        ...overrides,
    } as any;
}

function makeTelemetry() {
    return { logUsage: vi.fn(), logError: vi.fn(), dispose: vi.fn() } as any;
}

beforeEach(() => {
    vi.clearAllMocks();
    readDirectory.mockResolvedValue([]);
});

describe("createRunBackupCommand", () => {
    it("informs the user when no profiles are configured", async () => {
        const feature = makeFeature({ getProfileNames: vi.fn().mockReturnValue([]) });
        await createRunBackupCommand(feature)();
        expect(showInformationMessage).toHaveBeenCalledWith(
            expect.stringContaining("No backup profiles configured"),
        );
        expect(feature.runProfile).not.toHaveBeenCalled();
    });

    it("runs the only profile directly without prompting", async () => {
        const feature = makeFeature({ getProfileNames: vi.fn().mockReturnValue(["daily"]) });
        await createRunBackupCommand(feature)();
        expect(showQuickPick).not.toHaveBeenCalled();
        expect(feature.runProfile).toHaveBeenCalledWith("daily");
    });

    it("runs all profiles when the user picks 'All profiles'", async () => {
        const feature = makeFeature({ getProfileNames: vi.fn().mockReturnValue(["daily", "weekly"]) });
        showQuickPick.mockResolvedValueOnce({ label: "All", value: "__all__" });
        await createRunBackupCommand(feature)();
        expect(feature.runProfile).toHaveBeenCalledWith("daily");
        expect(feature.runProfile).toHaveBeenCalledWith("weekly");
    });

    it("runs a single chosen profile from multiple", async () => {
        const feature = makeFeature({ getProfileNames: vi.fn().mockReturnValue(["daily", "weekly"]) });
        showQuickPick.mockResolvedValueOnce({ label: "weekly", value: "weekly" });
        await createRunBackupCommand(feature)();
        expect(feature.runProfile).toHaveBeenCalledOnce();
        expect(feature.runProfile).toHaveBeenCalledWith("weekly");
    });

    it("does nothing when the profile picker is cancelled", async () => {
        const feature = makeFeature({ getProfileNames: vi.fn().mockReturnValue(["a", "b"]) });
        showQuickPick.mockResolvedValueOnce(undefined);
        await createRunBackupCommand(feature)();
        expect(feature.runProfile).not.toHaveBeenCalled();
    });
});

describe("createBackupHistoryCommand", () => {
    let tmpDir: string;

    beforeEach(async () => {
        tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "memoria-hist-test-"));
    });

    afterEach(async () => {
        await fs.promises.rm(tmpDir, { recursive: true, force: true });
    });

    async function touchZip(name: string): Promise<string> {
        const p = path.join(tmpDir, name);
        await fs.promises.writeFile(p, "zipdata");
        return p;
    }

    function featureWithProfile() {
        return makeFeature({
            getProfileNames: vi.fn().mockReturnValue(["daily"]),
            getConfigManager: vi.fn().mockReturnValue({
                read: vi.fn().mockResolvedValue({
                    profiles: {
                        daily: {
                            sources: ["**"],
                            exclude: [],
                            targetFolder: tmpDir,
                            schedule: { time: "18:00", days: ["mon"] },
                            retention: 5,
                        },
                    },
                    _state: {},
                }),
                upsertProfile: vi.fn(),
            }),
        });
    }

    it("informs when there are no profiles", async () => {
        const feature = makeFeature({ getProfileNames: vi.fn().mockReturnValue([]) });
        await createBackupHistoryCommand(feature)();
        expect(showInformationMessage).toHaveBeenCalledWith(
            expect.stringContaining("No backup profiles configured"),
        );
    });

    it("informs when the profile has no backups", async () => {
        const feature = featureWithProfile();
        await createBackupHistoryCommand(feature)();
        expect(showInformationMessage).toHaveBeenCalledWith(
            expect.stringContaining("No backups found"),
        );
    });

    it("reveals a selected backup in the OS file explorer", async () => {
        const zip = await touchZip("daily_HOST_2026-06-01_12-00-00.zip");
        const feature = featureWithProfile();
        showQuickPick
            .mockResolvedValueOnce({ label: path.basename(zip), fsPath: zip })
            .mockResolvedValueOnce({ label: "Reveal", value: "reveal" });
        await createBackupHistoryCommand(feature)();
        expect(executeCommand).toHaveBeenCalledWith(
            "revealFileInOS",
            expect.objectContaining({ fsPath: zip }),
        );
    });

    it("deletes a backup after confirmation", async () => {
        const zip = await touchZip("daily_HOST_2026-06-01_12-00-00.zip");
        const feature = featureWithProfile();
        showQuickPick
            .mockResolvedValueOnce({ label: path.basename(zip), fsPath: zip })
            .mockResolvedValueOnce({ label: "Delete", value: "delete" });
        showWarningMessage.mockResolvedValueOnce("Delete");
        await createBackupHistoryCommand(feature)();
        expect(fs.existsSync(zip)).toBe(false);
        expect(showInformationMessage).toHaveBeenCalledWith(
            expect.stringContaining("Deleted"),
        );
    });

    it("does not delete when the confirmation is dismissed", async () => {
        const zip = await touchZip("daily_HOST_2026-06-01_12-00-00.zip");
        const feature = featureWithProfile();
        showQuickPick
            .mockResolvedValueOnce({ label: path.basename(zip), fsPath: zip })
            .mockResolvedValueOnce({ label: "Delete", value: "delete" });
        showWarningMessage.mockResolvedValueOnce(undefined);
        await createBackupHistoryCommand(feature)();
        expect(fs.existsSync(zip)).toBe(true);
    });

    it("prompts to choose a profile when multiple exist", async () => {
        const zip = await touchZip("daily_HOST_2026-06-01_12-00-00.zip");
        const feature = featureWithProfile();
        feature.getProfileNames.mockReturnValue(["daily", "weekly"]);
        showQuickPick
            .mockResolvedValueOnce({ label: "daily" }) // profile selection
            .mockResolvedValueOnce({ label: path.basename(zip), fsPath: zip }) // backup selection
            .mockResolvedValueOnce({ label: "Reveal", value: "reveal" });
        await createBackupHistoryCommand(feature)();
        expect(executeCommand).toHaveBeenCalledWith("revealFileInOS", expect.anything());
    });

    it("does nothing when the profile picker is cancelled", async () => {
        await touchZip("daily_HOST_2026-06-01_12-00-00.zip");
        const feature = featureWithProfile();
        feature.getProfileNames.mockReturnValue(["daily", "weekly"]);
        showQuickPick.mockResolvedValueOnce(undefined); // cancel profile pick
        await createBackupHistoryCommand(feature)();
        expect(executeCommand).not.toHaveBeenCalled();
    });

    it("returns early when the chosen profile no longer exists in the config", async () => {
        const feature = makeFeature({
            getProfileNames: vi.fn().mockReturnValue(["daily"]),
            getConfigManager: vi.fn().mockReturnValue({
                read: vi.fn().mockResolvedValue({ profiles: {}, _state: {} }),
                upsertProfile: vi.fn(),
            }),
        });
        await createBackupHistoryCommand(feature)();
        expect(showQuickPick).not.toHaveBeenCalled();
    });

    it("does nothing when the backup selection is cancelled", async () => {
        await touchZip("daily_HOST_2026-06-01_12-00-00.zip");
        const feature = featureWithProfile();
        showQuickPick.mockResolvedValueOnce(undefined); // cancel backup selection
        await createBackupHistoryCommand(feature)();
        expect(executeCommand).not.toHaveBeenCalled();
    });

    it("does nothing when the action picker is cancelled", async () => {
        const zip = await touchZip("daily_HOST_2026-06-01_12-00-00.zip");
        const feature = featureWithProfile();
        showQuickPick
            .mockResolvedValueOnce({ label: path.basename(zip), fsPath: zip })
            .mockResolvedValueOnce(undefined); // cancel action
        await createBackupHistoryCommand(feature)();
        expect(executeCommand).not.toHaveBeenCalled();
    });

    it("reports an error when deletion fails", async () => {
        const zip = await touchZip("daily_HOST_2026-06-01_12-00-00.zip");
        const feature = featureWithProfile();
        showQuickPick
            .mockResolvedValueOnce({ label: path.basename(zip), fsPath: "/nonexistent/locked.zip" })
            .mockResolvedValueOnce({ label: "Delete", value: "delete" });
        showWarningMessage.mockResolvedValueOnce("Delete");
        await createBackupHistoryCommand(feature)();
        expect(showErrorMessage).toHaveBeenCalledWith(expect.stringContaining("Failed to delete"));
    });
});

describe("createCreateBackupProfileCommand", () => {
    it("shows an error when there is no initialized workspace", async () => {
        const feature = makeFeature({ getWorkspaceRoot: vi.fn().mockReturnValue(null) });
        await createCreateBackupProfileCommand(feature, makeTelemetry())();
        expect(showErrorMessage).toHaveBeenCalledWith(
            expect.stringContaining("No initialized workspace found"),
        );
    });

    it("aborts when the user cancels the name prompt", async () => {
        const feature = makeFeature();
        showInputBox.mockResolvedValueOnce(undefined);
        await createCreateBackupProfileCommand(feature, makeTelemetry())();
        expect(feature.getConfigManager().upsertProfile).not.toHaveBeenCalled();
    });

    it("creates a profile through the full wizard and refreshes the feature", async () => {
        const upsertProfile = vi.fn().mockResolvedValue(undefined);
        const feature = makeFeature({
            getProfileNames: vi.fn().mockReturnValue([]),
            getConfigManager: vi.fn().mockReturnValue({ read: vi.fn(), upsertProfile }),
        });
        const telemetry = makeTelemetry();

        readDirectory.mockResolvedValue([
            ["Notes", 2 /* Directory */],
            ["readme.md", 1 /* File */],
        ]);

        showInputBox
            .mockResolvedValueOnce("daily") // name
            .mockResolvedValueOnce("**/node_modules/**") // exclude
            .mockResolvedValueOnce("18:00") // time
            .mockResolvedValueOnce("7"); // retention
        showQuickPick
            .mockResolvedValueOnce([{ relPath: "Notes/**", label: "Notes" }]) // sources
            .mockResolvedValueOnce([{ value: "mon", label: "Monday" }]); // days
        showOpenDialog.mockResolvedValueOnce([{ fsPath: "D:/Backups" }]);

        await createCreateBackupProfileCommand(feature, telemetry)();

        expect(upsertProfile).toHaveBeenCalledOnce();
        const [, name, profile] = upsertProfile.mock.calls[0]!;
        expect(name).toBe("daily");
        expect(profile.targetFolder).toBe("D:/Backups");
        expect(profile.exclude).toEqual(["**/node_modules/**"]);
        expect(profile.schedule).toEqual({ time: "18:00", days: ["mon"] });
        expect(profile.retention).toBe(7);
        expect(telemetry.logUsage).toHaveBeenCalledWith("backup/profileCreated", expect.any(Object));
        expect(feature.refresh).toHaveBeenCalledWith(ROOT, true);
    });

    it("defaults to the entire workspace when 'Entire workspace' is picked", async () => {
        const upsertProfile = vi.fn().mockResolvedValue(undefined);
        const feature = makeFeature({
            getProfileNames: vi.fn().mockReturnValue([]),
            getConfigManager: vi.fn().mockReturnValue({ read: vi.fn(), upsertProfile }),
        });
        readDirectory.mockResolvedValue([]);

        showInputBox
            .mockResolvedValueOnce("full") // name
            .mockResolvedValueOnce("") // exclude (none)
            .mockResolvedValueOnce("09:00") // time
            .mockResolvedValueOnce("3"); // retention
        showQuickPick
            .mockResolvedValueOnce([{ relPath: "", label: "Entire workspace" }]) // sources
            .mockResolvedValueOnce([{ value: "sun", label: "Sunday" }]); // days
        showOpenDialog.mockResolvedValueOnce([{ fsPath: "D:/Backups" }]);

        await createCreateBackupProfileCommand(feature, makeTelemetry())();

        const [, , profile] = upsertProfile.mock.calls[0]!;
        expect(profile.sources).toEqual(["**"]);
        expect(profile.exclude).toEqual([]);
    });

    it("aborts when the target folder dialog is cancelled", async () => {
        const upsertProfile = vi.fn();
        const feature = makeFeature({
            getProfileNames: vi.fn().mockReturnValue([]),
            getConfigManager: vi.fn().mockReturnValue({ read: vi.fn(), upsertProfile }),
        });
        readDirectory.mockResolvedValue([]);
        showInputBox
            .mockResolvedValueOnce("daily") // name
            .mockResolvedValueOnce(""); // exclude
        showQuickPick.mockResolvedValueOnce([{ relPath: "", label: "Entire workspace" }]); // sources
        showOpenDialog.mockResolvedValueOnce(undefined); // cancel target folder

        await createCreateBackupProfileCommand(feature, makeTelemetry())();
        expect(upsertProfile).not.toHaveBeenCalled();
    });

    it("aborts at each subsequent cancellation point", async () => {
        const upsertProfile = vi.fn();
        const feature = makeFeature({
            getProfileNames: vi.fn().mockReturnValue([]),
            getConfigManager: vi.fn().mockReturnValue({ read: vi.fn(), upsertProfile }),
        });
        readDirectory.mockResolvedValue([]);

        // Cancel the source picker.
        showInputBox.mockResolvedValueOnce("daily");
        showQuickPick.mockResolvedValueOnce(undefined);
        await createCreateBackupProfileCommand(feature, makeTelemetry())();
        expect(upsertProfile).not.toHaveBeenCalled();

        // Cancel the exclude prompt (undefined).
        vi.clearAllMocks();
        readDirectory.mockResolvedValue([]);
        showInputBox.mockResolvedValueOnce("daily").mockResolvedValueOnce(undefined);
        showQuickPick.mockResolvedValueOnce([{ relPath: "", label: "ws" }]);
        await createCreateBackupProfileCommand(feature, makeTelemetry())();
        expect(upsertProfile).not.toHaveBeenCalled();

        // Cancel the time prompt.
        vi.clearAllMocks();
        readDirectory.mockResolvedValue([]);
        showInputBox.mockResolvedValueOnce("daily").mockResolvedValueOnce("").mockResolvedValueOnce(undefined);
        showQuickPick.mockResolvedValueOnce([{ relPath: "", label: "ws" }]);
        showOpenDialog.mockResolvedValueOnce([{ fsPath: "D:/B" }]);
        await createCreateBackupProfileCommand(feature, makeTelemetry())();
        expect(upsertProfile).not.toHaveBeenCalled();

        // Cancel/empty the days picker.
        vi.clearAllMocks();
        readDirectory.mockResolvedValue([]);
        showInputBox.mockResolvedValueOnce("daily").mockResolvedValueOnce("").mockResolvedValueOnce("18:00");
        showQuickPick
            .mockResolvedValueOnce([{ relPath: "", label: "ws" }])
            .mockResolvedValueOnce([]); // no days selected
        showOpenDialog.mockResolvedValueOnce([{ fsPath: "D:/B" }]);
        await createCreateBackupProfileCommand(feature, makeTelemetry())();
        expect(upsertProfile).not.toHaveBeenCalled();

        // Cancel the retention prompt.
        vi.clearAllMocks();
        readDirectory.mockResolvedValue([]);
        showInputBox
            .mockResolvedValueOnce("daily")
            .mockResolvedValueOnce("")
            .mockResolvedValueOnce("18:00")
            .mockResolvedValueOnce(undefined);
        showQuickPick
            .mockResolvedValueOnce([{ relPath: "", label: "ws" }])
            .mockResolvedValueOnce([{ value: "mon", label: "Monday" }]);
        showOpenDialog.mockResolvedValueOnce([{ fsPath: "D:/B" }]);
        await createCreateBackupProfileCommand(feature, makeTelemetry())();
        expect(upsertProfile).not.toHaveBeenCalled();
    });

    it("validates the name, time and retention inputs", async () => {
        const feature = makeFeature({
            getProfileNames: vi.fn().mockReturnValue(["existing"]),
            getConfigManager: vi.fn().mockReturnValue({ read: vi.fn(), upsertProfile: vi.fn() }),
        });
        readDirectory.mockResolvedValue([]);
        showInputBox
            .mockResolvedValueOnce("daily")
            .mockResolvedValueOnce("")
            .mockResolvedValueOnce("18:00")
            .mockResolvedValueOnce("7");
        showQuickPick
            .mockResolvedValueOnce([{ relPath: "", label: "ws" }])
            .mockResolvedValueOnce([{ value: "mon", label: "Monday" }]);
        showOpenDialog.mockResolvedValueOnce([{ fsPath: "D:/B" }]);

        await createCreateBackupProfileCommand(feature, makeTelemetry())();

        const nameValidate = showInputBox.mock.calls[0]![0].validateInput;
        expect(nameValidate("")).toBe("Name cannot be empty");
        expect(nameValidate("bad name!")).toMatch(/letters/);
        expect(nameValidate("existing")).toMatch(/already exists/);
        expect(nameValidate("ok-name")).toBeUndefined();

        const timeValidate = showInputBox.mock.calls[2]![0].validateInput;
        expect(timeValidate("nope")).toMatch(/HH:MM/);
        expect(timeValidate("99:99")).toMatch(/Invalid time/);
        expect(timeValidate("18:30")).toBeUndefined();

        const retentionValidate = showInputBox.mock.calls[3]![0].validateInput;
        expect(retentionValidate("0")).toMatch(/positive integer/);
        expect(retentionValidate("abc")).toMatch(/positive integer/);
        expect(retentionValidate("5")).toBeUndefined();
    });

    it("enumerates nested workspace folders, skipping ignored and unreadable directories", async () => {
        const upsertProfile = vi.fn().mockResolvedValue(undefined);
        const feature = makeFeature({
            getProfileNames: vi.fn().mockReturnValue([]),
            getConfigManager: vi.fn().mockReturnValue({ read: vi.fn(), upsertProfile }),
        });
        // Root has a normal folder, an ignored folder, and a file.
        readDirectory.mockImplementation(async (uri: any) => {
            if (uri.path === "/workspace") {
                return [["Notes", 2], [".git", 2], ["node_modules", 2], ["readme.md", 1]];
            }
            if (uri.path === "/workspace/Notes") {
                return [["Sub", 2]];
            }
            throw new Error("unreadable");
        });

        showInputBox
            .mockResolvedValueOnce("daily")
            .mockResolvedValueOnce("")
            .mockResolvedValueOnce("18:00")
            .mockResolvedValueOnce("7");
        // Pick the nested "Notes/Sub" folder so a non-empty source path is produced.
        showQuickPick
            .mockResolvedValueOnce([{ relPath: "Notes/Sub", label: "Sub" }])
            .mockResolvedValueOnce([{ value: "mon", label: "Monday" }]);
        showOpenDialog.mockResolvedValueOnce([{ fsPath: "D:/B" }]);

        await createCreateBackupProfileCommand(feature, makeTelemetry())();

        // The source tree picker must have received Notes and Notes/Sub but not .git/node_modules.
        const treeItems = showQuickPick.mock.calls[0]![0] as Array<{ relPath: string }>;
        const relPaths = treeItems.map((i) => i.relPath);
        expect(relPaths).toContain("Notes");
        expect(relPaths).toContain("Notes/Sub");
        expect(relPaths).not.toContain(".git");
        expect(relPaths).not.toContain("node_modules");

        const [, , profile] = upsertProfile.mock.calls[0]!;
        expect(profile.sources).toEqual(["Notes/Sub/**"]);
    });
});
