/**
 * CliInputResolver — resolves template inputs from --params JSON or prompts in-terminal.
 * No vscode imports.
 */

import * as readline from "readline";
import type { InputResolver, TemplateInput } from "../features/snippets/templates/templateTypes";

export class CliInputResolver implements InputResolver {
    constructor(
        private readonly params: Record<string, string> = {},
        private readonly interactive: boolean = process.stdin.isTTY === true,
    ) {}

    async resolve(input: TemplateInput, qualifiedKey: string): Promise<string | undefined> {
        // Check if value was pre-supplied via --params
        if (Object.hasOwn(this.params, qualifiedKey)) {
            return this.params[qualifiedKey];
        }

        // Use default if available
        if (input.default !== undefined && !this.interactive) {
            return input.default;
        }

        // In non-interactive mode, fail with a descriptive error
        if (!this.interactive) {
            throw new Error(
                `Missing required input "${qualifiedKey}". ` +
                `Supply it via --params '{"${qualifiedKey}": "value"}'.`
            );
        }

        // Interactive: prompt in-terminal
        return this.promptInteractive(input, qualifiedKey);
    }

    private promptInteractive(input: TemplateInput, qualifiedKey: string): Promise<string> {
        return new Promise((resolve) => {
            const rl = readline.createInterface({
                input: process.stdin,
                output: process.stderr,
            });

            if (input.kind === "pick" && input.options?.length) {
                const optionsList = input.options
                    .map((o, i) => `  ${i + 1}. ${o.label}${o.detail ? ` (${o.detail})` : ""}`)
                    .join("\n");
                process.stderr.write(`${input.label} [${qualifiedKey}]:\n${optionsList}\nEnter choice number: `);
                rl.question("", (answer) => {
                    rl.close();
                    const idx = parseInt(answer.trim(), 10) - 1;
                    if (idx >= 0 && idx < (input.options?.length ?? 0)) {
                        resolve(input.options![idx].value);
                    } else {
                        resolve(input.options![0]?.value ?? "");
                    }
                });
            } else {
                rl.question(`${input.label} [${qualifiedKey}]: `, (answer) => {
                    rl.close();
                    resolve(answer);
                });
            }
        });
    }
}
