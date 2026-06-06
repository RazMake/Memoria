import { describe, it, expect, vi, beforeEach } from "vitest";
import { BackupConfigManager } from "../../../../src/features/backup/backupConfigManager";
import type { BackupConfig } from "../../../../src/features/backup/types";

vi.mock("vscode", () => ({
    Uri: {
        joinPath: (base: any, ...segments: string[]) => ({
            ...base,
            path: [base.path, ...segments].join("/"),
            toString: () => [base.path, ...segments].join("/"),
        }),
    },
}));

const ROOT = { path: "/workspace", toString: () => "/workspace" } as any;

function makeFs(config?: BackupConfig) {
    const serialized = config ? new TextEncoder().encode(JSON.stringify(config)) : null;
    return {
        readFile: vi.fn().mockImplementation(() => {
            if (serialized) return Promise.resolve(serialized);
            return Promise.reject(new Error("ENOENT"));
        }),
        writeFile: vi.fn().mockResolvedValue(undefined),
        createDirectory: vi.fn().mockResolvedValue(undefined),
    } as any;
}

describe("BackupConfigManager.read", () => {
    it("returns null when config file does not exist", async () => {
        const mgr = new BackupConfigManager(makeFs());
        const result = await mgr.read(ROOT);
        expect(result).toBeNull();
    });

    it("parses a valid config", async () => {
        const config: BackupConfig = {
            profiles: {
                "daily": {
                    sources: ["Notes/**"],
                    exclude: [],
                    targetFolder: "D:\\Backups",
                    schedule: { time: "18:00", days: ["mon"] },
                    retention: 7,
                },
            },
            _state: {},
        };
        const mgr = new BackupConfigManager(makeFs(config));
        const result = await mgr.read(ROOT);
        expect(result).not.toBeNull();
        expect(result!.profiles["daily"]).toBeDefined();
    });

    it("returns empty config for malformed JSON", async () => {
        const mockFs = {
            readFile: vi.fn().mockResolvedValue(new TextEncoder().encode("{ invalid json")),
        } as any;
        const mgr = new BackupConfigManager(mockFs);
        const result = await mgr.read(ROOT);
        expect(result).toBeNull();
    });
});

describe("BackupConfigManager.write", () => {
    it("writes JSON to the expected path", async () => {
        const config: BackupConfig = { profiles: {}, _state: {} };
        const mockFs = makeFs();
        const mgr = new BackupConfigManager(mockFs);
        await mgr.write(ROOT, config);
        expect(mockFs.writeFile).toHaveBeenCalledOnce();
        const callArgs = mockFs.writeFile.mock.calls[0]!;
        const written = new TextDecoder().decode(callArgs[1] as Uint8Array);
        expect(JSON.parse(written)).toEqual(config);
    });
});

describe("BackupConfigManager.upsertProfile", () => {
    it("creates a new config file when none exists", async () => {
        const mockFs = makeFs(); // readFile rejects → no existing config
        const mgr = new BackupConfigManager(mockFs);
        await mgr.upsertProfile(ROOT, "test", {
            sources: ["Notes/"],
            exclude: [],
            targetFolder: "D:\\Backups",
            schedule: { time: "09:00", days: ["sat"] },
            retention: 3,
        });
        expect(mockFs.writeFile).toHaveBeenCalledOnce();
        const written = JSON.parse(
            new TextDecoder().decode(mockFs.writeFile.mock.calls[0]![1] as Uint8Array)
        ) as BackupConfig;
        expect(written.profiles["test"]).toBeDefined();
    });
});
