import { describe, it, expect, vi, beforeEach } from "vitest";
import { BlueprintRegistry } from "../../../src/blueprints/blueprintRegistry";

// The registry uses vscode.workspace.fs and vscode.Uri — both must be mocked.
const mockReadDirectory = vi.fn();
const mockReadFile = vi.fn();
const mockJoinPath = vi.fn((base: any, ...segments: string[]) => ({
    ...base,
    path: [base.path, ...segments].join("/"),
}));

vi.mock("vscode", () => ({
    workspace: {
        fs: {
            readDirectory: (...args: any[]) => mockReadDirectory(...args),
            readFile: (...args: any[]) => mockReadFile(...args),
        },
    },
    Uri: {
        joinPath: (...args: any[]) => mockJoinPath(...args),
    },
    FileType: {
        Directory: 2,
        File: 1,
    },
}));

const VALID_YAML = `
id: "test-blueprint"
name: "Test Blueprint"
description: "A test blueprint."
version: "1.2.3"
workspace:
  - name: "Folder/"
features:
  - id: "decorations"
    name: "Explorer Decorations"
    description: "Badges and colors"
    enabledByDefault: true
    rules: []
`;

const encoder = new TextEncoder();

describe("BlueprintRegistry", () => {
    const extensionUri = { path: "/ext" } as any;

    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe("listBlueprints", () => {
        it("should return BlueprintInfo for each directory in the blueprints root", async () => {
            mockReadDirectory.mockResolvedValue([
                ["individual-contributor", 2],
                ["people-manager", 2],
            ]);
            mockReadFile.mockResolvedValue(encoder.encode(VALID_YAML));

            const registry = new BlueprintRegistry(extensionUri);
            const blueprints = await registry.listBlueprints();

            expect(blueprints).toHaveLength(2);
            expect(blueprints[0].id).toBe("individual-contributor");
            expect(blueprints[0].name).toBe("Test Blueprint");
            expect(blueprints[0].version).toBe("1.2.3");
        });

        it("should skip non-directory entries", async () => {
            mockReadDirectory.mockResolvedValue([
                ["individual-contributor", 2],
                ["README.md", 1], // FileType.File
            ]);
            mockReadFile.mockResolvedValue(encoder.encode(VALID_YAML));

            const registry = new BlueprintRegistry(extensionUri);
            const blueprints = await registry.listBlueprints();

            expect(blueprints).toHaveLength(1);
            expect(blueprints[0].id).toBe("individual-contributor");
        });

        it("should skip directories starting with underscore (e.g. _shared)", async () => {
            mockReadDirectory.mockResolvedValue([
                ["individual-contributor", 2],
                ["_shared", 2],
            ]);
            mockReadFile.mockResolvedValue(encoder.encode(VALID_YAML));

            const registry = new BlueprintRegistry(extensionUri);
            const blueprints = await registry.listBlueprints();

            expect(blueprints).toHaveLength(1);
            expect(blueprints[0].id).toBe("individual-contributor");
        });

        it("should return an empty list when no blueprint directories exist", async () => {
            mockReadDirectory.mockResolvedValue([]);

            const registry = new BlueprintRegistry(extensionUri);
            const blueprints = await registry.listBlueprints();

            expect(blueprints).toEqual([]);
        });
    });

    describe("getBlueprintDefinition", () => {
        it("should return a full BlueprintDefinition for a known blueprint id", async () => {
            mockReadFile.mockResolvedValue(encoder.encode(VALID_YAML));

            const registry = new BlueprintRegistry(extensionUri);
            const def = await registry.getBlueprintDefinition("individual-contributor");

            expect(def.name).toBe("Test Blueprint");
            expect(def.workspace).toHaveLength(1);
        });

        it("should propagate errors when the blueprint YAML is invalid", async () => {
            mockReadFile.mockResolvedValue(encoder.encode("not: valid: yaml: ["));

            const registry = new BlueprintRegistry(extensionUri);
            await expect(registry.getBlueprintDefinition("bad")).rejects.toThrow();
        });
    });

    describe("getSeedFileContent", () => {
        it("should return file bytes when the seed file exists", async () => {
            const content = encoder.encode("# Seed content");
            mockReadFile.mockResolvedValue(content);

            const registry = new BlueprintRegistry(extensionUri);
            const result = await registry.getSeedFileContent("individual-contributor", "00-ToDo/Main.todo");

            expect(result).toEqual(content);
        });

        it("should return null when the seed file does not exist", async () => {
            mockReadFile.mockRejectedValue(new Error("File not found"));

            const registry = new BlueprintRegistry(extensionUri);
            const result = await registry.getSeedFileContent("individual-contributor", "missing/file.md");

            expect(result).toBeNull();
        });
    });

    describe("getSharedSeedContent", () => {
        it("should return file bytes when the shared seed file exists", async () => {
            const content = encoder.encode("# Shared seed");
            mockReadFile.mockResolvedValue(content);

            const registry = new BlueprintRegistry(extensionUri);
            const result = await registry.getSharedSeedContent("snippets/date-time.ts");

            expect(result).toEqual(content);
            expect(mockJoinPath).toHaveBeenCalledWith(
                expect.objectContaining({ path: expect.stringContaining("blueprints") }),
                "_shared", "snippets", "date-time.ts"
            );
        });

        it("should return null when the shared seed file does not exist", async () => {
            mockReadFile.mockRejectedValue(new Error("File not found"));

            const registry = new BlueprintRegistry(extensionUri);
            const result = await registry.getSharedSeedContent("missing/file.md");

            expect(result).toBeNull();
        });
    });
});
