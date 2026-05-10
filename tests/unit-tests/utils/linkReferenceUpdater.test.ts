import { describe, it, expect } from "vitest";
import { updateMarkdownLinks, updateMarkdownLinkPrefixes, computeRelativePosixPath } from "../../../src/utils/linkReferenceUpdater";

describe("updateMarkdownLinks", () => {
    it("should replace a simple file link path", () => {
        const content = "[info](old.md)";
        const result = updateMarkdownLinks(content, "old.md", "new.md");
        expect(result).toBe("[info](new.md)");
    });

    it("should replace an image link path", () => {
        const content = "![img](old.png)";
        const result = updateMarkdownLinks(content, "old.png", "new.png");
        expect(result).toBe("![img](new.png)");
    });

    it("should preserve anchor fragments", () => {
        const content = "[info](old.md#heading)";
        const result = updateMarkdownLinks(content, "old.md", "new.md");
        expect(result).toBe("[info](new.md#heading)");
    });

    it("should return null when no links match", () => {
        const content = "[info](other.md)";
        const result = updateMarkdownLinks(content, "old.md", "new.md");
        expect(result).toBeNull();
    });

    it("should skip links inside fenced code blocks (triple backtick)", () => {
        const content = "```\n[info](old.md)\n```";
        const result = updateMarkdownLinks(content, "old.md", "new.md");
        expect(result).toBeNull();
    });

    it("should skip links inside fenced code blocks (triple tilde)", () => {
        const content = "~~~\n[info](old.md)\n~~~";
        const result = updateMarkdownLinks(content, "old.md", "new.md");
        expect(result).toBeNull();
    });

    it("should handle multiple links on the same line", () => {
        const content = "[a](old.md) and [b](old.md)";
        const result = updateMarkdownLinks(content, "old.md", "new.md");
        expect(result).toBe("[a](new.md) and [b](new.md)");
    });

    it("should replace only matching paths (not partial matches)", () => {
        const content = "[a](old.md) and [b](old.md.bak)";
        const result = updateMarkdownLinks(content, "old.md", "new.md");
        expect(result).toBe("[a](new.md) and [b](old.md.bak)");
    });

    it("should handle links with empty text", () => {
        const content = "[](old.md)";
        const result = updateMarkdownLinks(content, "old.md", "new.md");
        expect(result).toBe("[](new.md)");
    });

    it("should handle content with mixed matching and non-matching links", () => {
        const content = "[a](old.md)\n[b](other.md)\n[c](old.md)";
        const result = updateMarkdownLinks(content, "old.md", "new.md");
        expect(result).toBe("[a](new.md)\n[b](other.md)\n[c](new.md)");
    });

    it("should handle paths with directories", () => {
        const content = "[doc](docs/old.md)";
        const result = updateMarkdownLinks(content, "docs/old.md", "docs/new.md");
        expect(result).toBe("[doc](docs/new.md)");
    });

    it("should handle the renamed file appearing multiple times", () => {
        const content = "[first](old.md)\nSome text\n[second](old.md#section)";
        const result = updateMarkdownLinks(content, "old.md", "new.md");
        expect(result).toBe("[first](new.md)\nSome text\n[second](new.md#section)");
    });
});

describe("updateMarkdownLinkPrefixes", () => {
    it("should replace folder prefix in link paths", () => {
        const content = "[doc](old-dir/file.md)";
        const result = updateMarkdownLinkPrefixes(content, "old-dir", "new-dir");
        expect(result).toBe("[doc](new-dir/file.md)");
    });

    it("should replace folder prefix in nested paths", () => {
        const content = "[doc](old-dir/sub/file.md)";
        const result = updateMarkdownLinkPrefixes(content, "old-dir", "new-dir");
        expect(result).toBe("[doc](new-dir/sub/file.md)");
    });

    it("should preserve anchor in folder-prefixed links", () => {
        const content = "[doc](old-dir/file.md#h)";
        const result = updateMarkdownLinkPrefixes(content, "old-dir", "new-dir");
        expect(result).toBe("[doc](new-dir/file.md#h)");
    });

    it("should return null when no folder-prefixed links found", () => {
        const content = "[doc](other-dir/file.md)";
        const result = updateMarkdownLinkPrefixes(content, "old-dir", "new-dir");
        expect(result).toBeNull();
    });

    it("should skip folder-prefixed links inside fenced code blocks", () => {
        const content = "```\n[doc](old-dir/file.md)\n```";
        const result = updateMarkdownLinkPrefixes(content, "old-dir", "new-dir");
        expect(result).toBeNull();
    });

    it("should handle image links with folder prefix", () => {
        const content = "![img](old-dir/image.png)";
        const result = updateMarkdownLinkPrefixes(content, "old-dir", "new-dir");
        expect(result).toBe("![img](new-dir/image.png)");
    });
});

describe("computeRelativePosixPath", () => {
    it("should compute relative path from same directory", () => {
        const result = computeRelativePosixPath("/a/b", "/a/b/file.md");
        expect(result).toBe("file.md");
    });

    it("should compute relative path going up", () => {
        const result = computeRelativePosixPath("/a/b/c", "/a/d/file.md");
        expect(result).toBe("../../d/file.md");
    });

    it("should compute relative path for sibling", () => {
        const result = computeRelativePosixPath("/a/b", "/a/c/file.md");
        expect(result).toBe("../c/file.md");
    });
});
