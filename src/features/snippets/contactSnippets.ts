import type { ResolvedContact } from "../contacts/contactUtils";
import type { SnippetDefinition, SnippetContext } from "./types";
import { elapsedSince, formatElapsed } from "../../utils/dateUtils";

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
    const formatters: Record<string, (c: ResolvedContact) => string> = {
        "Id": (c) => c.id,
        "Nickname": (c) => c.nickname,
        "Full Name": (c) => c.fullName,
        "Nickname (title)": (c) => `${c.nickname} (${c.shortTitle})`,
        "Full Name (title)": (c) => `${c.fullName} (${c.shortTitle})`,
        "Nickname (id)": (c) => `${c.nickname} (${c.id})`,
        "Full Name (id)": (c) => `${c.fullName} (${c.id})`,
        "Nickname (level)": (c) =>
            c.kind === "report"
                ? `${c.nickname} (${c.resolvedCareerLevel?.key.toUpperCase() ?? "?"})`
                : c.fullName,
        "Full Name (level)": (c) =>
            c.kind === "report"
                ? `${c.fullName} (${c.resolvedCareerLevel?.key.toUpperCase() ?? "?"})`
                : c.fullName,
        "Full Name (level, for X months - since MM-dd-YYYY)": (c) => {
            if (c.kind === "report") {
                const level = c.resolvedCareerLevel?.key.toUpperCase() ?? "?";
                const startDate = (c as { levelStartDate: string }).levelStartDate;
                const elapsed = elapsedSince(startDate);
                return `${c.fullName} (${level}, for ${formatElapsed(elapsed)} - from: ${startDate})`;
            }
            return c.fullName;
        },
    };

    return (formatters[format] ?? (() => contact.fullName))(contact);
}
