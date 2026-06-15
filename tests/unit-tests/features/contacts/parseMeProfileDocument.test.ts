import { describe, it, expect } from "vitest";
import { parseMeProfileDocument } from "../../../../src/features/contacts/contactParser";

describe("parseMeProfileDocument", () => {
    it("parses basic key-value pairs", () => {
        const text = `- FullName: Alice Smith
- TeamName: Engineering
- Email: alice@example.com`;
        const profile = parseMeProfileDocument(text);
        expect(profile["FullName"]).toBe("Alice Smith");
        expect(profile["TeamName"]).toBe("Engineering");
        expect(profile["Email"]).toBe("alice@example.com");
    });

    it("returns empty object for empty text", () => {
        const profile = parseMeProfileDocument("");
        expect(Object.keys(profile)).toHaveLength(0);
    });

    it("ignores non-field lines", () => {
        const text = `# Me\nSome paragraph text\n- Name: Alice`;
        const profile = parseMeProfileDocument(text);
        expect(profile["Name"]).toBe("Alice");
        expect(Object.keys(profile)).toHaveLength(1);
    });

    it("includes all fields regardless of whether templates reference them", () => {
        const text = `- FullName: Alice\n- CustomField1: custom1\n- AnotherField: another`;
        const profile = parseMeProfileDocument(text);
        expect(Object.keys(profile)).toHaveLength(3);
        expect(profile["CustomField1"]).toBe("custom1");
        expect(profile["AnotherField"]).toBe("another");
    });

    it("preserves exact label casing", () => {
        const text = `- StartDate: 2024-01-15\n- teamName: engineering`;
        const profile = parseMeProfileDocument(text);
        expect(profile["StartDate"]).toBe("2024-01-15");
        expect(profile["teamName"]).toBe("engineering");
        // Note: keys are preserved as-is
        expect(Object.hasOwn(profile, "StartDate")).toBe(true);
        expect(Object.hasOwn(profile, "teamName")).toBe(true);
    });

    it("handles empty value after colon", () => {
        const text = `- EmptyField: `;
        const profile = parseMeProfileDocument(text);
        expect(profile["EmptyField"]).toBe("");
    });

    it("trims whitespace from label and value", () => {
        const text = `- Full Name :  Alice Smith  `;
        const profile = parseMeProfileDocument(text);
        expect(profile["Full Name"]).toBe("Alice Smith");
    });

    it("does not require # heading line", () => {
        const text = `- Name: Bob\n- Email: bob@example.com`;
        const profile = parseMeProfileDocument(text);
        expect(Object.keys(profile)).toHaveLength(2);
    });

    it("skips _droppedFields entries", () => {
        const text = `- Name: Alice\n- _droppedFields:\n  - OldField: value`;
        const profile = parseMeProfileDocument(text);
        expect(Object.hasOwn(profile, "_droppedFields")).toBe(false);
        expect(profile["Name"]).toBe("Alice");
    });

    it("field present in file allows Object.hasOwn check", () => {
        const text = `- StartDate: 2024-01-15`;
        const profile = parseMeProfileDocument(text);
        expect(Object.hasOwn(profile, "StartDate")).toBe(true);
        expect(Object.hasOwn(profile, "MissingField")).toBe(false);
    });

    it("handles multiline document with blank lines", () => {
        const text = `- FullName: Alice\n\n- TeamName: Engineering\n\n- StartDate: 2024-01-15`;
        const profile = parseMeProfileDocument(text);
        expect(Object.keys(profile)).toHaveLength(3);
    });
});
