import { describe, it, expect, vi, beforeEach } from "vitest";

const showInputBox = vi.fn();
const showQuickPick = vi.fn();

vi.mock("vscode", () => ({
    window: {
        showInputBox: (...a: any[]) => showInputBox(...a),
        showQuickPick: (...a: any[]) => showQuickPick(...a),
    },
}));

import { VsCodeInputResolver } from "../../../../src/features/snippets/vscodeInputResolver";
import type { TemplateInput } from "../../../../src/features/snippets/templates/templateTypes";

describe("VsCodeInputResolver", () => {
    let resolver: VsCodeInputResolver;

    beforeEach(() => {
        vi.clearAllMocks();
        resolver = new VsCodeInputResolver();
    });

    describe("freeText inputs", () => {
        it("shows InputBox with label and default value", async () => {
            showInputBox.mockResolvedValue("typed text");

            const input: TemplateInput = {
                name: "name",
                kind: "freeText",
                label: "Enter your name",
                default: "Alice",
            };

            const result = await resolver.resolve(input, "entry.name");

            expect(showInputBox).toHaveBeenCalledWith({
                prompt: "Enter your name",
                value: "Alice",
            });
            expect(result).toBe("typed text");
        });

        it("returns undefined when freeText is cancelled", async () => {
            showInputBox.mockResolvedValue(undefined);

            const input: TemplateInput = {
                name: "name",
                kind: "freeText",
                label: "Enter your name",
            };

            const result = await resolver.resolve(input, "entry.name");
            expect(result).toBeUndefined();
        });

        it("uses empty string for default when not provided", async () => {
            showInputBox.mockResolvedValue("value");
            const input: TemplateInput = { name: "x", kind: "freeText", label: "Label" };
            await resolver.resolve(input, "entry.x");
            expect(showInputBox).toHaveBeenCalledWith({ prompt: "Label", value: "" });
        });
    });

    describe("pick inputs", () => {
        it("shows QuickPick with options", async () => {
            showQuickPick.mockResolvedValue({ label: "Option A", value: "a" });

            const input: TemplateInput = {
                name: "choice",
                kind: "pick",
                label: "Pick one",
                options: [
                    { value: "a", label: "Option A" },
                    { value: "b", label: "Option B", detail: "Second option" },
                ],
            };

            const result = await resolver.resolve(input, "entry.choice");

            expect(showQuickPick).toHaveBeenCalledWith(
                [
                    { label: "Option A", description: undefined, value: "a" },
                    { label: "Option B", description: "Second option", value: "b" },
                ],
                { placeHolder: "Pick one" }
            );
            expect(result).toBe("a");
        });

        it("returns undefined when pick is cancelled", async () => {
            showQuickPick.mockResolvedValue(undefined);

            const input: TemplateInput = {
                name: "choice",
                kind: "pick",
                label: "Pick one",
                options: [{ value: "x", label: "X" }],
            };

            const result = await resolver.resolve(input, "entry.choice");
            expect(result).toBeUndefined();
        });

        it("returns default when options list is empty", async () => {
            const input: TemplateInput = {
                name: "choice",
                kind: "pick",
                label: "Pick one",
                options: [],
                default: "fallback",
            };

            const result = await resolver.resolve(input, "entry.choice");
            expect(showQuickPick).not.toHaveBeenCalled();
            expect(result).toBe("fallback");
        });

        it("returns empty string when options empty and no default", async () => {
            const input: TemplateInput = {
                name: "choice",
                kind: "pick",
                label: "Pick one",
                options: [],
            };

            const result = await resolver.resolve(input, "entry.choice");
            expect(result).toBe("");
        });
    });
});
