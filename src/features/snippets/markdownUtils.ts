export interface HeadingChild {
    label: string;
    block: string;
}

/**
 * Returns the line number of the first Markdown heading at or below `fromLine`.
 * Returns `null` when no heading is found before the end of the document.
 */
export function findFirstHeadingBelow(
    getLine: (i: number) => string,
    lineCount: number,
    fromLine: number,
): number | null {
    for (let i = fromLine; i < lineCount; i++) {
        if (/^#{1,6}\s/.test(getLine(i))) return i;
    }
    return null;
}

/**
 * Parses the top-level list items under `headingLine` and returns each one
 * together with its full block of text (continuation lines + nested items).
 *
 * Stops when it encounters:
 * - A heading of the same or higher level
 * - End of file
 */
export function parseHeadingChildren(
    getLine: (i: number) => string,
    lineCount: number,
    headingLine: number,
): HeadingChild[] {
    const headingText = getLine(headingLine);
    const headingMatch = headingText.match(/^(#{1,6})\s/);
    if (!headingMatch) return [];

    const headingLevel = headingMatch[1].length;
    const children: Array<{ label: string; lines: string[] }> = [];
    let current: { label: string; lines: string[] } | null = null;
    let baseIndent: number | null = null;

    for (let i = headingLine + 1; i < lineCount; i++) {
        const line = getLine(i);

        // Stop at a heading of the same or higher level.
        const hm = line.match(/^(#{1,6})\s/);
        if (hm && hm[1].length <= headingLevel) break;

        // Detect list-item lines.
        const listMatch = line.match(/^(\s*)([-*]|\d+\.)\s/);
        if (listMatch) {
            const indent = listMatch[1].length;
            if (baseIndent === null) baseIndent = indent;

            if (indent === baseIndent) {
                // New top-level child.
                current = { label: line.trim(), lines: [line] };
                children.push(current);
                continue;
            }
        }

        // Skip blank / non-list lines before the first child.
        if (!current) continue;

        // Everything else belongs to the current child (continuations,
        // nested items, blank lines inside the block).
        current.lines.push(line);
    }

    // Trim trailing blank lines from each block.
    for (const c of children) {
        while (c.lines.length > 0 && c.lines[c.lines.length - 1].trim() === "") {
            c.lines.pop();
        }
    }

    return children.map((c) => ({ label: c.label, block: c.lines.join("\n") }));
}

/**
 * Finds all sub-headings exactly one level below `headingLine` and returns
 * each one together with its full block (all content up to the next sibling
 * or a heading of the same or higher level as the parent).
 *
 * Example: if `headingLine` points to an `## H2`, this returns every `### H3`
 * section under it, each with all its content (text, lists, sub-headings, etc.).
 */
export function parseSubHeadings(
    getLine: (i: number) => string,
    lineCount: number,
    headingLine: number,
): HeadingChild[] {
    const headingText = getLine(headingLine);
    const headingMatch = headingText.match(/^(#{1,6})\s/);
    if (!headingMatch) return [];

    const parentLevel = headingMatch[1].length;
    const childLevel = parentLevel + 1;
    if (childLevel > 6) return [];

    const children: Array<{ label: string; startLine: number }> = [];

    for (let i = headingLine + 1; i < lineCount; i++) {
        const line = getLine(i);
        const hm = line.match(/^(#{1,6})\s/);
        if (!hm) continue;

        const level = hm[1].length;
        // Stop at a heading of the same or higher level as the parent.
        if (level <= parentLevel) break;
        // Collect direct children (one level down).
        if (level === childLevel) {
            children.push({ label: line, startLine: i });
        }
    }

    return children.map((child, idx) => {
        // The block runs from the child heading to just before the next sibling
        // or the end of the parent's section.
        const endLine = idx + 1 < children.length
            ? children[idx + 1].startLine
            : findParentSectionEnd(getLine, lineCount, headingLine, parentLevel);

        const lines: string[] = [];
        for (let i = child.startLine; i < endLine; i++) {
            lines.push(getLine(i));
        }

        // Trim trailing blank lines.
        while (lines.length > 0 && lines[lines.length - 1].trim() === "") {
            lines.pop();
        }

        return { label: child.label, block: lines.join("\n") };
    });
}

/** Returns the line number just past the parent heading's section. */
function findParentSectionEnd(
    getLine: (i: number) => string,
    lineCount: number,
    headingLine: number,
    parentLevel: number,
): number {
    for (let i = headingLine + 1; i < lineCount; i++) {
        const hm = getLine(i).match(/^(#{1,6})\s/);
        if (hm && hm[1].length <= parentLevel) return i;
    }
    return lineCount;
}
