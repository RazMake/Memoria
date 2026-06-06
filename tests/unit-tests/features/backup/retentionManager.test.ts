import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as path from "path";
import * as os from "os";
import * as fs from "fs";
import { enforceRetention } from "../../../../src/features/backup/retentionManager";
import { buildZipFileName } from "../../../../src/features/backup/zipCreator";

describe("enforceRetention", () => {
    let tmpDir: string;

    beforeEach(async () => {
        tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "memoria-test-"));
    });

    afterEach(async () => {
        await fs.promises.rm(tmpDir, { recursive: true, force: true });
    });

    async function createFakeZip(name: string): Promise<string> {
        const p = path.join(tmpDir, name);
        await fs.promises.writeFile(p, "fake zip content");
        return p;
    }

    it("does nothing when there are fewer zips than retention", async () => {
        await createFakeZip("myprofile_HOST_2026-06-01_12-00-00.zip");
        await createFakeZip("myprofile_HOST_2026-06-02_12-00-00.zip");

        const result = await enforceRetention(tmpDir, "myprofile", 5);

        expect(result.deleted).toHaveLength(0);
        expect(result.errors).toHaveLength(0);
        const remaining = await fs.promises.readdir(tmpDir);
        expect(remaining).toHaveLength(2);
    });

    it("deletes the oldest zip when count equals retention (to make room for new)", async () => {
        await createFakeZip("myprofile_HOST_2026-06-01_12-00-00.zip");
        await createFakeZip("myprofile_HOST_2026-06-02_12-00-00.zip");
        await createFakeZip("myprofile_HOST_2026-06-03_12-00-00.zip");

        // retention=3 means keep 2 + 1 new = 3 total, so delete oldest 1
        const result = await enforceRetention(tmpDir, "myprofile", 3);

        expect(result.deleted).toHaveLength(1);
        expect(path.basename(result.deleted[0]!)).toBe("myprofile_HOST_2026-06-01_12-00-00.zip");
        const remaining = await fs.promises.readdir(tmpDir);
        expect(remaining).toHaveLength(2);
    });

    it("deletes multiple old zips when significantly over retention", async () => {
        for (let i = 1; i <= 5; i++) {
            await createFakeZip(`myprofile_HOST_2026-06-0${i}_12-00-00.zip`);
        }

        // retention=3 means keep 2 + 1 new, delete 3
        const result = await enforceRetention(tmpDir, "myprofile", 3);

        expect(result.deleted).toHaveLength(3);
        const remaining = await fs.promises.readdir(tmpDir);
        expect(remaining).toHaveLength(2);
    });

    it("does not delete zips from other profiles", async () => {
        await createFakeZip("myprofile_HOST_2026-06-01_12-00-00.zip");
        await createFakeZip("other-profile_HOST_2026-06-01_12-00-00.zip");

        const result = await enforceRetention(tmpDir, "myprofile", 1);

        // retention=1 means: keep 0 existing + 1 new = 1 total → delete the 1 existing myprofile zip
        expect(result.deleted).toHaveLength(1);
        expect(path.basename(result.deleted[0]!)).toBe("myprofile_HOST_2026-06-01_12-00-00.zip");
        const remaining = await fs.promises.readdir(tmpDir);
        // only the other-profile zip remains
        expect(remaining).toHaveLength(1);
        expect(remaining[0]).toBe("other-profile_HOST_2026-06-01_12-00-00.zip");
    });

    it("returns empty result when target folder does not exist", async () => {
        const result = await enforceRetention(
            path.join(tmpDir, "nonexistent"),
            "myprofile",
            3,
        );
        expect(result.deleted).toHaveLength(0);
        expect(result.errors).toHaveLength(0);
    });
});

describe("buildZipFileName", () => {
    it("uses sanitized profile name and host", () => {
        const date = new Date(2026, 5, 6, 18, 0, 0);
        const name = buildZipFileName("daily notes", "DESKTOP-ABC", date);
        expect(name).toBe("daily-notes_DESKTOP-ABC_2026-06-06_18-00-00.zip");
    });

    it("pads date and time components with leading zeros", () => {
        const date = new Date(2026, 0, 5, 9, 5, 3); // Jan 5, 09:05:03
        const name = buildZipFileName("backup", "HOST", date);
        expect(name).toBe("backup_HOST_2026-01-05_09-05-03.zip");
    });
});
