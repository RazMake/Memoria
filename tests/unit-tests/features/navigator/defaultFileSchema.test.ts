import { describe, it, expect } from "vitest";
import {
    getExistingDefaultFilesKeys,
    getExistingEntryKeys,
    getExistingArrayValues,
} from "../../../../src/features/navigator/defaultFileSchema";

// ────────────────────────────────────────────────────────────────────────────
// Shared fixture
// ────────────────────────────────────────────────────────────────────────────
const json = `{
    "defaultFiles": {
        "00-ToDo/": {
            "filesToOpen": ["notes.md", "tasks.md"],
            "closeOtherEditors": true
        },
        "01-Archive/": ["old.md"]
    }
}`;

// ────────────────────────────────────────────────────────────────────────────
// Tests
// ────────────────────────────────────────────────────────────────────────────

describe("getExistingDefaultFilesKeys", () => {
    it("should return keys from valid JSON", () => {
        const keys = getExistingDefaultFilesKeys(json);

        expect(keys).toEqual(new Set(["00-ToDo/", "01-Archive/"]));
    });

    it("should return empty set for empty document", () => {
        const keys = getExistingDefaultFilesKeys("");

        expect(keys.size).toBe(0);
    });

    it("should return empty set for malformed JSON", () => {
        const keys = getExistingDefaultFilesKeys("{{{invalid");

        expect(keys.size).toBe(0);
    });
});

describe("getExistingEntryKeys", () => {
    it("should return property keys of a folder entry", () => {
        const keys = getExistingEntryKeys(json, "00-ToDo/");

        expect(keys).toEqual(new Set(["filesToOpen", "closeOtherEditors"]));
    });

    it("should return empty set when folder not found", () => {
        const keys = getExistingEntryKeys(json, "nonexistent/");

        expect(keys.size).toBe(0);
    });

    it("should return empty set when entry is an array (legacy format)", () => {
        const keys = getExistingEntryKeys(json, "01-Archive/");

        expect(keys.size).toBe(0);
    });
});

describe("getExistingArrayValues", () => {
    it("should return string values from filesToOpen array (new format)", () => {
        const values = getExistingArrayValues(json, "00-ToDo/");

        expect(values).toEqual(new Set(["notes.md", "tasks.md"]));
    });

    it("should return string values from legacy array format", () => {
        const values = getExistingArrayValues(json, "01-Archive/");

        expect(values).toEqual(new Set(["old.md"]));
    });

    it("should return empty set when no array found", () => {
        const values = getExistingArrayValues(json, "nonexistent/");

        expect(values.size).toBe(0);
    });
});
