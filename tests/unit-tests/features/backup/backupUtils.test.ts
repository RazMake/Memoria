import { describe, it, expect } from "vitest";
import { formatSize } from "../../../../src/features/backup/backupUtils";

describe("formatSize", () => {
    it("formats bytes below 1 KB as plain bytes", () => {
        expect(formatSize(0)).toBe("0 B");
        expect(formatSize(512)).toBe("512 B");
        expect(formatSize(1023)).toBe("1023 B");
    });

    it("formats values at or above 1 KB as KB with one decimal", () => {
        expect(formatSize(1024)).toBe("1.0 KB");
        expect(formatSize(1536)).toBe("1.5 KB");
        expect(formatSize(1024 * 1023)).toBe("1023.0 KB");
    });

    it("formats values at or above 1 MB as MB with one decimal", () => {
        expect(formatSize(1024 * 1024)).toBe("1.0 MB");
        expect(formatSize(1024 * 1024 * 2.5)).toBe("2.5 MB");
    });
});
