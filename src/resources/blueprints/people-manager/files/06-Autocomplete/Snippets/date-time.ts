import type { SnippetDefinition, SnippetContext } from "memoria-snippets";
import { formatDate, formatTime } from "memoria-snippets";

const snippets: SnippetDefinition[] = [
    {
        trigger: "{date}",
        label: "Date",
        description: "Inserts the current date in the chosen format",
        glob: "**/*.md",
        pathSafe: true,
        parameters: [
            { name: "format", options: ["YYYY-MM-dd", "MM/dd/YYYY", "dd MMM YYYY", "YYYY"], default: "YYYY-MM-dd" },
        ],
        expand(ctx: SnippetContext): string {
            const fmt = ctx.params.format ?? "YYYY-MM-dd";
            return formatDate(new Date(), fmt);
        },
    },
    {
        trigger: "{time}",
        label: "Time",
        description: "Inserts the current time in the chosen format",
        glob: "**/*.md",
        parameters: [
            { name: "format", options: ["HH", "HHs", "hh"], default: "HH" },
        ],
        expand(ctx: SnippetContext): string {
            const fmt = ctx.params.format ?? "HH";
            return formatTime(new Date(), fmt);
        },
    },
    {
        trigger: "{now}",
        label: "Date & Time",
        description: "Inserts the current date and time (YYYY-MM-dd HH:mm)",
        glob: "**/*.md",
        expand(): string {
            const now = new Date();
            return `${formatDate(now, "YYYY-MM-dd")} ${formatTime(now, "HH")}`;
        },
    },
];

export default snippets;
