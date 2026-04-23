import * as vscode from "vscode";
import type { ResolvedContact } from "../contacts/contactUtils";
import { elapsedSince, formatElapsed } from "./dateUtils";

export interface ContactExpansionMap {
    /** Returns all known expansion strings mapped to their contact, longest first. */
    getExpansionEntries(): ReadonlyArray<{ text: string; contact: ResolvedContact }>;
}

export class SnippetHoverProvider implements vscode.HoverProvider {
    constructor(private readonly expansionMap: ContactExpansionMap) {}

    provideHover(
        document: vscode.TextDocument,
        position: vscode.Position,
        _token: vscode.CancellationToken,
    ): vscode.Hover | undefined {
        const lineText = document.lineAt(position.line).text;
        const col = position.character;

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
                    return new vscode.Hover(buildHoverContent(contact), range);
                }
                searchFrom = matchIdx + 1;
            }
        }

        return undefined;
    }
}

function buildHoverContent(contact: ResolvedContact): vscode.MarkdownString {
    const md = new vscode.MarkdownString();
    md.appendMarkdown(`**${contact.fullName}**\n\n`);
    md.appendMarkdown(`- **Id**/**alias**: ${contact.id}\n`);
    md.appendMarkdown(`- **Title**: ${contact.title}\n`);
    md.appendMarkdown(`---\n`);
    md.appendMarkdown(`- Career Path: ${contact.resolvedCareerPath.short}\n`);
    
    if (contact.kind === "report") {
        md.appendMarkdown(`- Level: _${contact.resolvedCareerLevel ? contact.resolvedCareerLevel.key.toUpperCase() : "Unknown"}_\n`);
        const startDate = (contact as { levelStartDate: string }).levelStartDate;
        md.appendMarkdown(`- Level Start: _${startDate}_\n`);
        md.appendMarkdown(`- Time in level: _${formatElapsed(elapsedSince(startDate))}_\n`);
    }
    return md;
}
