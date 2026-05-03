/**
 * Pure utility for detecting markdown link context.
 * Extracted so it can be unit-tested without webview dependencies.
 */

export interface LinkContext {
    mode: 'path' | 'heading';
    prefix: string;
    parenStart: number;
    filePath: string; // only for 'heading' mode
}

/**
 * Detects whether the cursor is inside a markdown link's parens.
 * Returns context about what to complete, or undefined if not in a link.
 *
 * Matches patterns like: `[text](|)` where | is the cursor.
 */
export function detectLinkContext(text: string, cursor: number): LinkContext | undefined {
    // Walk backwards from cursor to find an unmatched '('
    // preceded by ']' (markdown link pattern)
    let depth = 0;
    for (let i = cursor - 1; i >= 0; i--) {
        const ch = text[i];
        if (ch === ')') {
            depth++;
        } else if (ch === '(') {
            if (depth > 0) {
                depth--;
            } else {
                // Found unmatched '(' — check if preceded by ']'
                if (i > 0 && text[i - 1] === ']') {
                    const contentInParens = text.slice(i + 1, cursor);
                    const hashIdx = contentInParens.indexOf('#');
                    if (hashIdx >= 0) {
                        // Completing a heading after #
                        const filePath = contentInParens.slice(0, hashIdx);
                        const prefix = contentInParens.slice(hashIdx + 1);
                        return { mode: 'heading', prefix, parenStart: i + 1, filePath };
                    } else {
                        return { mode: 'path', prefix: contentInParens, parenStart: i + 1, filePath: '' };
                    }
                }
                return undefined;
            }
        } else if (ch === '\n') {
            // Don't search across lines
            return undefined;
        }
    }
    return undefined;
}
