import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock fs module  
const existsSyncMock = vi.fn();
const readFileSyncMock = vi.fn();
const readdirSyncMock = vi.fn();
const writeFileSyncMock = vi.fn();
const stdoutWriteMock = vi.fn();
const stderrWriteMock = vi.fn();
const exitMock = vi.fn().mockImplementation(() => { throw new Error("process.exit"); });

vi.mock("fs", () => ({
    existsSync: (...a: any[]) => existsSyncMock(...a),
    readFileSync: (...a: any[]) => readFileSyncMock(...a),
    readdirSync: (...a: any[]) => readdirSyncMock(...a),
    writeFileSync: (...a: any[]) => writeFileSyncMock(...a),
    mkdirSync: vi.fn(),
}));

// Mock renderTemplate and all other heavy deps to prevent auto-loading
vi.mock("../../src/features/snippets/templates/templateEngine", () => ({
    renderTemplate: vi.fn().mockResolvedValue({ text: "", scope: {}, diagnostics: [] }),
}));
vi.mock("../../src/features/snippets/templates/templateParser", () => ({
    parseTemplate: vi.fn().mockReturnValue({ title: "Test", entries: [] }),
    parseFunctionCall: vi.fn().mockReturnValue({ functionName: "Test", args: [] }),
}));
vi.mock("../../src/features/snippets/templates/coreBuiltins", () => ({ CORE_BUILTINS: [] }));
vi.mock("../../src/features/snippets/templates/functionLoader", () => ({
    compileFunctionSource: vi.fn().mockReturnValue([]),
    validateFunctions: vi.fn(),
}));
vi.mock("../../src/features/snippets/peopleFunctions", () => ({ createPeopleFunctions: vi.fn().mockReturnValue([]) }));
vi.mock("../../src/cli/diskContactsProvider", () => ({
    DiskContactsProvider: { fromBlueprintManifest: vi.fn().mockReturnValue(null) },
}));
vi.mock("../../src/cli/cliInputResolver", () => ({
    CliInputResolver: class { resolve() { return Promise.resolve(""); } },
}));

import {
    parseCliArgs,
    parseParams,
    resolveOutputPath,
    discoverTemplateFiles,
    readEngineConfig,
    readTemplatesFolderFromManifest,
} from "../../src/template-cli";

const WORKSPACE = "/workspace";

beforeEach(() => {
    vi.clearAllMocks();
    existsSyncMock.mockReturnValue(false);
    readFileSyncMock.mockReturnValue("");
    readdirSyncMock.mockReturnValue([]);
});

describe("template-cli pure helpers", () => {
    describe("parseCliArgs", () => {
        it("parses positional arguments", () => {
            const result = parseCliArgs(["my-template.md"]);
            expect(result["_"]).toEqual(["my-template.md"]);
        });

        it("parses --key value pairs", () => {
            const result = parseCliArgs(["--root", "/workspace", "--params", "{}"]);
            expect(result["root"]).toBe("/workspace");
            expect(result["params"]).toBe("{}");
        });

        it("parses --flag (boolean flag)", () => {
            const result = parseCliArgs(["--force"]);
            expect(result["force"]).toBe(true);
        });

        it("handles mixed positional and flags", () => {
            const result = parseCliArgs(["template.md", "--out", "output.md", "--force"]);
            expect(result["_"]).toEqual(["template.md"]);
            expect(result["out"]).toBe("output.md");
            expect(result["force"]).toBe(true);
        });

        it("treats next --arg as value-less flag when followed by another --arg", () => {
            const result = parseCliArgs(["--verbose", "--root", "/ws"]);
            expect(result["verbose"]).toBe(true);
            expect(result["root"]).toBe("/ws");
        });

        it("returns empty positionals and no flags for empty args", () => {
            const result = parseCliArgs([]);
            expect(result["_"]).toEqual([]);
        });
    });

    describe("parseParams", () => {
        it("returns empty object when paramsJson is undefined", () => {
            const result = parseParams(undefined);
            expect(result).toEqual({});
        });

        it("parses valid JSON params", () => {
            const result = parseParams('{"key": "value", "name": "Alice"}');
            expect(result["key"]).toBe("value");
            expect(result["name"]).toBe("Alice");
        });

        it("calls process.exit(1) on invalid JSON", () => {
            stderrWriteMock.mockImplementation(() => {});
            expect(() => parseParams("not valid json")).toThrow("process.exit");
        });
    });

    describe("resolveOutputPath", () => {
        it("resolves relative path against cwd and allows it within cwd-based workspace", () => {
            // Use cwd as workspace root so relative output is within it
            const cwd = process.cwd();
            const result = resolveOutputPath("output.md", cwd);
            expect(typeof result).toBe("string");
            expect(result.endsWith("output.md")).toBe(true);
        });

        it("passes through absolute path within workspace", () => {
            const result = resolveOutputPath("/workspace/output.md", "/workspace");
            expect(result).toBe("/workspace/output.md");
        });

        it("calls process.exit(1) when path is outside workspace", () => {
            expect(() => resolveOutputPath("/other/output.md", "/workspace")).toThrow("process.exit");
        });
    });

    describe("discoverTemplateFiles", () => {
        it("returns empty array when folder does not exist", () => {
            existsSyncMock.mockReturnValue(false);
            const result = discoverTemplateFiles("/workspace/.memoria/templates", "");
            expect(result).toEqual([]);
        });

        it("returns .md files in folder", () => {
            existsSyncMock.mockReturnValue(true);
            readdirSyncMock.mockReturnValue([
                { name: "hello.md", isDirectory: () => false, isFile: () => true },
                { name: "world.md", isDirectory: () => false, isFile: () => true },
            ]);
            const result = discoverTemplateFiles("/workspace/.memoria/templates", "");
            expect(result).toHaveLength(2);
            expect(result.map((r) => r.relativePath)).toContain("hello.md");
        });

        it("skips entries starting with _", () => {
            existsSyncMock.mockReturnValue(true);
            readdirSyncMock.mockReturnValue([
                { name: "_functions", isDirectory: () => true, isFile: () => false },
                { name: "valid.md", isDirectory: () => false, isFile: () => true },
            ]);
            const result = discoverTemplateFiles("/workspace/.memoria/templates", "");
            expect(result).toHaveLength(1);
            expect(result[0].relativePath).toBe("valid.md");
        });

        it("skips non-md files", () => {
            existsSyncMock.mockReturnValue(true);
            readdirSyncMock.mockReturnValue([
                { name: "config.json", isDirectory: () => false, isFile: () => true },
                { name: "template.md", isDirectory: () => false, isFile: () => true },
            ]);
            const result = discoverTemplateFiles("/workspace/.memoria/templates", "");
            expect(result).toHaveLength(1);
        });

        it("recurses into subdirectories", () => {
            existsSyncMock.mockReturnValue(true);
            let callCount = 0;
            readdirSyncMock.mockImplementation((dirPath: string) => {
                callCount++;
                if (callCount === 1) {
                    return [{ name: "subfolder", isDirectory: () => true, isFile: () => false }];
                }
                return [{ name: "nested.md", isDirectory: () => false, isFile: () => true }];
            });
            const result = discoverTemplateFiles("/workspace/.memoria/templates", "");
            expect(result).toHaveLength(1);
            expect(result[0].relativePath).toBe("subfolder/nested.md");
        });

        it("uses prefix to build relative path", () => {
            existsSyncMock.mockReturnValue(true);
            readdirSyncMock.mockReturnValue([
                { name: "template.md", isDirectory: () => false, isFile: () => true },
            ]);
            const result = discoverTemplateFiles("/workspace/.memoria/templates/interviews", "interviews");
            expect(result[0].relativePath).toBe("interviews/template.md");
        });
    });

    describe("readEngineConfig", () => {
        it("returns null when config file does not exist", () => {
            existsSyncMock.mockReturnValue(false);
            const result = readEngineConfig();
            expect(result).toBeNull();
        });

        it("returns parsed config when file exists", () => {
            existsSyncMock.mockReturnValue(true);
            readFileSyncMock.mockReturnValue(JSON.stringify({ node: "/usr/bin/node", cli: "/workspace/dist/template-cli.cjs" }));
            const result = readEngineConfig();
            expect(result).not.toBeNull();
            expect(result?.["node"]).toBe("/usr/bin/node");
        });

        it("returns null when config file has invalid JSON", () => {
            existsSyncMock.mockReturnValue(true);
            readFileSyncMock.mockReturnValue("invalid json");
            const result = readEngineConfig();
            expect(result).toBeNull();
        });
    });

    describe("readTemplatesFolderFromManifest", () => {
        it("returns null when blueprint.json does not exist", () => {
            existsSyncMock.mockReturnValue(false);
            const result = readTemplatesFolderFromManifest(WORKSPACE);
            expect(result).toBeNull();
        });

        it("returns templatesFolder from manifest", () => {
            existsSyncMock.mockReturnValue(true);
            readFileSyncMock.mockReturnValue(JSON.stringify({
                snippets: { templatesFolder: ".memoria/templates" },
            }));
            const result = readTemplatesFolderFromManifest(WORKSPACE);
            expect(result).toBe(".memoria/templates");
        });

        it("returns null when snippets.templatesFolder is absent", () => {
            existsSyncMock.mockReturnValue(true);
            readFileSyncMock.mockReturnValue(JSON.stringify({ snippets: {} }));
            const result = readTemplatesFolderFromManifest(WORKSPACE);
            expect(result).toBeNull();
        });

        it("returns null when snippets key is absent", () => {
            existsSyncMock.mockReturnValue(true);
            readFileSyncMock.mockReturnValue(JSON.stringify({ contacts: {} }));
            const result = readTemplatesFolderFromManifest(WORKSPACE);
            expect(result).toBeNull();
        });

        it("returns null when JSON is invalid", () => {
            existsSyncMock.mockReturnValue(true);
            readFileSyncMock.mockReturnValue("not json");
            const result = readTemplatesFolderFromManifest(WORKSPACE);
            expect(result).toBeNull();
        });
    });
});
