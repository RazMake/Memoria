/**
 * VsCodeInputResolver — resolves template inputs via QuickPick/InputBox.
 * Imports vscode; used only in the extension host.
 */

import * as vscode from "vscode";
import type { InputResolver, TemplateInput } from "./templates/templateTypes";

export class VsCodeInputResolver implements InputResolver {
    async resolve(input: TemplateInput, qualifiedKey: string): Promise<string | undefined> {
        if (input.kind === "freeText") {
            const result = await vscode.window.showInputBox({
                title: qualifiedKey,
                prompt: input.label,
                value: input.default ?? "",
            });
            return result; // undefined = cancelled
        }

        // kind === "pick"
        const options = input.options ?? [];
        if (options.length === 0) {
            return input.default ?? "";
        }

        const items = options.map((opt) => ({
            label: opt.label,
            description: opt.detail,
            value: opt.value,
        }));

        const picked = await vscode.window.showQuickPick(items, {
            title: qualifiedKey,
            placeHolder: input.label,
        });

        return picked?.value; // undefined = cancelled
    }
}
