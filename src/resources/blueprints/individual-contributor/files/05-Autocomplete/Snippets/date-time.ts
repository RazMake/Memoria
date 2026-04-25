import type { SnippetDefinition, SnippetContext } from "memoria-snippets";
import { formatDate, formatTime, formatDueIn, formatDueBy } from "memoria-snippets";

const dueOptions = Array.from({ length: 21 }, (_, i) => `${i + 1}`);

const snippets: SnippetDefinition[] = [
    {
        trigger: "{date}",
        label: "Date",
        description: "Inserts the current date in the chosen format",
        glob: "**/*.md",
        pathSafe: true,
        parameters: [
            { name: "format", options: ["YYYY-MM-dd", "MM/dd/YYYY", "dddd, MMM dd, YYYY"], default: "YYYY-MM-dd" },
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
            { name: "format", options: ["HH:mm", "HH:mm:ss", "hh:mm AM/PM", "hh:mm:ss AM/PM"], default: "HH:mm" },
        ],
        expand(ctx: SnippetContext): string {
            const fmt = ctx.params.format ?? "HH:mm";
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
            return `${formatDate(now, "YYYY-MM-dd")} ${formatTime(now, "HH:mm")}`;
        },
    },
    {
        trigger: "{due-in}",
        label: "Due In",
        description: "Inserts a relative due date, e.g. 'in 1 week and 3 days (by Friday, April 24, 2026)'",
        glob: "**/*.md",
        parameters: [
            { name: "days", options: dueOptions, default: "1" },
        ],
        expand(ctx: SnippetContext): string {
            const days = parseInt(ctx.params.days ?? "1", 10) || 1;
            return formatDueIn(days);
        },
    },
    {
        trigger: "{due-by}",
        label: "Due By",
        description: "Inserts an absolute due date, e.g. 'by Friday, April 24, 2026'",
        glob: "**/*.md",
        parameters: [
            { name: "days", options: dueOptions, default: "1" },
        ],
        expand(ctx: SnippetContext): string {
            const days = parseInt(ctx.params.days ?? "1", 10) || 1;
            return formatDueBy(days);
        },
    },
];

export default snippets;
