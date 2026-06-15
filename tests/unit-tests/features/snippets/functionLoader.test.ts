import { describe, it, expect } from "vitest";
import { compileFunctionSource, validateFunctions } from "../../../../src/features/snippets/templates/functionLoader";

describe("functionLoader", () => {
    describe("compileFunctionSource", () => {
        it("compiles a valid TypeScript function file", () => {
            const source = `
import type { TemplateFunction } from "memoria-templates";
const fn: TemplateFunction = {
    name: "MyFunc",
    describeInputs: () => [],
    resolve: () => "result",
};
export default [fn];
`;
            const result = compileFunctionSource(source, {});
            expect(result).toHaveLength(1);
            expect(result[0].name).toBe("MyFunc");
        });

        it("wraps single export in array", () => {
            const source = `
export default {
    name: "SingleFunc",
    describeInputs: () => [],
    resolve: () => "ok",
};
`;
            const result = compileFunctionSource(source, {});
            expect(result).toHaveLength(1);
            expect(result[0].name).toBe("SingleFunc");
        });

        it("filters out invalid entries", () => {
            const source = `export default [null, { name: "valid", describeInputs: () => [], resolve: () => {} }, "string"];`;
            const result = compileFunctionSource(source, {});
            expect(result).toHaveLength(1);
            expect(result[0].name).toBe("valid");
        });

        it("returns empty array for empty default export", () => {
            const source = `export default [];`;
            const result = compileFunctionSource(source, {});
            expect(result).toHaveLength(0);
        });

        it("passes module payload to sandbox", () => {
            const source = `
import { value } from "memoria-templates";
export default [{
    name: "TestFn",
    describeInputs: () => [],
    resolve: (_, ctx) => value,
}];
`;
            const result = compileFunctionSource(source, { value: "from-payload" });
            expect(result).toHaveLength(1);
        });
    });

    describe("validateFunctions", () => {
        it("passes for empty array", () => {
            expect(() => validateFunctions([])).not.toThrow();
        });

        it("passes for unique non-reserved names", () => {
            const fns = [
                { name: "MyFunc", describeInputs: () => [], resolve: () => {} },
                { name: "OtherFunc", describeInputs: () => [], resolve: () => {} },
            ];
            expect(() => validateFunctions(fns as any)).not.toThrow();
        });

        it("throws for built-in name collision: FreeText", () => {
            const fns = [{ name: "FreeText", describeInputs: () => [], resolve: () => {} }];
            expect(() => validateFunctions(fns as any)).toThrow("reserved built-in");
        });

        it("throws for built-in name collision: PeopleSelector", () => {
            const fns = [{ name: "PeopleSelector", describeInputs: () => [], resolve: () => {} }];
            expect(() => validateFunctions(fns as any)).toThrow("reserved built-in");
        });

        it("throws for built-in name collision: IfWithin", () => {
            const fns = [{ name: "IfWithin", describeInputs: () => [], resolve: () => {} }];
            expect(() => validateFunctions(fns as any)).toThrow("reserved built-in");
        });

        it("throws for duplicate names within the array", () => {
            const fns = [
                { name: "MyFunc", describeInputs: () => [], resolve: () => {} },
                { name: "MyFunc", describeInputs: () => [], resolve: () => {} },
            ];
            expect(() => validateFunctions(fns as any)).toThrow("Duplicate function name");
        });

        it("throws when name collides with existingNames", () => {
            const fns = [{ name: "ExistingFunc", describeInputs: () => [], resolve: () => {} }];
            expect(() => validateFunctions(fns as any, new Set(["ExistingFunc"]))).toThrow("Duplicate function name");
        });

        it("passes when names are not in existingNames", () => {
            const fns = [{ name: "NewFunc", describeInputs: () => [], resolve: () => {} }];
            expect(() => validateFunctions(fns as any, new Set(["OtherFunc"]))).not.toThrow();
        });
    });
});
