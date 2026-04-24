import type { ResolvedContact } from "./contactUtils";
import { elapsedSince, formatElapsed } from "../snippets/dateUtils";

/**
 * Builds contact tooltip content as a markdown string.
 * Shared between SnippetHoverProvider (native editor) and
 * TodoEditorProvider (webview).
 */
export function buildContactTooltipMarkdown(contact: ResolvedContact, detailed: boolean): string {
    const lines: string[] = [];
    lines.push(`**Id**: ${contact.id}`);
    lines.push("");
    lines.push(`### ${contact.fullName}`);
    lines.push("");
    lines.push(`- **Title**: ${contact.title}`);
    lines.push(`- Career Path: ${contact.resolvedCareerPath.short}`);
    lines.push(`- Group: _${contact.groupName}_`);

    if (contact.kind === "report" && detailed) {
        const levelKey = contact.resolvedCareerLevel
            ? contact.resolvedCareerLevel.key.toUpperCase()
            : "Unknown";
        lines.push(`- Level: _**${levelKey}**_`);
        const startDate = (contact as { levelStartDate: string }).levelStartDate;
        lines.push(`- Level Start: _**${startDate}**_`);
        lines.push(`- Time in level: _${formatElapsed(elapsedSince(startDate))}_`);
    }

    return lines.join("\n");
}
