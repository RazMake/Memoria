import * as vscode from "vscode";
import type { ResolvedContact } from "../contacts/contactUtils";
import { elapsedSince, formatElapsed } from "./dateUtils";

export interface ContactExpansionMap {
    /** Returns all known expansion strings mapped to their contact, longest first. */
    getExpansionEntries(): ReadonlyArray<{ text: string; contact: ResolvedContact }>;
}

export class SnippetHoverProvider implements vscode.HoverProvider {
    private detailed = false;

    constructor(private readonly expansionMap: ContactExpansionMap) {}

    /**
     * Activates detailed mode, triggers the built-in hover, then resets.
     * Intended to be called from a keybinding-triggered command.
     */
    async showDetailedHover(): Promise<void> {
        this.detailed = true;
        await vscode.commands.executeCommand("editor.action.showHover");
        // Do NOT reset here — editor.action.showHover returns before
        // provideHover() is called.  The flag is consumed inside provideHover().
    }

    provideHover(
        document: vscode.TextDocument,
        position: vscode.Position,
        _token: vscode.CancellationToken,
    ): vscode.Hover | undefined {
        const lineText = document.lineAt(position.line).text;
        const col = position.character;
        const detailed = this.detailed;
        // Consume the flag so the next natural hover reverts to brief mode.
        this.detailed = false;

        // Find the longest known contact string that spans the cursor position.
        for (const { text, contact } of this.expansionMap.getExpansionEntries()) {
            const idx = lineText.indexOf(text);
            if (idx === -1) continue;
            // Check every occurrence on the line — the cursor may sit on a later one.
            let searchFrom = 0;
            while (true) {
                const matchIdx = lineText.indexOf(text, searchFrom);
                if (matchIdx === -1) break;
                const matchEnd = matchIdx + text.length;
                if (col >= matchIdx && col <= matchEnd) {
                    const range = new vscode.Range(
                        position.line, matchIdx,
                        position.line, matchEnd,
                    );
                    return new vscode.Hover(buildHoverContent(contact, detailed), range);
                }
                searchFrom = matchIdx + 1;
            }
        }

        return undefined;
    }
}

function buildHoverContent(contact: ResolvedContact, detailed: boolean): vscode.MarkdownString {
    const md = new vscode.MarkdownString();
    md.appendMarkdown(`**Id**: ${contact.id}\n`);
    md.appendMarkdown(`\n**${contact.fullName}**\n\n`);
    md.appendMarkdown(`- **Title**: ${contact.title}\n`);
    md.appendMarkdown(`- Career Path: ${contact.resolvedCareerPath.short}\n`);
    md.appendMarkdown(`- Group: _${contact.groupName}_\n`);

    if (contact.kind === "report" && detailed) {
        md.appendMarkdown(`- Level: _${contact.resolvedCareerLevel ? contact.resolvedCareerLevel.key.toUpperCase() : "Unknown"}_\n`);
        const startDate = (contact as { levelStartDate: string }).levelStartDate;
        md.appendMarkdown(`- Level Start: _${startDate}_\n`);
        md.appendMarkdown(`- Time in level: _${formatElapsed(elapsedSince(startDate))}_\n`);
    }
    return md;
}
