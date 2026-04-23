import * as vscode from "vscode";
import { minimatch } from "minimatch";
import type { SnippetDefinition } from "./types";

export interface SnippetProvider {
    getAllSnippets(): SnippetDefinition[];
}

export class SnippetCompletionProvider implements vscode.CompletionItemProvider {
    constructor(private readonly snippetProvider: SnippetProvider) {}

    provideCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
        _token: vscode.CancellationToken,
        context: vscode.CompletionContext,
    ): vscode.CompletionItem[] | undefined {
        const detected = context.triggerCharacter
            ? { char: context.triggerCharacter, col: position.character - context.triggerCharacter.length }
            : this.detectTrigger(document, position);
        if (!detected || (detected.char !== "{" && detected.char !== "@")) return undefined;

        const isContactTrigger = detected.char === "@";
        const relativePath = vscode.workspace.asRelativePath(document.uri, false);

        const snippets = this.snippetProvider.getAllSnippets().filter((s) => {
            const matchesPrefix = isContactTrigger
                ? s.trigger.startsWith("@")
                : s.trigger.startsWith("{");
            return matchesPrefix && minimatch(relativePath, s.glob);
        });

        if (snippets.length === 0) return undefined;

        const triggerStart = new vscode.Position(position.line, detected.col);
        return snippets.map((s) => this.toCompletionItem(s, document, position, triggerStart));
    }

    /** Scan backwards from the cursor to find a `@` or `{` that starts the current token. */
    private detectTrigger(document: vscode.TextDocument, position: vscode.Position): { char: string; col: number } | undefined {
        const lineText = document.lineAt(position.line).text;
        for (let col = position.character - 1; col >= 0; col--) {
            const ch = lineText[col];
            if (ch === "@" || ch === "{") return { char: ch, col };
            // Stop at whitespace — trigger must be part of the same token.
            if (/\s/.test(ch)) return undefined;
        }
        return undefined;
    }

    private toCompletionItem(
        snippet: SnippetDefinition,
        document: vscode.TextDocument,
        position: vscode.Position,
        triggerStart: vscode.Position,
    ): vscode.CompletionItem {
        const item = new vscode.CompletionItem(snippet.label, vscode.CompletionItemKind.Value);
        item.detail = snippet.description;
        item.filterText = snippet.filterText ?? snippet.trigger;
        item.sortText = snippet.trigger;

        // Range starts at the trigger character. As the user continues typing
        // (e.g. `{date}`), VS Code extends the inserting range end to the cursor
        // automatically, so the range will cover everything the user typed.
        item.range = new vscode.Range(triggerStart, position);

        if (!snippet.expand && !snippet.parameters?.length && snippet.body !== undefined) {
            // Static snippet — insert body directly.
            item.insertText = snippet.body;
        } else {
            // Dynamic or parameterized snippet — use a command for expansion.
            item.insertText = "";
            item.command = {
                title: "Expand snippet",
                command: "memoria.expandSnippet",
                arguments: [snippet.trigger, document.uri.toString(), position.line, position.character],
            };
        }

        return item;
    }
}
