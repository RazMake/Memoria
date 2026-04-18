// Bidirectional markdown link path rewriter for the task collector.
//
// When a task is harvested from a source file into the collector, relative paths
// in the task body (links, images, reference definitions) must be adjusted because
// the collector lives in a different directory. forward() rewrites source→collector;
// reverse() rewrites collector→source.
//
// Ordinal tracking in reverse() allows selective rewriting: only paths that were
// actually rewritten by forward() are candidates for reverse() — this prevents
// double-rewriting paths that the user added directly in the collector.
//
// Paths are rewritten only when they are relative (no scheme, not absolute).
// Fenced code blocks are passed through unchanged to avoid corrupting code samples.
import path from "node:path";
import { normalizePath } from "../../utils/path";

// Matches any URI scheme (http://, mailto:, vscode://, etc.) so that absolute URLs
// are skipped — only relative paths without a scheme are rewritten.
const SCHEME_RE = /^[a-zA-Z][a-zA-Z0-9+\-.]*:/;
// Detects the opening of a fenced code block (``` or ~~~) so its contents are
// passed through unchanged and code samples are never corrupted by path rewriting.
const FENCE_RE = /^([`~]{3,})/;;

interface ProcessOptions {
    transform: (value: string) => string;
    rewriteOrdinals?: Set<number> | null;
}

export function forward(body: string, sourceRelPath: string, collectorRelPath: string): string {
    return processBody(body, {
        transform: (value) => rewriteRelativePath(value, sourceRelPath, collectorRelPath),
    }).body;
}

export function reverse(
    body: string,
    collectorRelPath: string,
    sourceRelPath: string,
    templateBody?: string,
): string {
    const rewriteOrdinals = templateBody
        ? processBody(templateBody, { transform: (value) => value }).ordinals
        : null;

    return processBody(body, {
        transform: (value) => rewriteRelativePath(value, collectorRelPath, sourceRelPath),
        rewriteOrdinals,
    }).body;
}

// Walks every line of the task body, rewriting relative markdown link destinations.
// Each rewritable link is assigned a monotonically increasing ordinal number.
// reverse() uses the ordinals collected by a prior forward() pass as an allowlist:
// only links that were rewritten by forward() are candidates for rewriting back —
// this prevents double-rewriting links the user added directly in the collector.
function processBody(body: string, options: ProcessOptions): { body: string; ordinals: Set<number> } {
    const lines = body.split("\n");
    const result: string[] = [];
    const ordinals = new Set<number>();
    let fence: { marker: "`" | "~"; length: number } | null = null;
    let ordinal = 0;

    for (const line of lines) {
        const trimmed = line.trimStart();

        if (fence) {
            result.push(line);
            if (isFenceBoundary(trimmed, fence.marker, fence.length)) {
                fence = null;
            }
            continue;
        }

        const openedFence = parseFenceState(trimmed);
        if (openedFence) {
            fence = openedFence;
            result.push(line);
            continue;
        }

        const refMatch = line.match(/^(\s*\[[^\]]+\]:\s*)(<[^>]+>|\S+)(.*)$/);
        if (refMatch) {
            const rawDestination = refMatch[2];
            const destination = unwrapAngleBrackets(rawDestination);
            if (isRewriteCandidate(destination)) {
                ordinal += 1;
                ordinals.add(ordinal);
                const rewritten = shouldRewrite(ordinal, options.rewriteOrdinals)
                    ? wrapWithSameDelimiters(rawDestination, options.transform(destination))
                    : rawDestination;
                result.push(refMatch[1] + rewritten + refMatch[3]);
                continue;
            }
        }

        result.push(rewriteInlineTokens(line, options, ordinals, () => ++ordinal));
    }

    return {
        body: result.join("\n"),
        ordinals,
    };
}

function rewriteInlineTokens(
    line: string,
    options: ProcessOptions,
    ordinals: Set<number>,
    nextOrdinal: () => number,
): string {
    let result = "";
    let cursor = 0;

    for (let index = 0; index < line.length; index++) {
        const isImage = line[index] === "!" && line[index + 1] === "[";
        const isLink = line[index] === "[";
        if (!isImage && !isLink) {
            continue;
        }

        const labelStart = isImage ? index + 1 : index;
        const closingBracket = findClosingBracket(line, labelStart + 1);
        if (closingBracket === -1 || line[closingBracket + 1] !== "(") {
            continue;
        }

        const closingParen = findClosingParen(line, closingBracket + 2);
        if (closingParen === -1) {
            continue;
        }

        const insideStart = closingBracket + 2;
        const inside = line.slice(insideStart, closingParen);
        const destination = parseInlineDestination(inside);
        if (!destination || !isRewriteCandidate(destination.value)) {
            index = closingParen;
            continue;
        }

        const ordinal = nextOrdinal();
        ordinals.add(ordinal);

        result += line.slice(cursor, insideStart + destination.start);
        result += shouldRewrite(ordinal, options.rewriteOrdinals)
            ? options.transform(destination.value)
            : destination.value;
        cursor = insideStart + destination.end;
        index = closingParen;
    }

    result += line.slice(cursor);
    return result;
}

function findClosingBracket(line: string, start: number): number {
    for (let index = start; index < line.length; index++) {
        if (line[index] === "\\") {
            index += 1;
            continue;
        }
        if (line[index] === "]") {
            return index;
        }
    }
    return -1;
}

function findClosingParen(line: string, start: number): number {
    let depth = 1;
    for (let index = start; index < line.length; index++) {
        if (line[index] === "\\") {
            index += 1;
            continue;
        }
        if (line[index] === "(") {
            depth += 1;
        } else if (line[index] === ")") {
            depth -= 1;
            if (depth === 0) {
                return index;
            }
        }
    }
    return -1;
}

function parseInlineDestination(inside: string): { value: string; start: number; end: number } | null {
    let offset = 0;
    while (offset < inside.length && /\s/.test(inside[offset])) {
        offset += 1;
    }
    if (offset >= inside.length) {
        return null;
    }

    if (inside[offset] === "<") {
        const end = inside.indexOf(">", offset + 1);
        if (end === -1) {
            return null;
        }
        return {
            value: inside.slice(offset + 1, end),
            start: offset + 1,
            end,
        };
    }

    let end = offset;
    while (end < inside.length && !/\s/.test(inside[end])) {
        end += 1;
    }
    if (end === offset) {
        return null;
    }

    return {
        value: inside.slice(offset, end),
        start: offset,
        end,
    };
}

function rewriteRelativePath(value: string, fromRelPath: string, toRelPath: string): string {
    if (!isRewriteCandidate(value)) {
        return value;
    }

    const { pathPart, suffix } = splitPathSuffix(value);
    const absoluteTarget = path.posix.normalize(path.posix.join(path.posix.dirname(normalizePath(fromRelPath)), pathPart));
    const rewritten = path.posix.relative(path.posix.dirname(normalizePath(toRelPath)), absoluteTarget) || path.posix.basename(absoluteTarget);
    const displayPath = rewritten.startsWith(".") ? rewritten : `./${rewritten}`;
    return displayPath + suffix;
}

function splitPathSuffix(rawPath: string): { pathPart: string; suffix: string } {
    const index = rawPath.search(/[?#]/);
    if (index === -1) {
        return { pathPart: rawPath, suffix: "" };
    }
    return {
        pathPart: rawPath.slice(0, index),
        suffix: rawPath.slice(index),
    };
}

function isRewriteCandidate(value: string): boolean {
    if (!value || value.startsWith("#") || value.startsWith("//") || value.startsWith("/")) {
        return false;
    }
    const { pathPart } = splitPathSuffix(value);
    return !SCHEME_RE.test(pathPart);
}

function unwrapAngleBrackets(value: string): string {
    return value.startsWith("<") && value.endsWith(">") ? value.slice(1, -1) : value;
}

function wrapWithSameDelimiters(original: string, nextValue: string): string {
    return original.startsWith("<") && original.endsWith(">") ? `<${nextValue}>` : nextValue;
}

function parseFenceState(line: string): { marker: "`" | "~"; length: number } | null {
    const match = FENCE_RE.exec(line);
    if (!match) {
        return null;
    }
    return {
        marker: match[1][0] as "`" | "~",
        length: match[1].length,
    };
}

function isFenceBoundary(line: string, marker: "`" | "~", length: number): boolean {
    return new RegExp(`^${escapeRegExp(marker)}{${length},}`).test(line);
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function shouldRewrite(ordinal: number, rewriteOrdinals?: Set<number> | null): boolean {
    return !rewriteOrdinals || rewriteOrdinals.has(ordinal);
}