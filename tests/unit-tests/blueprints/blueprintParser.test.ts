import { describe, it, expect } from "vitest";
import { parseBlueprintYaml, parseWorkspaceTree, parseDecorationRules, parseFeatures } from "../../../src/blueprints/blueprintParser";

// blueprintParser is pure logic with no VS Code API dependency — no mocks needed.

describe("parseBlueprintYaml", () => {
    it("should parse a valid blueprint YAML with workspace and features", () => {
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
features:
  - id: "decorations"
    name: "Explorer Decorations"
    description: "Badges and colors"
    enabledByDefault: true
    rules:
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
        expect(result.features).toHaveLength(1);
        expect(result.features[0].id).toBe("decorations");
    });

    it("should throw when features field is missing", () => {
        const yaml = `
id: "test-blueprint"
name: "Test"
description: "desc"
version: "1.0.0"
workspace:
  - name: "File.md"
`;
        expect(() => parseBlueprintYaml(yaml)).toThrow('"features"');
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

    it("should parse a rule with a tooltip", () => {
        const rules = parseDecorationRules([{ filter: "Folder/", tooltip: "My folder" }]);
        expect(rules[0].tooltip).toBe("My folder");
    });

    it("should throw when tooltip is an empty string", () => {
        expect(() => parseDecorationRules([{ filter: "f/", tooltip: "" }])).toThrow('"tooltip"');
    });

    it("should throw when tooltip is not a string", () => {
        expect(() => parseDecorationRules([{ filter: "f/", tooltip: 42 }])).toThrow('"tooltip"');
    });

    it("should parse a rule with propagate: true", () => {
        const rules = parseDecorationRules([{ filter: "Folder/", color: "charts.blue", propagate: true }]);
        expect(rules[0].propagate).toBe(true);
    });

    it("should parse a rule with propagate: false", () => {
        const rules = parseDecorationRules([{ filter: "Folder/", color: "charts.blue", propagate: false }]);
        expect(rules[0].propagate).toBe(false);
    });

    it("should throw when propagate is not a boolean", () => {
        expect(() => parseDecorationRules([{ filter: "f/", propagate: "yes" }])).toThrow('"propagate"');
    });

    it("should omit propagate when not present", () => {
        const rules = parseDecorationRules([{ filter: "f/", color: "charts.blue" }]);
        expect(rules[0].propagate).toBeUndefined();
    });
});

describe("parseFeatures", () => {
    it("should parse a valid decorations feature", () => {
        const features = parseFeatures([
            {
                id: "decorations",
                name: "Explorer Decorations",
                description: "Badges and colors",
                enabledByDefault: true,
                rules: [{ filter: "Folder/", color: "charts.green" }],
            },
        ]);
        expect(features).toHaveLength(1);
        expect(features[0].id).toBe("decorations");
        expect(features[0].name).toBe("Explorer Decorations");
        expect(features[0].enabledByDefault).toBe(true);
        expect(features[0].rules).toHaveLength(1);
    });

    it("should throw when entry is not an object", () => {
        expect(() => parseFeatures(["not-an-object"])).toThrow("must be an object");
    });

    it("should throw when id is missing", () => {
        expect(() => parseFeatures([{ name: "N", description: "D", enabledByDefault: true }])).toThrow('"id"');
    });

    it("should throw when name is missing", () => {
        expect(() => parseFeatures([{ id: "decorations", description: "D", enabledByDefault: true }])).toThrow('"name"');
    });

    it("should throw when description is missing", () => {
        expect(() => parseFeatures([{ id: "decorations", name: "N", enabledByDefault: true }])).toThrow('"description"');
    });

    it("should throw when enabledByDefault is missing", () => {
        expect(() => parseFeatures([{ id: "decorations", name: "N", description: "D" }])).toThrow('"enabledByDefault"');
    });

    it("should throw when enabledByDefault is not a boolean", () => {
        expect(() => parseFeatures([{ id: "decorations", name: "N", description: "D", enabledByDefault: "yes" }])).toThrow('"enabledByDefault"');
    });

    it("should throw for unknown feature id", () => {
        expect(() =>
            parseFeatures([{ id: "unknown-feature", name: "N", description: "D", enabledByDefault: true }])
        ).toThrow('unknown feature id "unknown-feature"');
    });

    it("should accept enabledByDefault: false", () => {
        const features = parseFeatures([
            {
                id: "decorations",
                name: "N",
                description: "D",
                enabledByDefault: false,
                rules: [],
            },
        ]);
        expect(features[0].enabledByDefault).toBe(false);
    });
});
