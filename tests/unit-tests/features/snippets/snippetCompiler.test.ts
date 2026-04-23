import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("vscode", () => ({
    Uri: {
        joinPath: vi.fn((...args: unknown[]) => ({ path: (args as string[]).join("/") })),
    },
    workspace: {
        fs: {
            readFile: vi.fn(),
        },
    },
}));

import { compileSnippetFile } from "../../../../src/features/snippets/snippetCompiler";
import * as vscode from "vscode";

const mockFs = vscode.workspace.fs;

describe("compileSnippetFile", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("should compile and return snippet definitions from a valid file", async () => {
        const source = `
const snippets = [{ trigger: "{test}", label: "Test", glob: "**/*.md", body: "hello" }];
export default snippets;
`;
        vi.mocked(mockFs.readFile).mockResolvedValue(new TextEncoder().encode(source));

        const result = await compileSnippetFile({ path: "/test/snippet.ts" } as any, mockFs);

        expect(result).toHaveLength(1);
        expect(result[0].trigger).toBe("{test}");
        expect(result[0].label).toBe("Test");
        expect(result[0].body).toBe("hello");
    });

    it("should filter out invalid snippet definitions", async () => {
        const source = `
export default [
    { trigger: "{valid}", label: "Valid", glob: "**/*.md", body: "ok" },
    { notATrigger: true },
    { trigger: 123 },
];
`;
        vi.mocked(mockFs.readFile).mockResolvedValue(new TextEncoder().encode(source));

        const result = await compileSnippetFile({ path: "/test.ts" } as any, mockFs);

        expect(result).toHaveLength(1);
        expect(result[0].trigger).toBe("{valid}");
    });

    it("should throw when file contains invalid TypeScript", async () => {
        const source = `export default <<<invalid>>>`;
        vi.mocked(mockFs.readFile).mockResolvedValue(new TextEncoder().encode(source));

        await expect(compileSnippetFile({ path: "/test.ts" } as any, mockFs)).rejects.toThrow();
    });

    it("should return snippet with expand function", async () => {
        const source = `
export default [{
    trigger: "{greet}",
    label: "Greeting",
    glob: "**/*.md",
    expand(ctx: any) { return "Hello, " + (ctx.params.name ?? "world"); },
}];
`;
        vi.mocked(mockFs.readFile).mockResolvedValue(new TextEncoder().encode(source));

        const result = await compileSnippetFile({ path: "/test.ts" } as any, mockFs);

        expect(result).toHaveLength(1);
        expect(result[0].trigger).toBe("{greet}");
        expect(typeof result[0].expand).toBe("function");
        expect(result[0].expand!({ params: { name: "Alice" }, document: null, position: null, contacts: [] }))
            .toBe("Hello, Alice");
    });

    it("should block dangerous require calls", async () => {
        const source = `
const fs = require("fs");
export default [{ trigger: "{bad}", label: "Bad", glob: "**/*.md", body: "x" }];
`;
        vi.mocked(mockFs.readFile).mockResolvedValue(new TextEncoder().encode(source));

        await expect(compileSnippetFile({ path: "/test.ts" } as any, mockFs))
            .rejects.toThrow('Snippet files cannot require "fs"');
    });
});
