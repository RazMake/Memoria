import { describe, it, expect } from "vitest";
import { toHeadingSlug } from "../../../src/utils/headingSlug";

describe("toHeadingSlug", () => {
    it("should lowercase and replace spaces with hyphens", () => {
        expect(toHeadingSlug("Getting Started")).toBe("getting-started");
    });

    it("should strip special characters", () => {
        expect(toHeadingSlug("What's New?")).toBe("whats-new");
    });

    it("should collapse multiple spaces into a single hyphen", () => {
        expect(toHeadingSlug("Foo   Bar   Baz")).toBe("foo-bar-baz");
    });

    it("should trim leading and trailing whitespace", () => {
        expect(toHeadingSlug("  Hello World  ")).toBe("hello-world");
    });

    it("should preserve hyphens", () => {
        expect(toHeadingSlug("pre-existing value")).toBe("pre-existing-value");
    });

    it("should preserve underscores", () => {
        expect(toHeadingSlug("my_var_name")).toBe("my_var_name");
    });

    it("should handle all-special-character headings", () => {
        expect(toHeadingSlug("***")).toBe("");
    });

    it("should handle digits", () => {
        expect(toHeadingSlug("Step 1: Setup")).toBe("step-1-setup");
    });

    it("should handle empty string", () => {
        expect(toHeadingSlug("")).toBe("");
    });

    it("should handle accented characters by stripping them", () => {
        // \w in JS does not match accented chars — they get stripped
        expect(toHeadingSlug("Résumé")).toBe("rsum");
    });
});
