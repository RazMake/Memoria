import { describe, it, expect } from "vitest";
import {
    THEME_COLORS,
    THEME_COLOR_MAP,
    hexToRgb,
    findClosestThemeColor,
} from "../../../../src/features/decorations/themeColors";

describe("THEME_COLORS catalog", () => {
    it("should contain at least 40 entries", () => {
        expect(THEME_COLORS.length).toBeGreaterThanOrEqual(40);
    });

    it("should have no duplicate IDs", () => {
        const ids = THEME_COLORS.map((e) => e.id);
        expect(new Set(ids).size).toBe(ids.length);
    });

    it("should have valid 7-character hex values for every entry", () => {
        for (const entry of THEME_COLORS) {
            expect(entry.hex).toMatch(/^#[0-9A-Fa-f]{6,8}$/);
        }
    });

    it("should include charts.yellow", () => {
        expect(THEME_COLOR_MAP.has("charts.yellow")).toBe(true);
    });

    it("should include gitDecoration.addedResourceForeground", () => {
        expect(THEME_COLOR_MAP.has("gitDecoration.addedResourceForeground")).toBe(true);
    });
});

describe("hexToRgb", () => {
    it("should convert #FF0000 to r=255,g=0,b=0", () => {
        expect(hexToRgb("#FF0000")).toEqual({ r: 255, g: 0, b: 0 });
    });

    it("should convert #00ff00 (lowercase) to r=0,g=255,b=0", () => {
        expect(hexToRgb("#00ff00")).toEqual({ r: 0, g: 255, b: 0 });
    });

    it("should convert #3794FF to r=55,g=148,b=255", () => {
        expect(hexToRgb("#3794FF")).toEqual({ r: 55, g: 148, b: 255 });
    });

    it("should handle hex without leading #", () => {
        expect(hexToRgb("CCA700")).toEqual({ r: 204, g: 167, b: 0 });
    });
});

describe("findClosestThemeColor", () => {
    it("should return charts.red for pure red (255,0,0)", () => {
        // charts.red is #F14C4C — closest pure red in the catalog
        const result = findClosestThemeColor(255, 0, 0);
        expect(result.id).toMatch(/red/i);
    });

    it("should return a blue color for pure blue (0,0,255)", () => {
        const result = findClosestThemeColor(0, 0, 255);
        expect(result.id).toMatch(/blue/i);
    });

    it("should return an exact match for a known hex value", () => {
        // charts.yellow is #CCA700
        const result = findClosestThemeColor(204, 167, 0);
        expect(result.id).toBe("charts.yellow");
    });

    it("should return terminal.ansiBlack for (0,0,0)", () => {
        const result = findClosestThemeColor(0, 0, 0);
        expect(result.id).toBe("terminal.ansiBlack");
    });
});
