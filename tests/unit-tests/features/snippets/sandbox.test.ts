import { describe, it, expect } from "vitest";
import { compileSource, BLOCKED_MODULES } from "../../../../src/features/snippets/sandbox";

describe("sandbox", () => {
    describe("compileSource", () => {
        it("compiles a simple TypeScript default export", () => {
            const source = `export default [{ name: "test" }];`;
            const result = compileSource(source, { module: "test-module", payload: {} });
            expect(result).toHaveLength(1);
            expect((result[0] as Record<string, unknown>).name).toBe("test");
        });

        it("returns array from default export array", () => {
            const source = `export default [1, 2, 3];`;
            const result = compileSource(source, { module: "test-module", payload: {} });
            expect(result).toEqual([1, 2, 3]);
        });

        it("wraps non-array default export in array", () => {
            const source = `export default { name: "single" };`;
            const result = compileSource(source, { module: "test-module", payload: {} });
            expect(result).toHaveLength(1);
            expect((result[0] as Record<string, unknown>).name).toBe("single");
        });

        it("returns exported value when using module.exports", () => {
            const source = `
import { value } from "test-module";
export default [{ result: value }];
`;
            const result = compileSource(source, {
                module: "test-module",
                payload: { value: 42 },
            });
            expect(result).toHaveLength(1);
            expect((result[0] as Record<string, unknown>).result).toBe(42);
        });

        it("allows importing the configured module", () => {
            const source = `
import * as mem from "memoria-snippets";
export default [{ fn: mem.greet }];
`;
            const result = compileSource(source, {
                module: "memoria-snippets",
                payload: { greet: () => "hello" },
            });
            expect(result).toHaveLength(1);
        });

        it("allows importing the memoria-templates module", () => {
            const source = `
import type { TemplateFunction } from "memoria-templates";
export default [];
`;
            const result = compileSource(source, {
                module: "memoria-templates",
                payload: {},
            });
            expect(result).toHaveLength(0);
        });

        it("blocks dangerous require: fs", () => {
            const source = `
const fs = require("fs");
export default [];
`;
            expect(() => compileSource(source, { module: "test-module", payload: {} }))
                .toThrow('cannot require "fs"');
        });

        it("blocks dangerous require: child_process", () => {
            const source = `
const cp = require("child_process");
export default [];
`;
            expect(() => compileSource(source, { module: "test-module", payload: {} }))
                .toThrow('cannot require "child_process"');
        });

        it("throws for unknown module import", () => {
            const source = `
const something = require("unknown-module");
export default [];
`;
            expect(() => compileSource(source, { module: "test-module", payload: {} }))
                .toThrow('Unknown module "unknown-module"');
        });

        it("throws for incorrect module name", () => {
            // x must be used so sucrase does not elide the import
            const source = `
import { x } from "wrong-module";
export default [x];
`;
            expect(() => compileSource(source, { module: "test-module", payload: {} }))
                .toThrow("wrong-module");
        });

        it("BLOCKED_MODULES contains expected modules", () => {
            expect(BLOCKED_MODULES.has("fs")).toBe(true);
            expect(BLOCKED_MODULES.has("child_process")).toBe(true);
            expect(BLOCKED_MODULES.has("net")).toBe(true);
            expect(BLOCKED_MODULES.has("os")).toBe(true);
            expect(BLOCKED_MODULES.has("http")).toBe(true);
            expect(BLOCKED_MODULES.has("https")).toBe(true);
        });
    });
});
