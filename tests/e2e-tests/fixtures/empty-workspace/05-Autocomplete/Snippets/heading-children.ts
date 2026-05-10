import type { SnippetDefinition, SnippetContext } from "memoria-snippets";
import { findFirstHeadingBelow, parseSubHeadings } from "memoria-snippets";

function getSubHeadings(ctx: SnippetContext): Array<{ label: string; block: string }> {
    if (!ctx.document || ctx.position === null) return [];
    const doc = ctx.document;
    const headingLine = findFirstHeadingBelow(
        (i: number) => doc.lineAt(i).text,
        doc.lineCount,
        ctx.position.line + 1,
    );
    if (headingLine === null) return [];
    return parseSubHeadings(
        (i: number) => doc.lineAt(i).text,
        doc.lineCount,
        headingLine,
    );
}

const snippets: SnippetDefinition[] = [
    {
        trigger: "{copy-child}",
        label: "Copy Child Heading",
        description: "Copy a sub-heading from below",
        glob: "**/*.md",
        visible(ctx: SnippetContext): boolean {
            return getSubHeadings(ctx).length > 0;
        },
        parameters: [
            {
                name: "section",
                resolveOptions(ctx: SnippetContext): string[] {
                    return getSubHeadings(ctx).map((c) => c.label);
                },
            },
        ],
        expand(ctx: SnippetContext): string {
            const sections = getSubHeadings(ctx);
            const selected = sections.find((c) => c.label === ctx.params.section);
            return selected?.block ?? "";
        },
    },
];

export default snippets;
