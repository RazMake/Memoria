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
});
