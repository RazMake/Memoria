import { describe, it, expect } from "vitest";
import { findFirstHeadingBelow, parseHeadingChildren, parseSubHeadings } from "../../../../src/features/snippets/markdownUtils";

// ── helpers ───────────────────────────────────────────────────────────────────

function fromLines(lines: string[]): { getLine: (i: number) => string; lineCount: number } {
    return {
        getLine: (i: number) => lines[i],
        lineCount: lines.length,
    };
}

// ── findFirstHeadingBelow ─────────────────────────────────────────────────────

describe("findFirstHeadingBelow", () => {
    it("should return the line of the first heading at or after fromLine", () => {
        const { getLine, lineCount } = fromLines([
            "some text",
            "",
            "## Heading A",
            "- item",
        ]);

        expect(findFirstHeadingBelow(getLine, lineCount, 0)).toBe(2);
    });

    it("should skip non-heading lines", () => {
        const { getLine, lineCount } = fromLines([
            "no heading here",
            "still nothing",
            "### Third",
        ]);

        expect(findFirstHeadingBelow(getLine, lineCount, 0)).toBe(2);
    });

    it("should return the exact line when fromLine is a heading", () => {
        const { getLine, lineCount } = fromLines(["# Title"]);

        expect(findFirstHeadingBelow(getLine, lineCount, 0)).toBe(0);
    });

    it("should return null when no heading exists below fromLine", () => {
        const { getLine, lineCount } = fromLines([
            "# Heading",
            "text",
            "more text",
        ]);

        expect(findFirstHeadingBelow(getLine, lineCount, 1)).toBeNull();
    });

    it("should return null for empty document", () => {
        const { getLine, lineCount } = fromLines([]);

        expect(findFirstHeadingBelow(getLine, lineCount, 0)).toBeNull();
    });

    it("should match headings at any level (h1-h6)", () => {
        const { getLine, lineCount } = fromLines([
            "text",
            "###### Deep heading",
        ]);

        expect(findFirstHeadingBelow(getLine, lineCount, 0)).toBe(1);
    });

    it("should not match lines that start with # but have no space", () => {
        const { getLine, lineCount } = fromLines([
            "#hashtag",
            "## Real heading",
        ]);

        expect(findFirstHeadingBelow(getLine, lineCount, 0)).toBe(1);
    });
});

// ── parseHeadingChildren ──────────────────────────────────────────────────────

describe("parseHeadingChildren", () => {
    it("should return top-level list items as children", () => {
        const { getLine, lineCount } = fromLines([
            "## Section",
            "- Item 1",
            "- Item 2",
            "- Item 3",
        ]);

        const result = parseHeadingChildren(getLine, lineCount, 0);

        expect(result).toHaveLength(3);
        expect(result[0]).toEqual({ label: "- Item 1", block: "- Item 1" });
        expect(result[1]).toEqual({ label: "- Item 2", block: "- Item 2" });
        expect(result[2]).toEqual({ label: "- Item 3", block: "- Item 3" });
    });

    it("should include continuation lines in the block", () => {
        const { getLine, lineCount } = fromLines([
            "## Section",
            "- Item 1",
            "  continuation of item 1",
            "  more continuation",
            "- Item 2",
        ]);

        const result = parseHeadingChildren(getLine, lineCount, 0);

        expect(result).toHaveLength(2);
        expect(result[0].block).toBe("- Item 1\n  continuation of item 1\n  more continuation");
        expect(result[1].block).toBe("- Item 2");
    });

    it("should include nested list items in the block", () => {
        const { getLine, lineCount } = fromLines([
            "## Section",
            "- Item 1",
            "  - Nested 1a",
            "  - Nested 1b",
            "- Item 2",
            "  - Nested 2a",
        ]);

        const result = parseHeadingChildren(getLine, lineCount, 0);

        expect(result).toHaveLength(2);
        expect(result[0].block).toBe("- Item 1\n  - Nested 1a\n  - Nested 1b");
        expect(result[1].block).toBe("- Item 2\n  - Nested 2a");
    });

    it("should handle deeply nested items", () => {
        const { getLine, lineCount } = fromLines([
            "## Section",
            "- Item 1",
            "  - Nested",
            "    - Deep nested",
            "      - Very deep",
        ]);

        const result = parseHeadingChildren(getLine, lineCount, 0);

        expect(result).toHaveLength(1);
        expect(result[0].block).toBe(
            "- Item 1\n  - Nested\n    - Deep nested\n      - Very deep",
        );
    });

    it("should stop at a heading of same level", () => {
        const { getLine, lineCount } = fromLines([
            "## Section A",
            "- Item 1",
            "- Item 2",
            "## Section B",
            "- Item 3",
        ]);

        const result = parseHeadingChildren(getLine, lineCount, 0);

        expect(result).toHaveLength(2);
        expect(result[0].label).toBe("- Item 1");
        expect(result[1].label).toBe("- Item 2");
    });

    it("should stop at a heading of higher level", () => {
        const { getLine, lineCount } = fromLines([
            "### Sub-section",
            "- Item 1",
            "## Parent",
            "- Item 2",
        ]);

        const result = parseHeadingChildren(getLine, lineCount, 0);

        expect(result).toHaveLength(1);
        expect(result[0].label).toBe("- Item 1");
    });

    it("should not stop at a heading of lower level", () => {
        const { getLine, lineCount } = fromLines([
            "## Section",
            "- Item 1",
            "### Sub-heading",
            "- Item 2",
        ]);

        const result = parseHeadingChildren(getLine, lineCount, 0);

        // The sub-heading is part of Item 1's block; Item 2 starts a new
        // top-level child because it's at the same indent as Item 1.
        expect(result).toHaveLength(2);
        expect(result[0].block).toBe("- Item 1\n### Sub-heading");
        expect(result[1].block).toBe("- Item 2");
    });

    it("should skip blank lines before the first child", () => {
        const { getLine, lineCount } = fromLines([
            "## Section",
            "",
            "",
            "- Item 1",
        ]);

        const result = parseHeadingChildren(getLine, lineCount, 0);

        expect(result).toHaveLength(1);
        expect(result[0].label).toBe("- Item 1");
    });

    it("should trim trailing blank lines from blocks", () => {
        const { getLine, lineCount } = fromLines([
            "## Section",
            "- Item 1",
            "",
            "",
            "- Item 2",
        ]);

        const result = parseHeadingChildren(getLine, lineCount, 0);

        expect(result).toHaveLength(2);
        expect(result[0].block).toBe("- Item 1");
        expect(result[1].block).toBe("- Item 2");
    });

    it("should return empty array when heading has no children", () => {
        const { getLine, lineCount } = fromLines([
            "## Empty Section",
            "",
        ]);

        const result = parseHeadingChildren(getLine, lineCount, 0);

        expect(result).toHaveLength(0);
    });

    it("should return empty array when line is not a heading", () => {
        const { getLine, lineCount } = fromLines([
            "not a heading",
            "- Item 1",
        ]);

        const result = parseHeadingChildren(getLine, lineCount, 0);

        expect(result).toHaveLength(0);
    });

    it("should handle asterisk list markers", () => {
        const { getLine, lineCount } = fromLines([
            "## Section",
            "* Item 1",
            "* Item 2",
        ]);

        const result = parseHeadingChildren(getLine, lineCount, 0);

        expect(result).toHaveLength(2);
        expect(result[0].label).toBe("* Item 1");
    });

    it("should handle numbered list markers", () => {
        const { getLine, lineCount } = fromLines([
            "## Section",
            "1. First",
            "2. Second",
        ]);

        const result = parseHeadingChildren(getLine, lineCount, 0);

        expect(result).toHaveLength(2);
        expect(result[0].label).toBe("1. First");
        expect(result[1].label).toBe("2. Second");
    });

    it("should handle mixed continuation and nested items", () => {
        const { getLine, lineCount } = fromLines([
            "## Section",
            "- Item 1",
            "  continuation line",
            "  - Nested child",
            "    nested continuation",
            "  - Another nested",
            "- Item 2",
        ]);

        const result = parseHeadingChildren(getLine, lineCount, 0);

        expect(result).toHaveLength(2);
        expect(result[0].block).toBe(
            "- Item 1\n  continuation line\n  - Nested child\n    nested continuation\n  - Another nested",
        );
        expect(result[1].block).toBe("- Item 2");
    });

    it("should skip non-list preamble text between heading and list", () => {
        const { getLine, lineCount } = fromLines([
            "## Section",
            "Some introductory paragraph.",
            "",
            "- Item 1",
            "- Item 2",
        ]);

        const result = parseHeadingChildren(getLine, lineCount, 0);

        expect(result).toHaveLength(2);
        expect(result[0].label).toBe("- Item 1");
    });

    it("should handle h1 headings", () => {
        const { getLine, lineCount } = fromLines([
            "# Top Level",
            "- Child 1",
            "- Child 2",
        ]);

        const result = parseHeadingChildren(getLine, lineCount, 0);

        expect(result).toHaveLength(2);
    });
});

// ── parseSubHeadings ──────────────────────────────────────────────────────────

describe("parseSubHeadings", () => {
    it("should return sub-headings one level down", () => {
        const { getLine, lineCount } = fromLines([
            "## Section",
            "### Alpha",
            "Alpha content",
            "### Beta",
            "Beta content",
        ]);

        const result = parseSubHeadings(getLine, lineCount, 0);

        expect(result).toHaveLength(2);
        expect(result[0].label).toBe("### Alpha");
        expect(result[0].block).toBe("### Alpha\nAlpha content");
        expect(result[1].label).toBe("### Beta");
        expect(result[1].block).toBe("### Beta\nBeta content");
    });

    it("should include all content under a sub-heading", () => {
        const { getLine, lineCount } = fromLines([
            "## Section",
            "### Alpha",
            "Paragraph text.",
            "",
            "- list item 1",
            "- list item 2",
            "### Beta",
        ]);

        const result = parseSubHeadings(getLine, lineCount, 0);

        expect(result).toHaveLength(2);
        expect(result[0].block).toBe("### Alpha\nParagraph text.\n\n- list item 1\n- list item 2");
        expect(result[1].block).toBe("### Beta");
    });

    it("should include deeper headings within a sub-heading block", () => {
        const { getLine, lineCount } = fromLines([
            "## Section",
            "### Alpha",
            "#### Deep",
            "Deep content",
            "### Beta",
        ]);

        const result = parseSubHeadings(getLine, lineCount, 0);

        expect(result).toHaveLength(2);
        expect(result[0].block).toBe("### Alpha\n#### Deep\nDeep content");
    });

    it("should stop at a heading of the same level as the parent", () => {
        const { getLine, lineCount } = fromLines([
            "## Section A",
            "### Alpha",
            "Content A",
            "## Section B",
            "### Gamma",
        ]);

        const result = parseSubHeadings(getLine, lineCount, 0);

        expect(result).toHaveLength(1);
        expect(result[0].label).toBe("### Alpha");
        expect(result[0].block).toBe("### Alpha\nContent A");
    });

    it("should stop at a heading of higher level than the parent", () => {
        const { getLine, lineCount } = fromLines([
            "### Sub",
            "#### Child",
            "child text",
            "## Parent",
        ]);

        const result = parseSubHeadings(getLine, lineCount, 0);

        expect(result).toHaveLength(1);
        expect(result[0].block).toBe("#### Child\nchild text");
    });

    it("should skip content between parent heading and first child heading", () => {
        const { getLine, lineCount } = fromLines([
            "## Section",
            "Intro paragraph",
            "",
            "### Alpha",
            "Content",
        ]);

        const result = parseSubHeadings(getLine, lineCount, 0);

        expect(result).toHaveLength(1);
        expect(result[0].label).toBe("### Alpha");
    });

    it("should return empty when no sub-headings exist", () => {
        const { getLine, lineCount } = fromLines([
            "## Section",
            "Just text, no sub-headings",
            "- list item",
        ]);

        const result = parseSubHeadings(getLine, lineCount, 0);

        expect(result).toHaveLength(0);
    });

    it("should return empty when line is not a heading", () => {
        const { getLine, lineCount } = fromLines([
            "not a heading",
            "### Child",
        ]);

        const result = parseSubHeadings(getLine, lineCount, 0);

        expect(result).toHaveLength(0);
    });

    it("should return empty for h6 headings (no level below)", () => {
        const { getLine, lineCount } = fromLines([
            "###### H6",
            "content",
        ]);

        const result = parseSubHeadings(getLine, lineCount, 0);

        expect(result).toHaveLength(0);
    });

    it("should skip headings more than one level down", () => {
        const { getLine, lineCount } = fromLines([
            "## Section",
            "#### Too Deep",
            "### Just Right",
            "Content",
        ]);

        const result = parseSubHeadings(getLine, lineCount, 0);

        // Only ### is one level below ##; #### is skipped as a child
        expect(result).toHaveLength(1);
        expect(result[0].label).toBe("### Just Right");
    });

    it("should trim trailing blank lines from blocks", () => {
        const { getLine, lineCount } = fromLines([
            "## Section",
            "### Alpha",
            "Content",
            "",
            "",
            "### Beta",
            "More",
        ]);

        const result = parseSubHeadings(getLine, lineCount, 0);

        expect(result).toHaveLength(2);
        expect(result[0].block).toBe("### Alpha\nContent");
        expect(result[1].block).toBe("### Beta\nMore");
    });

    it("should handle h1 with h2 children", () => {
        const { getLine, lineCount } = fromLines([
            "# Title",
            "## Part 1",
            "Part 1 content",
            "## Part 2",
            "Part 2 content",
        ]);

        const result = parseSubHeadings(getLine, lineCount, 0);

        expect(result).toHaveLength(2);
        expect(result[0].label).toBe("## Part 1");
        expect(result[0].block).toBe("## Part 1\nPart 1 content");
        expect(result[1].label).toBe("## Part 2");
        expect(result[1].block).toBe("## Part 2\nPart 2 content");
    });

    it("should include the full tree under a sub-heading", () => {
        const { getLine, lineCount } = fromLines([
            "## Section",
            "### Alpha",
            "Paragraph",
            "- list 1",
            "  - nested",
            "#### Sub-sub",
            "Deep text",
            "### Beta",
        ]);

        const result = parseSubHeadings(getLine, lineCount, 0);

        expect(result).toHaveLength(2);
        expect(result[0].block).toBe(
            "### Alpha\nParagraph\n- list 1\n  - nested\n#### Sub-sub\nDeep text",
        );
        expect(result[1].block).toBe("### Beta");
    });
});
