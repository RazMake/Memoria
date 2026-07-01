import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as path from "path";
import * as os from "os";
import * as fs from "fs";

// --- vscode mock ---------------------------------------------------------
// The executor calls vscode.workspace.findFiles / asRelativePath and constructs
// RelativePattern. Source-file reads go through the injectable `fs` option, while
// zip writing / retention use real Node fs against a temp targetFolder.

const findFiles = vi.fn();
const asRelativePath = vi.fn();

vi.mock("vscode", () => ({
    workspace: {
        findFiles: (...args: any[]) => findFiles(...args),
        asRelativePath: (...args: any[]) => asRelativePath(...args),
    },
    RelativePattern: class {
        constructor(public base: any, public pattern: string) {}
    },
}));

import { executeBackup } from "../../../../src/features/backup/backupExecutor";
import type { BackupProfile, BackupProfileState } from "../../../../src/features/backup/types";

interface FakeUri {
    fsPath: string;
    toString: () => string;
}

function makeUri(rel: string): FakeUri {
    return {
        fsPath: `/workspace/${rel}`,
        toString: () => `file:///workspace/${rel}`,
    };
}

function makeChannel(): any {
    return { appendLine: vi.fn() };
}

const WORKSPACE_ROOT = { fsPath: "/workspace", toString: () => "file:///workspace" } as any;

describe("executeBackup", () => {
    let tmpDir: string;
    let contents: Map<string, Uint8Array>;

    beforeEach(async () => {
        tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "memoria-exec-test-"));
        contents = new Map();
        findFiles.mockReset();
        asRelativePath.mockReset();
        // Map each uri to its workspace-relative path (strip the "file:///workspace/" prefix).
        asRelativePath.mockImplementation((uri: FakeUri) =>
            uri.toString().replace("file:///workspace/", ""),
        );
    });

    afterEach(async () => {
        await fs.promises.rm(tmpDir, { recursive: true, force: true });
    });

    function injectedFs(): any {
        return {
            readFile: vi.fn().mockImplementation((uri: FakeUri) => {
                const data = contents.get(uri.toString());
                if (!data) return Promise.reject(new Error("ENOENT"));
                return Promise.resolve(data);
            }),
        };
    }

    function profile(overrides: Partial<BackupProfile> = {}): BackupProfile {
        return {
            sources: ["Notes/**"],
            exclude: [],
            targetFolder: tmpDir,
            schedule: { time: "18:00", days: ["mon"] },
            retention: 5,
            ...overrides,
        };
    }

    function emptyState(): BackupProfileState {
        return { lastBackupTime: null, hashes: {} };
    }

    it("creates a zip and returns success with a new hash manifest", async () => {
        const uriA = makeUri("Notes/a.md");
        const uriB = makeUri("Notes/b.md");
        contents.set(uriA.toString(), new TextEncoder().encode("alpha"));
        contents.set(uriB.toString(), new TextEncoder().encode("beta"));
        findFiles.mockResolvedValue([uriA, uriB]);

        const result = await executeBackup({
            workspaceRoot: WORKSPACE_ROOT,
            profileName: "daily",
            profile: profile(),
            state: emptyState(),
            outputChannel: makeChannel(),
            fs: injectedFs(),
            now: () => new Date(2026, 5, 7, 9, 0, 0),
        });

        expect(result.kind).toBe("success");
        if (result.kind !== "success") throw new Error("expected success");
        expect(result.fileCount).toBe(2);
        expect(result.sizeBytes).toBeGreaterThan(0);
        expect(Object.keys(result.newState.hashes)).toEqual(["Notes/a.md", "Notes/b.md"]);
        expect(result.newState.lastBackupTime).toBe(new Date(2026, 5, 7, 9, 0, 0).toISOString());

        const written = await fs.promises.readdir(tmpDir);
        expect(written.some((f) => f.startsWith("daily_") && f.endsWith(".zip"))).toBe(true);
    });

    it("skips when no files have changed since the last backup", async () => {
        const uriA = makeUri("Notes/a.md");
        const bytes = new TextEncoder().encode("alpha");
        contents.set(uriA.toString(), bytes);
        findFiles.mockResolvedValue([uriA]);

        // First run to learn the hash.
        const first = await executeBackup({
            workspaceRoot: WORKSPACE_ROOT,
            profileName: "daily",
            profile: profile(),
            state: emptyState(),
            outputChannel: makeChannel(),
            fs: injectedFs(),
        });
        expect(first.kind).toBe("success");
        if (first.kind !== "success") throw new Error("expected success");

        // Second run with the prior hashes and unchanged content → skipped.
        const second = await executeBackup({
            workspaceRoot: WORKSPACE_ROOT,
            profileName: "daily",
            profile: profile(),
            state: first.newState,
            outputChannel: makeChannel(),
            fs: injectedFs(),
        });

        expect(second.kind).toBe("skipped");
    });

    it("reports progress for each changed file", async () => {
        const uriA = makeUri("Notes/a.md");
        const uriB = makeUri("Notes/b.md");
        contents.set(uriA.toString(), new TextEncoder().encode("a"));
        contents.set(uriB.toString(), new TextEncoder().encode("b"));
        findFiles.mockResolvedValue([uriA, uriB]);

        const onProgress = vi.fn();
        await executeBackup({
            workspaceRoot: WORKSPACE_ROOT,
            profileName: "daily",
            profile: profile(),
            state: emptyState(),
            outputChannel: makeChannel(),
            fs: injectedFs(),
            onProgress,
        });

        expect(onProgress).toHaveBeenCalledWith(1, 2);
        expect(onProgress).toHaveBeenCalledWith(2, 2);
    });

    it("returns failed with reason 'Cancelled' when the token is already cancelled", async () => {
        findFiles.mockResolvedValue([makeUri("Notes/a.md")]);
        contents.set(makeUri("Notes/a.md").toString(), new TextEncoder().encode("a"));

        const result = await executeBackup({
            workspaceRoot: WORKSPACE_ROOT,
            profileName: "daily",
            profile: profile(),
            state: emptyState(),
            outputChannel: makeChannel(),
            fs: injectedFs(),
            token: { isCancellationRequested: true, onCancellationRequested: vi.fn() } as any,
        });

        expect(result.kind).toBe("failed");
        if (result.kind !== "failed") throw new Error("expected failed");
        expect(result.reason).toBe("Cancelled");
    });

    it("skips files that cannot be read and skips the backup when none are readable", async () => {
        const uriA = makeUri("Notes/a.md");
        // findChangedFiles uses computeFileHash which returns null on unreadable files,
        // so an unreadable file never becomes "changed" → no entries → skipped.
        findFiles.mockResolvedValue([uriA]);
        // contents map is empty → readFile rejects.

        const result = await executeBackup({
            workspaceRoot: WORKSPACE_ROOT,
            profileName: "daily",
            profile: profile(),
            state: emptyState(),
            outputChannel: makeChannel(),
            fs: injectedFs(),
        });

        expect(result.kind).toBe("skipped");
    });

    it("fails when the target folder cannot be created", async () => {
        const uriA = makeUri("Notes/a.md");
        contents.set(uriA.toString(), new TextEncoder().encode("alpha"));
        findFiles.mockResolvedValue([uriA]);

        // Point the target folder at a path *under an existing file* so mkdir fails.
        const blocker = path.join(tmpDir, "blocker");
        await fs.promises.writeFile(blocker, "i am a file");
        const badTarget = path.join(blocker, "nested");

        const result = await executeBackup({
            workspaceRoot: WORKSPACE_ROOT,
            profileName: "daily",
            profile: profile({ targetFolder: badTarget }),
            state: emptyState(),
            outputChannel: makeChannel(),
            fs: injectedFs(),
        });

        expect(result.kind).toBe("failed");
        if (result.kind !== "failed") throw new Error("expected failed");
        expect(result.reason).toContain("Cannot create target folder");
    });

    it("fails with 'Cancelled' when the token flips during the read loop", async () => {
        const uriA = makeUri("Notes/a.md");
        const uriB = makeUri("Notes/b.md");
        contents.set(uriA.toString(), new TextEncoder().encode("a"));
        contents.set(uriB.toString(), new TextEncoder().encode("b"));
        findFiles.mockResolvedValue([uriA, uriB]);

        let calls = 0;
        const token = {
            // false during scan/hash, then true once the read loop starts.
            get isCancellationRequested() {
                calls++;
                return calls > 3;
            },
            onCancellationRequested: vi.fn(),
        } as any;

        const result = await executeBackup({
            workspaceRoot: WORKSPACE_ROOT,
            profileName: "daily",
            profile: profile(),
            state: emptyState(),
            outputChannel: makeChannel(),
            fs: injectedFs(),
            token,
        });

        expect(result.kind).toBe("failed");
        if (result.kind !== "failed") throw new Error("expected failed");
        expect(result.reason).toBe("Cancelled");
    });

    it("excludes files already pushed to the remote and drops their hashes", async () => {
        const uriPushed = makeUri("Notes/pushed.md");
        const uriDirty = makeUri("Notes/dirty.md");
        contents.set(uriPushed.toString(), new TextEncoder().encode("pushed"));
        contents.set(uriDirty.toString(), new TextEncoder().encode("dirty"));
        findFiles.mockResolvedValue([uriPushed, uriDirty]);

        const remoteFilter = {
            isRepo: true,
            hasUpstream: true,
            isPushedToRemote: (fsPath: string) => fsPath.endsWith("pushed.md"),
        };

        const result = await executeBackup({
            workspaceRoot: WORKSPACE_ROOT,
            profileName: "daily",
            profile: profile(),
            state: emptyState(),
            outputChannel: makeChannel(),
            fs: injectedFs(),
            remoteFilter,
            now: () => new Date(2026, 5, 7, 9, 0, 0),
        });

        expect(result.kind).toBe("success");
        if (result.kind !== "success") throw new Error("expected success");
        // Only the dirty file is backed up; the pushed file is excluded.
        expect(result.fileCount).toBe(1);
        expect(Object.keys(result.newState.hashes)).toEqual(["Notes/dirty.md"]);
    });

    it("drops hashes and skips (without a zip) when a tracked file becomes pushed", async () => {
        const uriA = makeUri("Notes/a.md");
        contents.set(uriA.toString(), new TextEncoder().encode("alpha"));
        findFiles.mockResolvedValue([uriA]);

        // Prior state recorded a hash for a.md while it was still dirty.
        const priorState: BackupProfileState = {
            lastBackupTime: "2026-06-06T00:00:00.000Z",
            hashes: { "Notes/a.md": "0000" },
        };

        // Now the file is confirmed pushed to the remote.
        const remoteFilter = {
            isRepo: true,
            hasUpstream: true,
            isPushedToRemote: () => true,
        };

        const result = await executeBackup({
            workspaceRoot: WORKSPACE_ROOT,
            profileName: "daily",
            profile: profile(),
            state: priorState,
            outputChannel: makeChannel(),
            fs: injectedFs(),
            remoteFilter,
        });

        expect(result.kind).toBe("skipped");
        if (result.kind !== "skipped") throw new Error("expected skipped");
        // The hash for the now-pushed file is dropped, but lastBackupTime is preserved.
        expect(result.newState).toBeDefined();
        expect(result.newState!.hashes).toEqual({});
        expect(result.newState!.lastBackupTime).toBe("2026-06-06T00:00:00.000Z");

        // No zip file should have been written.
        const written = await fs.promises.readdir(tmpDir);
        expect(written.some((f) => f.endsWith(".zip"))).toBe(false);
    });

    it("skips without a state update when nothing changed and nothing became pushed", async () => {
        const uriA = makeUri("Notes/a.md");
        contents.set(uriA.toString(), new TextEncoder().encode("alpha"));
        findFiles.mockResolvedValue([uriA]);

        const first = await executeBackup({
            workspaceRoot: WORKSPACE_ROOT,
            profileName: "daily",
            profile: profile(),
            state: emptyState(),
            outputChannel: makeChannel(),
            fs: injectedFs(),
        });
        expect(first.kind).toBe("success");
        if (first.kind !== "success") throw new Error("expected success");

        const second = await executeBackup({
            workspaceRoot: WORKSPACE_ROOT,
            profileName: "daily",
            profile: profile(),
            state: first.newState,
            outputChannel: makeChannel(),
            fs: injectedFs(),
        });

        expect(second.kind).toBe("skipped");
        if (second.kind !== "skipped") throw new Error("expected skipped");
        // No pushed files and no changes → no state to persist.
        expect(second.newState).toBeUndefined();
    });
});
