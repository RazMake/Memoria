import { describe, it, expect } from "vitest";
import { detectLinkContext } from "../../../../src/features/todoEditor/webview/linkContext";

describe("detectLinkContext", () => {
    describe("path mode", () => {
        it("should detect cursor inside empty parens after ]", () => {
            const text = "[link]()";
            const cursor = 7; // between ( and )
            const ctx = detectLinkContext(text, cursor);
            expect(ctx).toEqual({ mode: "path", prefix: "", parenStart: 7, filePath: "" });
        });

        it("should detect cursor with a partial path typed", () => {
            const text = "[link](src/f)";
            const cursor = 12; // after 'f', before ')'
            const ctx = detectLinkContext(text, cursor);
            expect(ctx).toEqual({ mode: "path", prefix: "src/f", parenStart: 7, filePath: "" });
        });

        it("should return undefined when cursor is outside parens", () => {
            const text = "[link](path) more text";
            const cursor = 18;
            expect(detectLinkContext(text, cursor)).toBeUndefined();
        });

        it("should return undefined when ( is not preceded by ]", () => {
            const text = "function(arg)";
            const cursor = 12;
            expect(detectLinkContext(text, cursor)).toBeUndefined();
        });

        it("should handle nested parens (e.g. text before the link)", () => {
            const text = "some (stuff) [link](pa)";
            const cursor = 22; // after 'pa', before ')'
            const ctx = detectLinkContext(text, cursor);
            expect(ctx).toEqual({ mode: "path", prefix: "pa", parenStart: 20, filePath: "" });
        });

        it("should not cross newlines", () => {
            const text = "[link](\npath)";
            const cursor = 12;
            expect(detectLinkContext(text, cursor)).toBeUndefined();
        });

        it("should handle cursor at the very start of parens", () => {
            const text = "See [docs](";
            const cursor = 11; // right after '('
            const ctx = detectLinkContext(text, cursor);
            expect(ctx).toEqual({ mode: "path", prefix: "", parenStart: 11, filePath: "" });
        });
    });

    describe("heading mode", () => {
        it("should detect heading mode when # appears after file path", () => {
            const text = "[link](file.md#)";
            const cursor = 15; // after '#', before ')'
            const ctx = detectLinkContext(text, cursor);
            expect(ctx).toEqual({ mode: "heading", prefix: "", parenStart: 7, filePath: "file.md" });
        });

        it("should detect heading mode with a partial heading prefix", () => {
            const text = "[link](file.md#intr)";
            const cursor = 19; // after 'intr', before ')'
            const ctx = detectLinkContext(text, cursor);
            expect(ctx).toEqual({ mode: "heading", prefix: "intr", parenStart: 7, filePath: "file.md" });
        });

        it("should detect heading mode with empty file path (same-file anchor)", () => {
            const text = "[section](#getting-started)";
            const cursor = 26; // after 'getting-started', before ')'
            const ctx = detectLinkContext(text, cursor);
            expect(ctx).toEqual({ mode: "heading", prefix: "getting-started", parenStart: 10, filePath: "" });
        });

        it("should handle # immediately after open paren", () => {
            const text = "[heading](#)";
            const cursor = 11; // after '#', before ')'
            const ctx = detectLinkContext(text, cursor);
            expect(ctx).toEqual({ mode: "heading", prefix: "", parenStart: 10, filePath: "" });
        });
    });

    describe("edge cases", () => {
        it("should return undefined for empty string", () => {
            expect(detectLinkContext("", 0)).toBeUndefined();
        });

        it("should return undefined for plain text", () => {
            expect(detectLinkContext("hello world", 5)).toBeUndefined();
        });

        it("should return undefined when cursor is at position 0", () => {
            expect(detectLinkContext("[link](path)", 0)).toBeUndefined();
        });

        it("should handle multiple links on the same line", () => {
            const text = "[a](first) [b](sec)";
            const cursor = 18; // inside second link's parens, after 'sec'
            const ctx = detectLinkContext(text, cursor);
            expect(ctx).toEqual({ mode: "path", prefix: "sec", parenStart: 15, filePath: "" });
        });

        it("should return undefined for balanced parens before the markdown link", () => {
            const text = "(balanced) [link](path)";
            const cursor = 22; // inside the markdown link parens
            const ctx = detectLinkContext(text, cursor);
            expect(ctx).toEqual({ mode: "path", prefix: "path", parenStart: 18, filePath: "" });
        });
    });
});
