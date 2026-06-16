import { describe, it, expect } from "vitest";
import { renderTemplate } from "../../../../src/features/snippets/templates/templateEngine";
import type { InputResolver, TemplateFunction, TemplateInput } from "../../../../src/features/snippets/templates/templateTypes";

// Fake InputResolver that uses a pre-supplied answers map
function fakeResolver(answers: Record<string, string>): InputResolver {
    return {
        async resolve(_input: TemplateInput, qualifiedKey: string): Promise<string | undefined> {
            return answers[qualifiedKey] ?? _input.default ?? "";
        },
    };
}

// Resolver that always cancels
const cancelResolver: InputResolver = {
    async resolve(): Promise<undefined> {
        return undefined;
    },
};

describe("templateEngine", () => {
    describe("renderTemplate", () => {
        it("renders a body-only template", async () => {
            const result = await renderTemplate({
                templateText: "Hello world",
                inputResolver: fakeResolver({}),
                functions: [],
            });
            expect(result.text).toBe("Hello world");
            expect(result.diagnostics).toHaveLength(0);
        });

        it("renders a template with FreeText", async () => {
            const text = "---\nname: FreeText()\n---\nHello {{name}}";
            const result = await renderTemplate({
                templateText: text,
                inputResolver: fakeResolver({ "name.value": "Alice" }),
                functions: [],
            });
            expect(result.text).toBe("Hello Alice");
        });

        it("renders IfWithin that returns text", async () => {
            const text = "---\ncond: IfWithin(30d, 2026-01-01, \"New!\")---\n{{cond}}";
            // Actually let me use a valid template
            const text2 = "---\ncond: IfWithin(30d, 2026-01-10, \"New!\")\n---\n{{cond}}";
            const result = await renderTemplate({
                templateText: text2,
                inputResolver: fakeResolver({}),
                functions: [],
                now: new Date("2026-01-15"),
            });
            expect(result.text).toBe("New!");
        });

        it("renders IfWithin that returns empty string", async () => {
            const text = "---\ncond: IfWithin(5d, 2025-01-01, \"Old!\")\n---\n{{cond}}";
            const result = await renderTemplate({
                templateText: text,
                inputResolver: fakeResolver({}),
                functions: [],
                now: new Date("2026-01-15"),
            });
            expect(result.text).toBe("");
        });

        it("returns empty text and empty scope on cancellation", async () => {
            const text = "---\nname: FreeText()\n---\nHello {{name}}";
            const result = await renderTemplate({
                templateText: text,
                inputResolver: cancelResolver,
                functions: [],
            });
            expect(result.text).toBe("");
            expect(Object.keys(result.scope)).toHaveLength(0);
        });

        it("resolves entries in dependency order", async () => {
            // greeting depends on name
            const greetFn: TemplateFunction = {
                name: "Greet",
                describeInputs: () => [],
                resolve: (_inputs, ctx) => {
                    const name = ctx.scope["name"] as string;
                    return `Hello ${name}`;
                },
            };

            const text = "---\ngreeting: Greet({{name}})\nname: FreeText()\n---\n{{greeting}}";
            const result = await renderTemplate({
                templateText: text,
                inputResolver: fakeResolver({ "name.value": "Bob" }),
                functions: [greetFn],
            });
            expect(result.text).toBe("Hello Bob");
        });

        it("throws for circular dependency", async () => {
            // a depends on b, b depends on a
            const fn: TemplateFunction = {
                name: "Dep",
                describeInputs: () => [],
                resolve: (_inputs, ctx) => ctx.scope["b"] ?? "",
            };

            const text = "---\na: Dep({{b}})\nb: Dep({{a}})\n---\nBody";
            await expect(
                renderTemplate({
                    templateText: text,
                    inputResolver: fakeResolver({}),
                    functions: [fn],
                })
            ).rejects.toThrow("circular dependency");
        });

        it("throws for unknown function", async () => {
            const text = "---\nx: UnknownFunc()\n---\nBody";
            await expect(
                renderTemplate({
                    templateText: text,
                    inputResolver: fakeResolver({}),
                    functions: [],
                })
            ).rejects.toThrow("Unknown function");
        });

        it("includes diagnostics for unknown body references", async () => {
            const text = "---\nname: FreeText()\n---\nHello {{unknown}}";
            const result = await renderTemplate({
                templateText: text,
                inputResolver: fakeResolver({ "name.value": "test" }),
                functions: [],
            });
            expect(result.diagnostics).toHaveLength(1);
            expect(result.text).toContain("⚠️");
        });

        it("resolves multiple entries correctly", async () => {
            const text = "---\nfirst: FreeText()\nsecond: FreeText()\n---\n{{first}} and {{second}}";
            const result = await renderTemplate({
                templateText: text,
                inputResolver: fakeResolver({
                    "first.value": "Hello",
                    "second.value": "World",
                }),
                functions: [],
            });
            expect(result.text).toBe("Hello and World");
        });

        it("prompts independent entries in frontmatter top-to-bottom order", async () => {
            const promptOrder: string[] = [];
            const trackingResolver: InputResolver = {
                async resolve(_input: TemplateInput, qualifiedKey: string): Promise<string> {
                    promptOrder.push(qualifiedKey);
                    return qualifiedKey.startsWith("alpha") ? "A" : qualifiedKey.startsWith("beta") ? "B" : "C";
                },
            };

            const text = "---\nalpha: FreeText()\nbeta: FreeText()\ngamma: FreeText()\n---\n{{alpha}} {{beta}} {{gamma}}";
            const result = await renderTemplate({
                templateText: text,
                inputResolver: trackingResolver,
                functions: [],
            });
            expect(result.text).toBe("A B C");
            expect(promptOrder).toEqual(["alpha.value", "beta.value", "gamma.value"]);
        });

        it("scope is populated with resolved entries", async () => {
            const text = "---\nname: FreeText()\n---\n{{name}}";
            const result = await renderTemplate({
                templateText: text,
                inputResolver: fakeResolver({ "name.value": "Alice" }),
                functions: [],
            });
            expect(result.scope["name"]).toBe("Alice");
        });

        it("host functions take precedence over core builtins with same name", async () => {
            // If a host registers FreeText, the engine should use it (core built-ins are added last)
            const customFreeText: TemplateFunction = {
                name: "FreeText",
                describeInputs: () => [],
                resolve: () => "custom",
            };

            const text = "---\nx: FreeText()\n---\n{{x}}";
            const result = await renderTemplate({
                templateText: text,
                inputResolver: fakeResolver({}),
                functions: [customFreeText],
            });
            // The host function was registered first, so it's used
            expect(result.text).toBe("custom");
        });

        it("renders cross-reference in quoted string arg", async () => {
            const text = "---\nname: FreeText()\ngreeting: FreeText(\"Hello {{name}}\")\n---\n{{greeting}}";
            const result = await renderTemplate({
                templateText: text,
                inputResolver: fakeResolver({
                    "name.value": "Alice",
                    "greeting.value": "Hello Alice", // the label becomes the value
                }),
                functions: [],
            });
            // The FreeText for greeting uses its collected value, not the arg
            expect(result.text).toBe("Hello Alice");
        });

        it("cancels when dynamic resolveOptions input returns undefined", async () => {
            // A function with a dynamic options input that cancels
            const fnWithDynamic: TemplateFunction = {
                name: "DynPick",
                describeInputs: () => [{
                    name: "choice",
                    kind: "pick",
                    label: "Choose",
                    resolveOptions: async (_ctx) => [{ value: "a", label: "A" }],
                }],
                resolve: (_inputs, _ctx) => "done",
            };

            const text = "---\nx: DynPick()\n---\n{{x}}";
            const result = await renderTemplate({
                templateText: text,
                inputResolver: cancelResolver,
                functions: [fnWithDynamic],
            });
            // cancelled
            expect(result.text).toBe("");
        });

        it("handles a reference arg in a function call", async () => {
            // A function that uses a {{ref}} arg - this tests the isReference branch in buildArgs
            const refFn: TemplateFunction = {
                name: "UseRef",
                describeInputs: () => [],
                resolve: (_inputs, ctx) => ctx.args[0]?.value ?? "",
            };

            const text = "---\nname: FreeText()\nresult: UseRef({{name}})\n---\n{{result}}";
            const result = await renderTemplate({
                templateText: text,
                inputResolver: fakeResolver({ "name.value": "Alice" }),
                functions: [refFn],
            });
            expect(result.text).toBe("Alice");
        });

        it("renders number value in scope", async () => {
            // Test number values in scope are stringified in the body
            const numFn: TemplateFunction = {
                name: "NumFn",
                describeInputs: () => [],
                resolve: () => 42,
            };

            const text = "---\ncount: NumFn()\n---\nCount: {{count}}";
            const result = await renderTemplate({
                templateText: text,
                inputResolver: fakeResolver({}),
                functions: [numFn],
            });
            expect(result.text).toBe("Count: 42");
        });
    });
});
