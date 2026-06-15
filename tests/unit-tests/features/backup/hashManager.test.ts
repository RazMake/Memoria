import { describe, it, expect, vi, beforeEach } from "vitest";
import { computeFileHash, findChangedFiles, buildHashManifest } from "../../../../src/features/backup/hashManager";
import * as crypto from "crypto";

vi.mock("vscode", () => ({
    workspace: {
        fs: {},
    },
}));

function makeUri(path: string): { toString: () => string } {
    return { toString: () => `file://${path}` } as any;
}

function sha256(text: string): string {
    return crypto.createHash("sha256").update(Buffer.from(text)).digest("hex");
}

describe("findChangedFiles", () => {
    it("marks a new file (not in previous hashes) as changed", async () => {
        const content = Buffer.from("hello");
        const mockFs = {
            readFile: vi.fn().mockResolvedValue(content),
        } as any;

        const files = [{ uri: makeUri("/workspace/a.md") as any, relativePath: "a.md" }];
        const result = await findChangedFiles(files, {}, mockFs);

        expect(result).toHaveLength(1);
        expect(result[0]!.relativePath).toBe("a.md");
    });

    it("does not include an unchanged file", async () => {
        const content = Buffer.from("hello");
        const hash = sha256("hello");
        const mockFs = {
            readFile: vi.fn().mockResolvedValue(content),
        } as any;

        const files = [{ uri: makeUri("/workspace/a.md") as any, relativePath: "a.md" }];
        const result = await findChangedFiles(files, { "a.md": hash }, mockFs);

        expect(result).toHaveLength(0);
    });

    it("includes a file whose content changed", async () => {
        const content = Buffer.from("new content");
        const oldHash = sha256("old content");
        const mockFs = {
            readFile: vi.fn().mockResolvedValue(content),
        } as any;

        const files = [{ uri: makeUri("/workspace/a.md") as any, relativePath: "a.md" }];
        const result = await findChangedFiles(files, { "a.md": oldHash }, mockFs);

        expect(result).toHaveLength(1);
    });

    it("skips files that cannot be read", async () => {
        const mockFs = {
            readFile: vi.fn().mockRejectedValue(new Error("ENOENT")),
        } as any;

        const files = [{ uri: makeUri("/workspace/missing.md") as any, relativePath: "missing.md" }];
        const result = await findChangedFiles(files, {}, mockFs);

        expect(result).toHaveLength(0);
    });
});

describe("buildHashManifest", () => {
    it("builds a manifest with correct hashes", async () => {
        const contentA = Buffer.from("file A");
        const contentB = Buffer.from("file B");
        const mockFs = {
            readFile: vi.fn()
                .mockResolvedValueOnce(contentA)
                .mockResolvedValueOnce(contentB),
        } as any;

        const files = [
            { uri: makeUri("/workspace/a.md") as any, relativePath: "a.md" },
            { uri: makeUri("/workspace/b.md") as any, relativePath: "b.md" },
        ];
        const manifest = await buildHashManifest(files, mockFs);

        expect(manifest["a.md"]).toBe(sha256("file A"));
        expect(manifest["b.md"]).toBe(sha256("file B"));
    });

    it("omits files that cannot be read", async () => {
        const mockFs = {
            readFile: vi.fn().mockRejectedValue(new Error("ENOENT")),
        } as any;

        const files = [{ uri: makeUri("/workspace/missing.md") as any, relativePath: "missing.md" }];
        const manifest = await buildHashManifest(files, mockFs);

        expect(Object.keys(manifest)).toHaveLength(0);
    });
});

describe("computeFileHash", () => {
    it("returns sha256 hex hash of file content", async () => {
        const content = Buffer.from("hello world");
        const mockFs = { readFile: vi.fn().mockResolvedValue(content) } as any;
        const uri = makeUri("/workspace/test.md") as any;

        const hash = await computeFileHash(uri, mockFs);

        expect(hash).toBe(sha256("hello world"));
    });

    it("returns null when the file cannot be read", async () => {
        const mockFs = { readFile: vi.fn().mockRejectedValue(new Error("ENOENT")) } as any;
        const uri = makeUri("/workspace/missing.md") as any;

        const hash = await computeFileHash(uri, mockFs);

        expect(hash).toBeNull();
    });
});
