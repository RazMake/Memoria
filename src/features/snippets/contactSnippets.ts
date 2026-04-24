import type { ResolvedContact } from "../contacts/contactUtils";
import type { SnippetDefinition, SnippetContext } from "./types";
import { elapsedSince, formatElapsed } from "./dateUtils";

export function generateContactSnippets(contacts: ResolvedContact[]): SnippetDefinition[] {
    return contacts.map((contact) => ({
        trigger: `@${contact.id}`,
        label: `${contact.fullName} (${contact.id})`,
        description: `${contact.shortTitle}`,
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
    const options = ["Nickname", "Full Name", "Nickname (title)", "Full Name (title)", "Id", "Nickname (id)"];
    if (contact.kind === "report") {
        options.push("Nickname (level)", "Full Name (level)", "Full Name (level, for X months - since MM-dd-YYYY)");
    }
    return options;
}

function formatContact(contact: ResolvedContact, format: string): string {
    switch (format) {
        case "Id":
            return contact.id;
        case "Nickname":
            return contact.nickname;
        case "Full Name":
            return contact.fullName;
        case "Nickname (title)":
            return `${contact.nickname} (${contact.shortTitle})`;
        case "Full Name (title)":
            return `${contact.fullName} (${contact.shortTitle})`;
        case "Nickname (id)":
            return `${contact.nickname} (${contact.id})`;
        case "Full Name (id)":
            return `${contact.fullName} (${contact.id})`;
        case "Nickname (level)":
            if (contact.kind === "report") {
                return `${contact.nickname} (${contact.resolvedCareerLevel?.key.toUpperCase() ?? "?"})`;
            }
            return contact.fullName;
        case "Full Name (level)":
            if (contact.kind === "report") {
                return `${contact.fullName} (${contact.resolvedCareerLevel?.key.toUpperCase() ?? "?"})`;
            }
            return contact.fullName;
        case "Full Name (level, for X months - since MM-dd-YYYY)":
            if (contact.kind === "report") {
                const level = contact.resolvedCareerLevel?.key.toUpperCase() ?? "?";
                const startDate = (contact as { levelStartDate: string }).levelStartDate;
                const elapsed = elapsedSince(startDate);
                return `${contact.fullName} (${level}, for ${formatElapsed(elapsed)} - from: ${startDate})`;
            }
            return contact.fullName;
        default:
            return contact.fullName;
    }
}
