import { describe, expect, it } from "vitest";
import { forward, reverse } from "../../../../src/features/taskCollector/pathRewriter";

describe("pathRewriter", () => {
    it("should rewrite relative image and link paths from source to collector", () => {
        const body = "Review ![arch](./img/arch.png) and [baseline](../bench/README.md)";

        const rewritten = forward(body, "docs/deep/notes.md", "00-Tasks/All-Tasks.md");

        expect(rewritten).toBe("Review ![arch](../docs/deep/img/arch.png) and [baseline](../docs/bench/README.md)");
    });

    it("should leave absolute, fragment-only, protocol-relative, and workspace-absolute paths unchanged", () => {
        const body = [
            "[site](https://example.com)",
            "[mail](mailto:test@example.com)",
            "[cdn](//cdn.example.com/x.js)",
            "[section](#heading)",
            "[root](/docs/x.md)",
        ].join("\n");

        expect(forward(body, "docs/notes.md", "00-Tasks/All-Tasks.md")).toBe(body);
    });

    it("should skip rewriting links inside fenced code blocks", () => {
        const body = [
            "Example",
            "      ```md",
            "      ![](./img.png)",
            "      ```",
        ].join("\n");

        expect(forward(body, "docs/notes.md", "00-Tasks/All-Tasks.md")).toBe(body);
    });

    it("should round-trip rewritten paths back to the source location", () => {
        const body = [
            "![arch](./img/arch.png)",
            "[guide](../README.md)",
            "      [ref]: ./local.md \"title\"",
        ].join("\n");

        const collectorBody = forward(body, "docs/deep/notes.md", "00-Tasks/All-Tasks.md");
        const sourceBody = reverse(collectorBody, "00-Tasks/All-Tasks.md", "docs/deep/notes.md");

        expect(sourceBody).toBe(body);
    });

    it("should rewrite reference-style definition paths while preserving the title", () => {
        const body = "      [id]: ./rel.md \"title\"";

        expect(forward(body, "docs/deep/notes.md", "00-Tasks/All-Tasks.md"))
            .toBe("      [id]: ../docs/deep/rel.md \"title\"");
    });

    it("should rewrite multiple links within the same line", () => {
        const body = "[a](./a.md) and [b](./b.md)";
        const result = forward(body, "src/notes.md", "00-Tasks/tasks.md");
        expect(result).toBe("[a](../src/a.md) and [b](../src/b.md)");
    });

    it("should rewrite image paths when there are no text links", () => {
        const body = "![diagram](./diagram.png)";
        const result = forward(body, "docs/notes.md", "00-Tasks/tasks.md");
        expect(result).toBe("![diagram](../docs/diagram.png)");
    });

    it("should produce the correct number of ../ levels for deeply nested source", () => {
        const body = "[link](./deep.md)";
        // source is 4 levels deep, collector is 1 level deep
        const result = forward(body, "a/b/c/d/notes.md", "tasks/tasks.md");
        expect(result).toBe("[link](../a/b/c/d/deep.md)");
    });

    it("should selectively reverse only links that were rewritten in the forward pass", () => {
        // The user added a new link directly in the collector body
        const originalSourceBody = "[original](./original.md)";
        const collectorBody = forward(originalSourceBody, "src/notes.md", "tasks/tasks.md");
        // Simulate user adding a new link directly in the collector
        const collectorBodyWithExtra = collectorBody + " [new](./new-link.md)";
        // reverse() with templateBody = original body should only undo the first link
        const restored = reverse(collectorBodyWithExtra, "tasks/tasks.md", "src/notes.md", originalSourceBody);
        expect(restored).toBe("[original](./original.md) [new](./new-link.md)");
    });

    it("should not rewrite anchor-only links", () => {
        const body = "[heading](#my-heading)";
        expect(forward(body, "docs/notes.md", "tasks/tasks.md")).toBe(body);
    });

    it("should handle a source file at the workspace root", () => {
        const body = "[link](./notes.md)";
        const result = forward(body, "README.md", "tasks/tasks.md");
        expect(result).toBe("[link](../notes.md)");
    });
});
