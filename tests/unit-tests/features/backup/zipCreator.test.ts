import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as path from "path";
import * as os from "os";
import * as fs from "fs";
import {
    createZip,
    buildZipFileName,
    ensureDir,
    listProfileZips,
    type ZipEntry,
} from "../../../../src/features/backup/zipCreator";

describe("zipCreator", () => {
    let tmpDir: string;

    beforeEach(async () => {
        tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "memoria-zip-test-"));
    });

    afterEach(async () => {
        await fs.promises.rm(tmpDir, { recursive: true, force: true });
    });

    describe("createZip", () => {
        it("writes a non-empty zip and returns its size", async () => {
            const entries: ZipEntry[] = [
                { content: Buffer.from("hello world"), relativePath: "Notes/a.md" },
                { content: Buffer.from("second file"), relativePath: "Notes/sub/b.md" },
            ];
            const outputPath = path.join(tmpDir, "out.zip");

            const size = await createZip(entries, outputPath);

            expect(size).toBeGreaterThan(0);
            const stat = await fs.promises.stat(outputPath);
            expect(stat.size).toBe(size);
        });

        it("creates an empty but valid zip when there are no entries", async () => {
            const outputPath = path.join(tmpDir, "empty.zip");
            const size = await createZip([], outputPath);
            expect(size).toBeGreaterThanOrEqual(0);
            expect(fs.existsSync(outputPath)).toBe(true);
        });

        it("rejects when the output directory does not exist", async () => {
            const outputPath = path.join(tmpDir, "missing-dir", "out.zip");
            await expect(
                createZip([{ content: Buffer.from("x"), relativePath: "x.md" }], outputPath),
            ).rejects.toBeDefined();
        });
    });

    describe("buildZipFileName", () => {
        it("builds the expected name from profile, host, and date", () => {
            const date = new Date(2026, 5, 7, 9, 5, 3); // 2026-06-07 09:05:03
            expect(buildZipFileName("daily", "MYHOST", date)).toBe(
                "daily_MYHOST_2026-06-07_09-05-03.zip",
            );
        });

        it("sanitizes unsafe characters in profile name and host", () => {
            const date = new Date(2026, 0, 1, 0, 0, 0);
            const name = buildZipFileName("my profile!", "host:name", date);
            expect(name).toBe("my-profile-_host-name_2026-01-01_00-00-00.zip");
        });
    });

    describe("ensureDir", () => {
        it("creates a nested directory tree", async () => {
            const nested = path.join(tmpDir, "a", "b", "c");
            await ensureDir(nested);
            const stat = await fs.promises.stat(nested);
            expect(stat.isDirectory()).toBe(true);
        });

        it("is a no-op when the directory already exists", async () => {
            await ensureDir(tmpDir);
            const stat = await fs.promises.stat(tmpDir);
            expect(stat.isDirectory()).toBe(true);
        });
    });

    describe("listProfileZips", () => {
        async function touch(name: string): Promise<void> {
            await fs.promises.writeFile(path.join(tmpDir, name), "zip");
        }

        it("returns matching zips sorted oldest-first", async () => {
            await touch("daily_HOST_2026-06-03_12-00-00.zip");
            await touch("daily_HOST_2026-06-01_12-00-00.zip");
            await touch("daily_HOST_2026-06-02_12-00-00.zip");

            const result = await listProfileZips(tmpDir, "daily");

            expect(result.map((p) => path.basename(p))).toEqual([
                "daily_HOST_2026-06-01_12-00-00.zip",
                "daily_HOST_2026-06-02_12-00-00.zip",
                "daily_HOST_2026-06-03_12-00-00.zip",
            ]);
        });

        it("ignores non-matching files and other profiles", async () => {
            await touch("daily_HOST_2026-06-01_12-00-00.zip");
            await touch("weekly_HOST_2026-06-01_12-00-00.zip");
            await touch("daily_notes.txt");

            const result = await listProfileZips(tmpDir, "daily");

            expect(result.map((p) => path.basename(p))).toEqual([
                "daily_HOST_2026-06-01_12-00-00.zip",
            ]);
        });

        it("matches the sanitized profile prefix", async () => {
            await touch("my-profile-_HOST_2026-06-01_12-00-00.zip");
            const result = await listProfileZips(tmpDir, "my profile!");
            expect(result).toHaveLength(1);
        });

        it("returns an empty array for a non-existent folder", async () => {
            const result = await listProfileZips(path.join(tmpDir, "nope"), "daily");
            expect(result).toEqual([]);
        });
    });
});
