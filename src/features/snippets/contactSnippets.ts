import type { ResolvedContact } from "../contacts/contactUtils";
import type { SnippetDefinition, SnippetContext } from "./types";
import { elapsedSince, formatElapsed } from "./dateUtils";

export function generateContactSnippets(contacts: ResolvedContact[]): SnippetDefinition[] {
    return contacts.map((contact) => ({
        trigger: `@${contact.id}`,
        label: `${contact.fullName} (${contact.id})`,
        description: `_${contact.shortTitle}_`,
        filterText: `@${contact.id} ${contact.nickname} ${contact.fullName}`,
        glob: "**/*",
        parameters: [
            { name: "format", options: getContactFormatOptions(contact) },
        ],
        expand(ctx: SnippetContext): string {
            return formatContact(contact, ctx.params["format"]);
        },
    }));
}

function getContactFormatOptions(contact: ResolvedContact): string[] {
    const options = ["nickname", "full", "title", "alias"];
    if (contact.kind === "report") {
        options.push("level", "level full");
    }
    return options;
}

function formatContact(contact: ResolvedContact, format: string): string {
    switch (format) {
        case "alias":
            return contact.id;
        case "nickname":
            return contact.nickname;
        case "full":
            return contact.fullName;
        case "title":
            return `${contact.fullName} (${contact.shortTitle})`;
        case "level":
            if (contact.kind === "report") {
                return `${contact.fullName} (${contact.resolvedCareerLevel?.key.toUpperCase() ?? "?"})`;
            }
            return contact.fullName;
        case "level full":
            if (contact.kind === "report") {
                const level = contact.resolvedCareerLevel?.key.toUpperCase() ?? "?";
                const startDate = (contact as { levelStartDate: string }).levelStartDate;
                const elapsed = elapsedSince(startDate);
                return `${contact.fullName} (${level}) - Time in level: ${formatElapsed(elapsed)} (from: ${startDate})`;
            }
            return contact.fullName;
        default:
            return contact.fullName;
    }
}
