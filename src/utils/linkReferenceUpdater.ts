import * as path from "path";

/**
 * Matches a fenced code block delimiter (``` or ~~~) at the start of a trimmed line.
 * Module-level so it is not recompiled for every scanned line.
 */
const FENCE_RE = /^(`{3,}|~{3,})/;

/**
 * Matches markdown inline links and images: `[text](href)` / `![alt](href)`.
 * Global flag — `rewriteMarkdownLinks` resets `lastIndex` before each line. Kept at
 * module level to avoid recompiling the pattern for every line of every scanned file.
 */
const MARKDOWN_LINK_RE = /(!?\[[^\]]*\])\(([^)]*)\)/g;

/**
 * Walks markdown content line by line and rewrites the href of every inline link/image
 * found outside fenced code blocks. `rewriteHref` receives the path portion (with any
 * `#anchor` stripped) and returns the replacement path, or `null` to leave the link as-is.
 * Returns the updated content, or `null` when nothing changed.
 */
function rewriteMarkdownLinks(
    content: string,
    rewriteHref: (filePath: string) => string | null,
): string | null {
    const lines = content.split('\n');
    let inFencedBlock = false;
    let changed = false;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        if (FENCE_RE.test(line.trimStart())) {
            inFencedBlock = !inFencedBlock;
            continue;
        }

        if (inFencedBlock) continue;

        MARKDOWN_LINK_RE.lastIndex = 0;
        let newLine = '';
        let lastIndex = 0;
        let match: RegExpExecArray | null;

        while ((match = MARKDOWN_LINK_RE.exec(line)) !== null) {
            const fullMatch = match[0];
            const bracketPart = match[1];
            const hrefPart = match[2];

            const hashIdx = hrefPart.indexOf('#');
            const filePath = hashIdx >= 0 ? hrefPart.slice(0, hashIdx) : hrefPart;
            const anchor = hashIdx >= 0 ? hrefPart.slice(hashIdx) : '';

            const newPath = rewriteHref(filePath);
            if (newPath !== null) {
                newLine += line.slice(lastIndex, match.index) + bracketPart + '(' + newPath + anchor + ')';
                lastIndex = match.index + fullMatch.length;
                changed = true;
            }
        }

        if (lastIndex > 0) {
            newLine += line.slice(lastIndex);
            lines[i] = newLine;
        }
    }

    return changed ? lines.join('\n') : null;
}

/**
 * Replaces markdown link paths in content when a file is renamed.
 * Matches `[text](path)` and `![alt](path)` patterns.
 * Preserves `#anchor` fragments. Skips links inside fenced code blocks.
 * Returns the updated content, or `null` if no replacements were made.
 */
export function updateMarkdownLinks(content: string, oldRelPath: string, newRelPath: string): string | null {
    return rewriteMarkdownLinks(content, (filePath) => (filePath === oldRelPath ? newRelPath : null));
}

/**
 * Replaces markdown link path prefixes in content when a folder is renamed.
 * For links whose path starts with `oldDirPrefix/`, replaces that prefix with `newDirPrefix/`.
 * Skips links inside fenced code blocks.
 * Returns the updated content, or `null` if no replacements were made.
 */
export function updateMarkdownLinkPrefixes(content: string, oldDirPrefix: string, newDirPrefix: string): string | null {
    const oldWithSlash = oldDirPrefix.endsWith('/') ? oldDirPrefix : oldDirPrefix + '/';
    const newWithSlash = newDirPrefix.endsWith('/') ? newDirPrefix : newDirPrefix + '/';

    return rewriteMarkdownLinks(content, (filePath) =>
        filePath.startsWith(oldWithSlash) ? newWithSlash + filePath.slice(oldWithSlash.length) : null,
    );
}

/**
 * Computes a POSIX-style relative path from a directory to a file.
 * Both arguments must be forward-slash-separated absolute or workspace-relative paths.
 */
export function computeRelativePosixPath(fromDir: string, toFile: string): string {
    return path.posix.relative(fromDir, toFile);
}
