import { describe, it, expect } from "vitest";
import { CliInputResolver } from "../../../src/cli/cliInputResolver";
import type { TemplateInput } from "../../../src/features/snippets/templates/templateTypes";


const freeTextInput = (label = "Enter text", defaultVal?: string): TemplateInput => ({
    name: "value",
    kind: "freeText",
    label,
    default: defaultVal,
});

const pickInput = (options: { value: string; label: string }[] = [], defaultVal?: string): TemplateInput => ({
    name: "choice",
    kind: "pick",
    label: "Choose",
    options,
    default: defaultVal,
});

describe("CliInputResolver", () => {
    describe("pre-supplied params", () => {
        it("returns param value when qualifiedKey is in params", async () => {
            const resolver = new CliInputResolver({ "entry.value": "pre-set" }, false);
            const result = await resolver.resolve(freeTextInput(), "entry.value");
            expect(result).toBe("pre-set");
        });

        it("returns param value even when interactive mode is active", async () => {
            const resolver = new CliInputResolver({ "entry.value": "pre-set" }, true);
            const result = await resolver.resolve(freeTextInput(), "entry.value");
            expect(result).toBe("pre-set");
        });
    });

    describe("non-interactive mode (no params)", () => {
        it("returns default value when available", async () => {
            const resolver = new CliInputResolver({}, false);
            const result = await resolver.resolve(freeTextInput("Label", "myDefault"), "entry.value");
            expect(result).toBe("myDefault");
        });

        it("throws when no default and non-interactive", async () => {
            const resolver = new CliInputResolver({}, false);
            await expect(resolver.resolve(freeTextInput("Name"), "entry.value")).rejects.toThrow(
                'Missing required input "entry.value"'
            );
        });

        it("throws error message with qualified key suggestion", async () => {
            const resolver = new CliInputResolver({}, false);
            await expect(resolver.resolve(freeTextInput("Name"), "entry.name")).rejects.toThrow(
                "--params"
            );
        });

        it("uses pick input default when options empty and non-interactive", async () => {
            const resolver = new CliInputResolver({}, false);
            const result = await resolver.resolve(pickInput([], "pickDefault"), "entry.choice");
            expect(result).toBe("pickDefault");
        });
    });

    describe("param presence check", () => {
        it("uses own property check (not prototype chain)", async () => {
            // Create a resolver with explicit params
            const params: Record<string, string> = {};
            Object.setPrototypeOf(params, { "entry.value": "inherited" });
            const resolver = new CliInputResolver(params, false);
            // Should NOT find inherited property, should use default
            const input = freeTextInput("Name", "default");
            const result = await resolver.resolve(input, "entry.value");
            expect(result).toBe("default");
        });
    });
});
