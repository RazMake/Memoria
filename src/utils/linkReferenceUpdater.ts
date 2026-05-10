import * as path from "path";

/**
 * Replaces markdown link paths in content when a file is renamed.
 * Matches `[text](path)` and `![alt](path)` patterns.
 * Preserves `#anchor` fragments. Skips links inside fenced code blocks.
 * Returns the updated content, or `null` if no replacements were made.
 */
export function updateMarkdownLinks(content: string, oldRelPath: string, newRelPath: string): string | null {
    const lines = content.split('\n');
    let inFencedBlock = false;
    let changed = false;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        if (/^(`{3,}|~{3,})/.test(line.trimStart())) {
            inFencedBlock = !inFencedBlock;
            continue;
        }

        if (inFencedBlock) continue;

        const linkRegex = /(!?\[[^\]]*\])\(([^)]*)\)/g;
        let newLine = '';
        let lastIndex = 0;
        let match: RegExpExecArray | null;

        while ((match = linkRegex.exec(line)) !== null) {
            const fullMatch = match[0];
            const bracketPart = match[1];
            const hrefPart = match[2];

            const hashIdx = hrefPart.indexOf('#');
            const filePath = hashIdx >= 0 ? hrefPart.slice(0, hashIdx) : hrefPart;
            const anchor = hashIdx >= 0 ? hrefPart.slice(hashIdx) : '';

            if (filePath === oldRelPath) {
                newLine += line.slice(lastIndex, match.index) + bracketPart + '(' + newRelPath + anchor + ')';
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
 * Replaces markdown link path prefixes in content when a folder is renamed.
 * For links whose path starts with `oldDirPrefix/`, replaces that prefix with `newDirPrefix/`.
 * Skips links inside fenced code blocks.
 * Returns the updated content, or `null` if no replacements were made.
 */
export function updateMarkdownLinkPrefixes(content: string, oldDirPrefix: string, newDirPrefix: string): string | null {
    const oldWithSlash = oldDirPrefix.endsWith('/') ? oldDirPrefix : oldDirPrefix + '/';
    const newWithSlash = newDirPrefix.endsWith('/') ? newDirPrefix : newDirPrefix + '/';

    const lines = content.split('\n');
    let inFencedBlock = false;
    let changed = false;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        if (/^(`{3,}|~{3,})/.test(line.trimStart())) {
            inFencedBlock = !inFencedBlock;
            continue;
        }

        if (inFencedBlock) continue;

        const linkRegex = /(!?\[[^\]]*\])\(([^)]*)\)/g;
        let newLine = '';
        let lastIndex = 0;
        let match: RegExpExecArray | null;

        while ((match = linkRegex.exec(line)) !== null) {
            const fullMatch = match[0];
            const bracketPart = match[1];
            const hrefPart = match[2];

            const hashIdx = hrefPart.indexOf('#');
            const filePath = hashIdx >= 0 ? hrefPart.slice(0, hashIdx) : hrefPart;
            const anchor = hashIdx >= 0 ? hrefPart.slice(hashIdx) : '';

            if (filePath.startsWith(oldWithSlash)) {
                const newPath = newWithSlash + filePath.slice(oldWithSlash.length);
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
 * Computes a POSIX-style relative path from a directory to a file.
 * Both arguments must be forward-slash-separated absolute or workspace-relative paths.
 */
export function computeRelativePosixPath(fromDir: string, toFile: string): string {
    return path.posix.relative(fromDir, toFile);
}
