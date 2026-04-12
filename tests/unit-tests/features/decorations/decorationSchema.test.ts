import { describe, it, expect } from "vitest";
import { DECORATION_RULE_FIELDS, type FieldMeta } from "../../../../src/features/decorations/decorationSchema";

describe("DECORATION_RULE_FIELDS", () => {
    it("should have at least one field", () => {
        expect(Object.keys(DECORATION_RULE_FIELDS).length).toBeGreaterThan(0);
    });

    it("should have exactly one required field", () => {
        const required = Object.entries(DECORATION_RULE_FIELDS)
            .filter(([, m]) => m.required);
        expect(required.length).toBe(1);
        expect(required[0][0]).toBe("filter");
    });

    it("every field should have a valid type", () => {
        for (const [, meta] of Object.entries(DECORATION_RULE_FIELDS) as [string, FieldMeta][]) {
            expect(["string", "boolean"]).toContain(meta.type);
        }
    });

    it("every field should have a non-empty description", () => {
        for (const [, meta] of Object.entries(DECORATION_RULE_FIELDS) as [string, FieldMeta][]) {
            expect(meta.description.length).toBeGreaterThan(0);
        }
    });

    it("every field should declare required as a boolean", () => {
        for (const [, meta] of Object.entries(DECORATION_RULE_FIELDS) as [string, FieldMeta][]) {
            expect(typeof meta.required).toBe("boolean");
        }
    });
});
