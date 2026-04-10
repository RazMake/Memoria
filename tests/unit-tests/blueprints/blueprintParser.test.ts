import { describe, it, expect } from "vitest";
import { parseBlueprintYaml, parseWorkspaceTree, parseDecorationRules } from "../../../src/blueprints/blueprintParser";

// blueprintParser is pure logic with no VS Code API dependency — no mocks needed.

describe("parseBlueprintYaml", () => {
    it("should parse a valid blueprint YAML with workspace and decorations", () => {
        const yaml = `
id: "test-blueprint"
name: "Test Blueprint"
description: "A test."
version: "1.0.0"
workspace:
  - name: "Folder1/"
    children:
      - name: "File.md"
  - name: "Root.md"
decorations:
  - filter: "Folder1/"
    color: "charts.green"
    badge: "F1"
`;
        const result = parseBlueprintYaml(yaml);

        expect(result.id).toBe("test-blueprint");
        expect(result.name).toBe("Test Blueprint");
        expect(result.description).toBe("A test.");
        expect(result.version).toBe("1.0.0");
        expect(result.workspace).toHaveLength(2);
        expect(result.decorations).toHaveLength(1);
    });

    it("should return empty decorations array when decorations section is absent", () => {
        const yaml = `
id: "test-blueprint"
name: "Test"
description: "desc"
version: "1.0.0"
workspace:
  - name: "File.md"
`;
        const result = parseBlueprintYaml(yaml);
        expect(result.decorations).toEqual([]);
    });

    it("should throw when YAML is not valid syntax", () => {
        expect(() => parseBlueprintYaml("{ invalid yaml: [")).toThrow("Failed to parse blueprint YAML");
    });

    it("should throw when top-level value is not an object", () => {
        expect(() => parseBlueprintYaml("- item1\n- item2")).toThrow("non-null object");
    });

    it("should throw when id field is missing", () => {
        const yaml = `name: "Test"\ndescription: "desc"\nversion: "1.0.0"\nworkspace: []`;
        expect(() => parseBlueprintYaml(yaml)).toThrow('"id"');
    });

    it("should throw when name field is missing", () => {
        const yaml = `id: "test"\ndescription: "desc"\nversion: "1.0.0"\nworkspace: []`;
        expect(() => parseBlueprintYaml(yaml)).toThrow('"name"');
    });

    it("should throw when description field is missing", () => {
        const yaml = `id: "test"\nname: "Test"\nversion: "1.0.0"\nworkspace: []`;
        expect(() => parseBlueprintYaml(yaml)).toThrow('"description"');
    });

    it("should throw when version field is missing", () => {
        const yaml = `id: "test"\nname: "Test"\ndescription: "desc"\nworkspace: []`;
        expect(() => parseBlueprintYaml(yaml)).toThrow('"version"');
    });

    it("should throw when workspace field is missing", () => {
        const yaml = `id: "test"\nname: "Test"\ndescription: "desc"\nversion: "1.0.0"`;
        expect(() => parseBlueprintYaml(yaml)).toThrow('"workspace"');
    });
});

describe("parseWorkspaceTree", () => {
    it("should detect folders by trailing slash in name", () => {
        const entries = parseWorkspaceTree([{ name: "Folder/" }, { name: "File.md" }]);
        expect(entries[0].isFolder).toBe(true);
        expect(entries[1].isFolder).toBe(false);
    });

    it("should recursively parse children of folders", () => {
        const entries = parseWorkspaceTree([
            { name: "Parent/", children: [{ name: "Child/" }, { name: "file.txt" }] },
        ]);
        expect(entries[0].children).toHaveLength(2);
        expect(entries[0].children![0].isFolder).toBe(true);
        expect(entries[0].children![1].isFolder).toBe(false);
    });

    it("should accept a folder with no children defined", () => {
        const entries = parseWorkspaceTree([{ name: "EmptyFolder/" }]);
        expect(entries[0].isFolder).toBe(true);
        expect(entries[0].children).toBeUndefined();
    });

    it("should throw when a file entry has children", () => {
        expect(() =>
            parseWorkspaceTree([{ name: "file.md", children: [{ name: "other.md" }] }])
        ).toThrow('File entry "file.md" cannot have children');
    });

    it("should throw when an entry is missing the name field", () => {
        expect(() => parseWorkspaceTree([{ description: "no name" }])).toThrow('"name"');
    });

    it("should throw when the input is not an array", () => {
        expect(() => parseWorkspaceTree({ name: "not-array" })).toThrow("must be an array");
    });

    it("should return an empty array for an empty workspace", () => {
        expect(parseWorkspaceTree([])).toEqual([]);
    });
});

describe("parseDecorationRules", () => {
    it("should parse a valid decoration rule with filter, color, and badge", () => {
        const rules = parseDecorationRules([{ filter: "Folder/", color: "charts.green", badge: "TD" }]);
        expect(rules).toHaveLength(1);
        expect(rules[0]).toEqual({ filter: "Folder/", color: "charts.green", badge: "TD" });
    });

    it("should parse a rule with filter only", () => {
        const rules = parseDecorationRules([{ filter: "*.todo" }]);
        expect(rules[0]).toEqual({ filter: "*.todo" });
    });

    it("should return empty array when decorations section is null", () => {
        expect(parseDecorationRules(null)).toEqual([]);
    });

    it("should return empty array when decorations section is undefined", () => {
        expect(parseDecorationRules(undefined)).toEqual([]);
    });

    it("should throw when decorations is not an array", () => {
        expect(() => parseDecorationRules({ filter: "f/" })).toThrow("must be an array");
    });

    it("should throw when a rule is missing the filter field", () => {
        expect(() => parseDecorationRules([{ color: "charts.green" }])).toThrow('"filter"');
    });

    it("should throw when badge is longer than 2 characters", () => {
        expect(() => parseDecorationRules([{ filter: "f/", badge: "ABC" }])).toThrow("≤2 characters");
    });

    it("should accept a badge of exactly 2 characters", () => {
        const rules = parseDecorationRules([{ filter: "f/", badge: "AB" }]);
        expect(rules[0].badge).toBe("AB");
    });

    it("should accept a badge that is a single emoji (1 code point)", () => {
        // Single emoji like 📁 is 2 UTF-16 code units but 1 Unicode code point — must be accepted.
        const rules = parseDecorationRules([{ filter: "f/", badge: "📁" }]);
        expect(rules[0].badge).toBe("📁");
    });

    it("should throw when color is an empty string", () => {
        expect(() => parseDecorationRules([{ filter: "f/", color: "" }])).toThrow('"color"');
    });
});
