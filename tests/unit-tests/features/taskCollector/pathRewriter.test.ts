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

    it("should rewrite angle-bracket inline destinations and preserve the brackets", () => {
        const body = "[a](<./my file.md>)";
        const result = forward(body, "docs/notes.md", "tasks/tasks.md");
        expect(result).toBe("[a](<../docs/my file.md>)");
    });

    it("should rewrite angle-bracket reference definitions and preserve the brackets", () => {
        const body = "[id]: <./rel.md> \"title\"";
        const result = forward(body, "docs/notes.md", "tasks/tasks.md");
        expect(result).toBe("[id]: <../docs/rel.md> \"title\"");
    });

    it("should preserve query strings and fragments while rewriting the path part", () => {
        const body = "[a](./page.md?x=1#frag)";
        const result = forward(body, "docs/notes.md", "tasks/tasks.md");
        expect(result).toBe("[a](../docs/page.md?x=1#frag)");
    });

    it("should ignore link labels with escaped brackets and parens in the destination", () => {
        const body = "[lab\\]el](./a\\(b\\).md)";
        const result = forward(body, "docs/notes.md", "tasks/tasks.md");
        expect(result).toBe("[lab\\]el](../docs/a\\(b\\).md)");
    });

    it("should leave a bracket that is not followed by a parenthesis unchanged", () => {
        const body = "[just a label] then text";
        expect(forward(body, "docs/notes.md", "tasks/tasks.md")).toBe(body);
    });

    it("should leave a link with an unclosed parenthesis unchanged", () => {
        const body = "[a](./unclosed.md";
        expect(forward(body, "docs/notes.md", "tasks/tasks.md")).toBe(body);
    });

    it("should leave a link with an empty destination unchanged", () => {
        const body = "[a]( )";
        expect(forward(body, "docs/notes.md", "tasks/tasks.md")).toBe(body);
    });

    it("should leave an angle-bracket destination with no closing bracket unchanged", () => {
        const body = "[a](<./unclosed.md)";
        expect(forward(body, "docs/notes.md", "tasks/tasks.md")).toBe(body);
    });

    it("should rewrite a destination that contains balanced nested parentheses", () => {
        const body = "[a](./foo(bar).md)";
        const result = forward(body, "docs/notes.md", "tasks/tasks.md");
        expect(result).toBe("[a](../docs/foo(bar).md)");
    });

    it("should leave a label that never closes its bracket unchanged", () => {
        const body = "[abc (def)";
        expect(forward(body, "docs/notes.md", "tasks/tasks.md")).toBe(body);
    });

    it("should fall back to the basename when source and collector share a directory", () => {
        const body = "[a](./sibling.md)";
        const result = forward(body, "docs/notes.md", "docs/tasks.md");
        expect(result).toBe("[a](./sibling.md)");
    });

    it("should not reverse a rewritten link that is absent from the template body", () => {
        const collectorBody = "[a](../docs/a.md)";
        // Template has no rewritable links, so the ordinal allowlist is empty.
        const restored = reverse(collectorBody, "tasks/tasks.md", "docs/notes.md", "no links here");
        expect(restored).toBe(collectorBody);
    });
});
