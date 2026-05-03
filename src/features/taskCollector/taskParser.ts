// Parses markdown task list items from two document formats:
//   • Source files       — standard GFM task list items (- [ ] / - [x]).
//   • Collector document — same task list format plus optional suffix lines that carry
//     metadata (source path and completion date) appended by the formatter.
import { TASK_LINE_RE, isChecked } from "../../utils/markdownCheckbox";
import { escapeRegExp } from "../../utils/regex";
import type {
    CollectorSection,
    ParsedCollectorDocument,
    ParsedCollectorSuffix,
    ParsedCollectorTask,
    TaskBlock,
} from "./types";
const ACTIVE_HEADING_RE = /^#{1,6}\s+To\s+do\s*$/i;
const COMPLETED_HEADING_RE = /^#{1,6}\s+Completed\s*$/i;
const BLANK_LINE_RE = /^\s*$/;
const FENCE_RE = /^(`{3,}|~{3,})/;

interface FenceState {
    marker: "`" | "~";
    length: number;
}

export function parseTaskBlocks(content: string): TaskBlock[] {
    const lines = splitLines(content);
    const blocks: TaskBlock[] = [];

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
        if (!TASK_LINE_RE.test(lines[lineIndex])) {
            continue;
        }

        const { block, nextLine } = parseTaskAt(lines, lineIndex);
        blocks.push(block);
        lineIndex = nextLine - 1;
    }

    return blocks;
}

export function parseCollectorDocument(content: string): ParsedCollectorDocument {
    const lines = splitLines(content);
    const tasks: ParsedCollectorTask[] = [];
    let section: CollectorSection = "active";

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
        const line = lines[lineIndex];
        if (ACTIVE_HEADING_RE.test(line)) {
            section = "active";
            continue;
        }
        if (COMPLETED_HEADING_RE.test(line)) {
            section = "completed";
            continue;
        }
        if (!TASK_LINE_RE.test(line)) {
            continue;
        }

        const { block, nextLine } = parseTaskAt(lines, lineIndex);
        tasks.push(applyCollectorMetadata(block, section));
        lineIndex = nextLine - 1;
    }

    return {
        active: tasks.filter((task) => task.section === "active"),
        completed: tasks.filter((task) => task.section === "completed"),
        tasks,
    };
}

export function parseCollectorSuffixLine(line: string): ParsedCollectorSuffix | null {
    const trimmed = line.trim();
    const wrapped = /^(_([^_]+)_|\*([^*]+)\*)$/.exec(trimmed);
    if (!wrapped) {
        return null;
    }

    const rawText = wrapped[2] ?? wrapped[3] ?? "";
    const sourceMatch = /(?:^|\s|[·,—,])Source:\s*(.+?)(?=(?:\s*[·,—,]\s*)?Completed\b|$)/i.exec(rawText);
    const completedMatch = /(?:^|\s|[·,—,])Completed\s+(\d{4}-\d{2}-\d{2})(?=(?:\s*[·,—,]\s*)?Source:|$)/i.exec(rawText);
    if (!sourceMatch && !completedMatch) {
        return null;
    }

    return {
        rawLine: line,
        rawText,
        source: sourceMatch?.[1]?.trim() ?? null,
        completedDate: completedMatch?.[1] ?? null,
    };
}

function applyCollectorMetadata(block: TaskBlock, section: CollectorSection): ParsedCollectorTask {
    let continuationLines = [...block.continuationLines];
    let suffix: ParsedCollectorSuffix | null = null;

    if (section === "completed" && continuationLines.length > 0) {
        const maybeSuffix = parseCollectorSuffixLine(continuationLines[continuationLines.length - 1]);
        if (maybeSuffix) {
            suffix = maybeSuffix;
            continuationLines = continuationLines.slice(0, -1);
        }
    }

    const bodyWithoutSuffix = [block.firstLineText, ...continuationLines].join("\n");

    return {
        ...block,
        continuationLines,
        body: bodyWithoutSuffix,
        section,
        bodyWithoutSuffix,
        suffix,
    };
}

function parseTaskAt(lines: string[], startLine: number): { block: TaskBlock; nextLine: number } {
    const match = TASK_LINE_RE.exec(lines[startLine]);
    if (!match) {
        throw new Error(`Line ${startLine} is not a task line.`);
    }

    const indentText = match[1];
    const indent = measureIndent(indentText);
    const firstLineText = match[3] ?? "";
    const hangIndent = indent + 2;
    const continuationLines: string[] = [];
    const rawLines: string[] = [lines[startLine]];
    const pendingBlankLines: string[] = [];

    let lineIndex = startLine + 1;
    let fence: FenceState | null = null;

    for (; lineIndex < lines.length; lineIndex++) {
        const line = lines[lineIndex];

        if (fence) {
            if (pendingBlankLines.length > 0) {
                continuationLines.push(...pendingBlankLines.map(() => ""));
                rawLines.push(...pendingBlankLines);
                pendingBlankLines.length = 0;
            }

            continuationLines.push(removeIndentPrefix(line, indentText));
            rawLines.push(line);
            if (isFenceBoundary(line, fence)) {
                fence = null;
            }
            continue;
        }

        if (BLANK_LINE_RE.test(line)) {
            pendingBlankLines.push(line);
            continue;
        }

        const currentIndent = measureIndent(leadingWhitespace(line));
        if (currentIndent < hangIndent) {
            break;
        }

        if (pendingBlankLines.length > 0) {
            continuationLines.push(...pendingBlankLines.map(() => ""));
            rawLines.push(...pendingBlankLines);
            pendingBlankLines.length = 0;
        }

        const dedented = removeIndentPrefix(line, indentText);
        continuationLines.push(dedented);
        rawLines.push(line);

        const openedFence = parseFenceState(dedented) ?? parseFenceState(line);
        if (openedFence) {
            fence = openedFence;
        }
    }

    trimTrailingBlankLines(continuationLines, rawLines);

    const body = [firstLineText, ...continuationLines].join("\n");

    return {
        block: {
            indent,
            indentText,
            checked: isChecked(match[2]),
            firstLineText,
            continuationLines,
            bodyRange: {
                startLine,
                endLine: startLine + rawLines.length - 1,
            },
            body,
            rawLines,
        },
        nextLine: lineIndex,
    };
}

function trimTrailingBlankLines(continuationLines: string[], rawLines: string[]): void {
    while (continuationLines.length > 0 && continuationLines[continuationLines.length - 1] === "") {
        continuationLines.pop();
        rawLines.pop();
    }
}

function splitLines(content: string): string[] {
    return content.split(/\r?\n/);
}

function leadingWhitespace(line: string): string {
    return line.match(/^[ \t]*/)?.[0] ?? "";
}

function measureIndent(text: string): number {
    let count = 0;
    for (const char of text) {
        count += char === "\t" ? 4 : 1;
    }
    return count;
}

function removeIndentPrefix(line: string, indentText: string): string {
    if (!indentText) {
        return line;
    }
    if (line.startsWith(indentText)) {
        return line.slice(indentText.length);
    }

    let index = 0;
    let remaining = indentText.length;
    while (remaining > 0 && index < line.length && (line[index] === " " || line[index] === "\t")) {
        index += 1;
        remaining -= 1;
    }
    return line.slice(index);
}

function parseFenceState(line: string): FenceState | null {
    const match = FENCE_RE.exec(line.trimStart());
    if (!match) {
        return null;
    }
    return {
        marker: match[1][0] as "`" | "~",
        length: match[1].length,
    };
}

function isFenceBoundary(line: string, fence: FenceState): boolean {
    return new RegExp(`^${escapeRegExp(fence.marker)}{${fence.length},}`).test(line.trimStart());
}

/**
 * Marks all unchecked subtask lines in a task body as checked.
 * Only applies to continuation lines (not the first line, which is the task text itself).
 * Subtask lines are lines that start with optional whitespace followed by `- [ ]`.
 */
export function markSubtasksCompleted(body: string, completedDate?: string): string {
    const lines = body.split("\n");
    if (lines.length <= 1) {
        return body;
    }
    const suffix = completedDate ? ` _Completed ${completedDate}_` : "";
    const result = [lines[0]];
    for (const line of lines.slice(1)) {
        result.push(line.replace(/^([ \t]*)- \[ \](.*)$/, `$1- [x]$2${suffix}`));
    }
    return result.join("\n");
}