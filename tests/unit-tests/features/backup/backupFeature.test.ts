import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as path from "path";
import * as os from "os";
import * as fs from "fs";
import type { BackupConfig, BackupProfile } from "../../../../src/features/backup/types";

// --- vscode mock ---------------------------------------------------------
const executeCommand = vi.fn().mockResolvedValue(undefined);
const showInformationMessage = vi.fn().mockResolvedValue(undefined);
const showErrorMessage = vi.fn().mockResolvedValue(undefined);
const findFiles = vi.fn().mockResolvedValue([]);
const asRelativePath = vi.fn((uri: any) => String(uri?.toString?.() ?? uri));
const readFile = vi.fn().mockResolvedValue(new Uint8Array());
const getConfiguration = vi.fn(() => ({ get: (_k: string, def: unknown) => def }));
const statusBarItem = {
    text: "",
    tooltip: undefined as unknown,
    backgroundColor: undefined as unknown,
    name: "",
    show: vi.fn(),
    hide: vi.fn(),
    dispose: vi.fn(),
};
const outputChannelMock = { appendLine: vi.fn(), show: vi.fn(), dispose: vi.fn() };
const progressState = vi.hoisted(() => ({ cancel: false }));
const watcherState = vi.hoisted(() => ({ onChange: undefined as any, onCreate: undefined as any }));

vi.mock("vscode", () => ({
    commands: { executeCommand: (...a: any[]) => executeCommand(...a) },
    window: {
        createStatusBarItem: () => statusBarItem,
        createOutputChannel: () => outputChannelMock,
        showInformationMessage: (...a: any[]) => showInformationMessage(...a),
        showErrorMessage: (...a: any[]) => showErrorMessage(...a),
        withProgress: (_opts: any, cb: any) =>
            cb({ report: vi.fn() }, { isCancellationRequested: progressState.cancel }),
    },
    workspace: {
        findFiles: (...a: any[]) => findFiles(...a),
        asRelativePath: (...a: any[]) => asRelativePath(...a),
        getConfiguration: (...a: any[]) => getConfiguration(...a),
        createFileSystemWatcher: () => ({
            onDidChange: (cb: any) => { watcherState.onChange = cb; return { dispose: vi.fn() }; },
            onDidCreate: (cb: any) => { watcherState.onCreate = cb; return { dispose: vi.fn() }; },
            onDidDelete: vi.fn(),
            dispose: vi.fn(),
        }),
        fs: { readFile: (...a: any[]) => readFile(...a) },
    },
    StatusBarAlignment: { Left: 1, Right: 2 },
    ProgressLocation: { Notification: 15 },
    ThemeColor: class {
        constructor(public id: string) {}
    },
    RelativePattern: class {
        constructor(public base: any, public pattern: string) {}
    },
}));

import { BackupFeature } from "../../../../src/features/backup/backupFeature";

const ROOT = { fsPath: "/workspace", toString: () => "file:///workspace" } as any;

function makeTelemetry(): any {
    return { logUsage: vi.fn(), logError: vi.fn(), dispose: vi.fn() };
}

function makeProfile(targetFolder: string, overrides: Partial<BackupProfile> = {}): BackupProfile {
    return {
        sources: ["Notes/**"],
        exclude: [],
        targetFolder,
        // Schedule far enough out that no timer fires during the test.
        schedule: { time: "23:59", days: ["mon"] },
        retention: 5,
        ...overrides,
    };
}

function makeConfigManager(config: BackupConfig | null) {
    return {
        read: vi.fn().mockResolvedValue(config),
        updateState: vi.fn().mockResolvedValue(undefined),
    } as any;
}

describe("BackupFeature", () => {
    let tmpDir: string;

    beforeEach(async () => {
        tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "memoria-feature-test-"));
        progressState.cancel = false;
        watcherState.onChange = undefined;
        watcherState.onCreate = undefined;
        executeCommand.mockClear();
        showInformationMessage.mockClear();
        showErrorMessage.mockClear();
        findFiles.mockReset().mockResolvedValue([]);
        readFile.mockReset().mockResolvedValue(new Uint8Array());
        getConfiguration.mockReset().mockReturnValue({ get: (_k: string, def: unknown) => def });
        outputChannelMock.show.mockClear();
        statusBarItem.show.mockClear();
        statusBarItem.hide.mockClear();
    });

    afterEach(async () => {
        await fs.promises.rm(tmpDir, { recursive: true, force: true });
    });

    it("refresh(null, false) marks backup inactive and hides the status bar", async () => {
        const feature = new BackupFeature(makeTelemetry(), makeConfigManager(null), outputChannelMock as any);
        await feature.refresh(null, false);
        expect(executeCommand).toHaveBeenCalledWith("setContext", "memoria.backupActive", false);
        expect(statusBarItem.hide).toHaveBeenCalled();
        feature.dispose();
    });

    it("refresh marks inactive when no config exists", async () => {
        const feature = new BackupFeature(makeTelemetry(), makeConfigManager(null), outputChannelMock as any);
        await feature.refresh(ROOT, true);
        expect(executeCommand).toHaveBeenCalledWith("setContext", "memoria.backupActive", false);
        feature.dispose();
    });

    it("refresh marks inactive when config has zero profiles", async () => {
        const cfg: BackupConfig = { profiles: {}, _state: {} };
        const feature = new BackupFeature(makeTelemetry(), makeConfigManager(cfg), outputChannelMock as any);
        await feature.refresh(ROOT, true);
        expect(executeCommand).toHaveBeenCalledWith("setContext", "memoria.backupActive", false);
        feature.dispose();
    });

    it("refresh activates and shows the status bar when profiles exist", async () => {
        const cfg: BackupConfig = {
            profiles: { daily: makeProfile(tmpDir) },
            _state: {},
        };
        const feature = new BackupFeature(makeTelemetry(), makeConfigManager(cfg), outputChannelMock as any);
        await feature.refresh(ROOT, true);
        expect(executeCommand).toHaveBeenCalledWith("setContext", "memoria.backupActive", true);
        expect(statusBarItem.show).toHaveBeenCalled();
        expect(feature.getProfileNames()).toEqual(["daily"]);
        expect(feature.getWorkspaceRoot()).toBe(ROOT);
        feature.dispose();
    });

    it("runProfile shows an error when there is no initialized workspace", async () => {
        const feature = new BackupFeature(makeTelemetry(), makeConfigManager(null), outputChannelMock as any);
        await feature.runProfile("daily");
        expect(showErrorMessage).toHaveBeenCalledWith(
            "Memoria: No initialized workspace found.",
        );
        feature.dispose();
    });

    it("runProfile shows an error when the config cannot be read", async () => {
        const cfg: BackupConfig = { profiles: { daily: makeProfile(tmpDir) }, _state: {} };
        const mgr = makeConfigManager(cfg);
        const feature = new BackupFeature(makeTelemetry(), mgr, outputChannelMock as any);
        await feature.refresh(ROOT, true);
        // Now make subsequent reads return null.
        mgr.read.mockResolvedValue(null);
        await feature.runProfile("daily");
        expect(showErrorMessage).toHaveBeenCalledWith(
            expect.stringContaining("Backup config not found"),
        );
        feature.dispose();
    });

    it("runProfile shows an error when the profile name is unknown", async () => {
        const cfg: BackupConfig = { profiles: { daily: makeProfile(tmpDir) }, _state: {} };
        const feature = new BackupFeature(makeTelemetry(), makeConfigManager(cfg), outputChannelMock as any);
        await feature.refresh(ROOT, true);
        await feature.runProfile("missing");
        expect(showErrorMessage).toHaveBeenCalledWith(
            "Memoria: Profile 'missing' not found.",
        );
        feature.dispose();
    });

    it("runProfile executes a backup and reports completion on success", async () => {
        const uri = { fsPath: "/workspace/Notes/a.md", toString: () => "file:///workspace/Notes/a.md" };
        findFiles.mockResolvedValue([uri]);
        asRelativePath.mockImplementation(() => "Notes/a.md");
        readFile.mockResolvedValue(new TextEncoder().encode("content"));

        const cfg: BackupConfig = { profiles: { daily: makeProfile(tmpDir) }, _state: {} };
        const mgr = makeConfigManager(cfg);
        const telemetry = makeTelemetry();
        const feature = new BackupFeature(telemetry, mgr, outputChannelMock as any);
        await feature.refresh(ROOT, true);

        await feature.runProfile("daily");

        expect(mgr.updateState).toHaveBeenCalled();
        expect(showInformationMessage).toHaveBeenCalledWith(
            expect.stringContaining("completed"),
        );
        expect(telemetry.logUsage).toHaveBeenCalledWith("backup/executed", expect.any(Object));
        const written = await fs.promises.readdir(tmpDir);
        expect(written.some((f) => f.endsWith(".zip"))).toBe(true);
        feature.dispose();
    });

    it("runProfile reports a skip when nothing changed", async () => {
        const uri = { fsPath: "/workspace/Notes/a.md", toString: () => "file:///workspace/Notes/a.md" };
        findFiles.mockResolvedValue([uri]);
        asRelativePath.mockImplementation(() => "Notes/a.md");
        const bytes = new TextEncoder().encode("content");
        readFile.mockResolvedValue(bytes);

        // Pre-seed the hash so the file is unchanged. Compute SHA-256 the same way the source does.
        const crypto = await import("crypto");
        const hash = crypto.createHash("sha256").update(bytes).digest("hex");
        const cfg: BackupConfig = {
            profiles: { daily: makeProfile(tmpDir) },
            _state: { daily: { lastBackupTime: null, hashes: { "Notes/a.md": hash } } },
        };
        const feature = new BackupFeature(makeTelemetry(), makeConfigManager(cfg), outputChannelMock as any);
        await feature.refresh(ROOT, true);

        await feature.runProfile("daily");

        expect(showInformationMessage).toHaveBeenCalledWith(
            expect.stringContaining("skipped"),
        );
        feature.dispose();
    });

    it("dispose stops timers and disposes the status bar", () => {
        const feature = new BackupFeature(makeTelemetry(), makeConfigManager(null), outputChannelMock as any);
        feature.dispose();
        expect(statusBarItem.dispose).toHaveBeenCalled();
    });

    it("reports a failure and offers to show output when the backup fails", async () => {
        const uri = { fsPath: "/workspace/Notes/a.md", toString: () => "file:///workspace/Notes/a.md" };
        findFiles.mockResolvedValue([uri]);
        asRelativePath.mockImplementation(() => "Notes/a.md");
        readFile.mockResolvedValue(new TextEncoder().encode("content"));
        progressState.cancel = true; // forces executeBackup to return a 'failed' (Cancelled) status
        showErrorMessage.mockResolvedValueOnce("Show Output");

        const telemetry = makeTelemetry();
        const cfg: BackupConfig = { profiles: { daily: makeProfile(tmpDir) }, _state: {} };
        const feature = new BackupFeature(telemetry, makeConfigManager(cfg), outputChannelMock as any);
        await feature.refresh(ROOT, true);

        await feature.runProfile("daily");

        expect(showErrorMessage).toHaveBeenCalledWith(
            expect.stringContaining("failed"),
            "Show Output",
        );
        expect(outputChannelMock.show).toHaveBeenCalled();
        expect(telemetry.logUsage).toHaveBeenCalledWith("backup/failed", expect.any(Object));
    });

    it("runs a catch-up backup on start when the setting is enabled", async () => {
        getConfiguration.mockReturnValue({
            get: (key: string, def: unknown) => (key === "catchUpOnStart" ? true : def),
        });
        findFiles.mockResolvedValue([]); // no files → catch-up run resolves as 'skipped'

        const telemetry = makeTelemetry();
        const everyDay: BackupProfile = makeProfile(tmpDir, {
            schedule: { time: "00:00", days: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] },
        });
        const cfg: BackupConfig = { profiles: { daily: everyDay }, _state: {} };
        const feature = new BackupFeature(telemetry, makeConfigManager(cfg), outputChannelMock as any);

        await feature.refresh(ROOT, true);
        // Allow the fire-and-forget catch-up to settle.
        await new Promise((r) => setTimeout(r, 0));

        expect(telemetry.logUsage).toHaveBeenCalledWith(
            "backup/catchUpTriggered",
            expect.any(Object),
        );
        feature.dispose();
    });

    it("completes a successful backup, persists state and reports it", async () => {
        const uri = { fsPath: "/workspace/Notes/a.md", toString: () => "file:///workspace/Notes/a.md" };
        findFiles.mockResolvedValue([uri]);
        asRelativePath.mockImplementation(() => "Notes/a.md");
        readFile.mockResolvedValue(new TextEncoder().encode("hello world"));

        const telemetry = makeTelemetry();
        const cfg: BackupConfig = { profiles: { daily: makeProfile(tmpDir) }, _state: {} };
        const configManager = makeConfigManager(cfg);
        const feature = new BackupFeature(telemetry, configManager, outputChannelMock as any);
        await feature.refresh(ROOT, true);

        await feature.runProfile("daily");

        expect(configManager.updateState).toHaveBeenCalledWith(ROOT, "daily", expect.any(Object));
        expect(showInformationMessage).toHaveBeenCalledWith(expect.stringContaining("completed"));
        expect(telemetry.logUsage).toHaveBeenCalledWith("backup/executed", expect.any(Object));
        feature.dispose();
    });

    it("reloads and reschedules when the config file changes", async () => {
        const cfg: BackupConfig = { profiles: { daily: makeProfile(tmpDir) }, _state: {} };
        const configManager = makeConfigManager(cfg);
        const feature = new BackupFeature(makeTelemetry(), configManager, outputChannelMock as any);
        await feature.refresh(ROOT, true);

        expect(watcherState.onChange).toBeTypeOf("function");
        configManager.read.mockClear();
        await watcherState.onChange(ROOT);

        // reload() re-reads the config to reschedule.
        expect(configManager.read).toHaveBeenCalled();
        feature.dispose();
    });

    it("overwrites a stale lockfile whose owning process no longer exists", async () => {
        // Pre-seed a lockfile with a PID that is virtually guaranteed not to exist.
        await fs.promises.writeFile(path.join(tmpDir, ".memoria-backup.lock"), "2147483646", "utf8");
        findFiles.mockResolvedValue([]);

        const telemetry = makeTelemetry();
        const cfg: BackupConfig = { profiles: { daily: makeProfile(tmpDir) }, _state: {} };
        const feature = new BackupFeature(telemetry, makeConfigManager(cfg), outputChannelMock as any);
        await feature.refresh(ROOT, true);

        await feature.runProfile("daily");

        // The stale lock was reclaimed, so the backup ran (and was skipped — no files).
        expect(showInformationMessage).toHaveBeenCalledWith(expect.stringContaining("skipped"));
        feature.dispose();
    });
});
