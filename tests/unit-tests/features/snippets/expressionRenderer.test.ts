import { describe, it, expect } from "vitest";
import { renderExpressions, resolveExpression } from "../../../../src/features/snippets/templates/expressionRenderer";
import type { TemplateFunction } from "../../../../src/features/snippets/templates/templateTypes";

const noFunctions: TemplateFunction[] = [];

function makeFn(name: string, display?: (r: unknown) => string): TemplateFunction {
    return {
        name,
        describeInputs: () => [],
        resolve: () => ({}),
        display,
    };
}

describe("expressionRenderer", () => {
    describe("renderExpressions", () => {
        it("substitutes a simple {{name}} from scope", () => {
            const diagnostics: string[] = [];
            const result = renderExpressions("Hello {{name}}", { name: "World" }, noFunctions, diagnostics);
            expect(result).toBe("Hello World");
            expect(diagnostics).toHaveLength(0);
        });

        it("substitutes {{name.prop}} nested property", () => {
            const diagnostics: string[] = [];
            const scope = { person: { fullName: "Alice Smith" } };
            const result = renderExpressions("Hi {{person.fullName}}", scope, noFunctions, diagnostics);
            expect(result).toBe("Hi Alice Smith");
        });

        it("substitutes {{a.b.c}} deep nested path", () => {
            const diagnostics: string[] = [];
            const scope = { contact: { resolvedPronouns: { subject: "she" } } };
            const result = renderExpressions("{{contact.resolvedPronouns.subject}}", scope, noFunctions, diagnostics);
            expect(result).toBe("she");
        });

        it("emits unknown marker for undeclared name", () => {
            const diagnostics: string[] = [];
            const result = renderExpressions("{{unknown}}", {}, noFunctions, diagnostics);
            expect(result).toContain("⚠️");
            expect(diagnostics).toHaveLength(1);
        });

        it("emits unknown marker for missing nested property", () => {
            const diagnostics: string[] = [];
            const scope = { person: { name: "Alice" } };
            const result = renderExpressions("{{person.missing}}", scope, noFunctions, diagnostics);
            expect(result).toContain("⚠️");
            expect(diagnostics).toHaveLength(1);
        });

        it("emits non-text marker for object without display()", () => {
            const diagnostics: string[] = [];
            const scope = { obj: { nested: "val" } };
            const result = renderExpressions("{{obj}}", scope, noFunctions, diagnostics);
            expect(result).toContain("⚠️");
            expect(result).toContain("is not text");
        });

        it("uses display() from matching function", () => {
            const diagnostics: string[] = [];
            const scope = { person: { id: "alice", fullName: "Alice" } };
            const fns = [makeFn("person", (r: unknown) => (r as Record<string, unknown>).fullName as string)];
            const result = renderExpressions("{{person}}", scope, fns, diagnostics);
            expect(result).toBe("Alice");
        });

        it("converts numbers to string", () => {
            const diagnostics: string[] = [];
            const result = renderExpressions("{{level}}", { level: 42 }, noFunctions, diagnostics);
            expect(result).toBe("42");
        });

        it("converts boolean to string", () => {
            const diagnostics: string[] = [];
            const result = renderExpressions("{{flag}}", { flag: true }, noFunctions, diagnostics);
            expect(result).toBe("true");
        });

        it("handles multiple expressions in one string", () => {
            const diagnostics: string[] = [];
            const scope = { first: "Hello", last: "World" };
            const result = renderExpressions("{{first}} {{last}}", scope, noFunctions, diagnostics);
            expect(result).toBe("Hello World");
        });

        it("emits unknown marker when path traverses non-object", () => {
            const diagnostics: string[] = [];
            const scope = { name: "alice" };
            const result = renderExpressions("{{name.deep}}", scope, noFunctions, diagnostics);
            expect(result).toContain("⚠️");
        });
    });

    describe("resolveExpression", () => {
        it("resolves a simple string value", () => {
            const diagnostics: string[] = [];
            const result = resolveExpression("name", { name: "Alice" }, noFunctions, diagnostics);
            expect(result).toBe("Alice");
        });

        it("resolves nested path", () => {
            const diagnostics: string[] = [];
            const scope = { contact: { fullName: "Alice" } };
            const result = resolveExpression("contact.fullName", scope, noFunctions, diagnostics);
            expect(result).toBe("Alice");
        });

        it("returns unknown marker for missing root", () => {
            const diagnostics: string[] = [];
            const result = resolveExpression("missing", {}, noFunctions, diagnostics);
            expect(result).toContain("⚠️");
            expect(diagnostics).toHaveLength(1);
        });

        it("returns non-text marker for null at leaf", () => {
            const diagnostics: string[] = [];
            const scope = { obj: { val: null } };
            const result = resolveExpression("obj.val", scope, noFunctions, diagnostics);
            expect(result).toContain("⚠️");
        });

        it("stringifies number at leaf level", () => {
            const diagnostics: string[] = [];
            const scope = { obj: { count: 42 } };
            const result = resolveExpression("obj.count", scope, noFunctions, diagnostics);
            expect(result).toBe("42");
            expect(diagnostics).toHaveLength(0);
        });

        it("stringifies boolean at leaf level", () => {
            const diagnostics: string[] = [];
            const scope = { obj: { flag: true } };
            const result = resolveExpression("obj.flag", scope, noFunctions, diagnostics);
            expect(result).toBe("true");
            expect(diagnostics).toHaveLength(0);
        });
    });
});
