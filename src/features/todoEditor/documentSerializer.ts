import { parseCollectorDocument } from "../taskCollector/taskParser";
import type { ParsedCollectorTask } from "../taskCollector/types";

export interface TodoDocument {
    preamble: string[];
    active: ParsedCollectorTask[];
    midSection: string[];
    completed: ParsedCollectorTask[];
    epilogue: string[];
}

const ACTIVE_HEADING_RE = /^#{1,6}\s+To\s+do\s*$/i;
const COMPLETED_HEADING_RE = /^#{1,6}\s+Completed\s*$/i;

export function parseTodoDocument(text: string): TodoDocument {
    const lines = text.split(/\r?\n/);
    const parsed = parseCollectorDocument(text);

    const preamble: string[] = [];
    const midSection: string[] = [];
    const epilogue: string[] = [];

    const firstActiveEnd = parsed.active.length > 0
        ? parsed.active[parsed.active.length - 1].bodyRange.endLine
        : -1;
    const firstCompletedStart = parsed.completed.length > 0
        ? parsed.completed[0].bodyRange.startLine
        : -1;
    const lastCompletedEnd = parsed.completed.length > 0
        ? parsed.completed[parsed.completed.length - 1].bodyRange.endLine
        : -1;

    // Build a set of all lines owned by tasks
    const taskLines = new Set<number>();
    for (const task of parsed.tasks) {
        for (let i = task.bodyRange.startLine; i <= task.bodyRange.endLine; i++) {
            taskLines.add(i);
        }
    }

    let epilogueStart = lines.length;

    if (parsed.active.length > 0) {
        // Preamble: everything before the first active task
        const firstActiveStart = parsed.active[0].bodyRange.startLine;
        for (let i = 0; i < firstActiveStart; i++) {
            preamble.push(lines[i]);
        }

        // Mid-section: lines between last active task and first completed task (or end)
        const midStart = firstActiveEnd + 1;
        const midEnd = firstCompletedStart >= 0 ? firstCompletedStart : lines.length;
        for (let i = midStart; i < midEnd; i++) {
            if (!taskLines.has(i)) {
                midSection.push(lines[i]);
            }
        }
        epilogueStart = midEnd;
    } else {
        // No active tasks: find headings to determine structure
        let completedHeadingLine = -1;
        for (let i = 0; i < lines.length; i++) {
            if (COMPLETED_HEADING_RE.test(lines[i])) {
                completedHeadingLine = i;
                break;
            }
        }

        if (completedHeadingLine >= 0) {
            for (let i = 0; i < completedHeadingLine; i++) {
                preamble.push(lines[i]);
            }
            const midEnd = firstCompletedStart >= 0 ? firstCompletedStart : lines.length;
            for (let i = completedHeadingLine; i < midEnd; i++) {
                if (!taskLines.has(i)) {
                    midSection.push(lines[i]);
                }
            }
            epilogueStart = midEnd;
        } else {
            // No completed heading either — everything before first completed task is preamble
            const end = firstCompletedStart >= 0 ? firstCompletedStart : lines.length;
            for (let i = 0; i < end; i++) {
                preamble.push(lines[i]);
            }
            epilogueStart = end;
        }
    }

    // Epilogue: lines after the last completed task
    const epilogueFrom = lastCompletedEnd >= 0 ? lastCompletedEnd + 1 : epilogueStart;
    for (let i = epilogueFrom; i < lines.length; i++) {
        if (!taskLines.has(i)) {
            epilogue.push(lines[i]);
        }
    }

    return {
        preamble,
        active: parsed.active,
        midSection,
        completed: parsed.completed,
        epilogue,
    };
}

export function completeTask(task: ParsedCollectorTask, date: string): string[] {
    const newLines = [...task.rawLines];
    newLines[0] = newLines[0].replace(/- \[ \]/, "- [x]");

    const suffixParts: string[] = [];
    if (task.suffix?.source) {
        suffixParts.push(`Source: ${task.suffix.source} · Completed ${date}`);
    } else {
        suffixParts.push(`Completed ${date}`);
    }

    // Remove existing suffix line if present
    if (task.suffix) {
        newLines.pop();
    }

    newLines.push(`${task.indentText}      _${suffixParts[0]}_`);
    return newLines;
}

export function uncompleteTask(task: ParsedCollectorTask): string[] {
    const newLines = [...task.rawLines];
    newLines[0] = newLines[0].replace(/- \[[xX]\]/, "- [ ]");

    if (task.suffix) {
        newLines.pop();
    }

    return newLines;
}

export function addTaskRawLines(text: string): string[] {
    const parts = text.split("\n");
    if (parts.length === 1) {
        return [`- [ ] ${text}`];
    }

    const result = [`- [ ] ${parts[0]}`];
    for (let i = 1; i < parts.length; i++) {
        result.push(`      ${parts[i]}`);
    }
    return result;
}

export function updateTaskBody(task: ParsedCollectorTask, newBody: string): string[] {
    const bodyLines = newBody.split("\n");
    const checkbox = task.checked ? "x" : " ";
    const result: string[] = [];

    result.push(`${task.indentText}- [${checkbox}] ${bodyLines[0]}`);

    for (let i = 1; i < bodyLines.length; i++) {
        const prefix = task.indentText ? `${task.indentText}      ` : "      ";
        result.push(`${prefix}${bodyLines[i]}`);
    }

    if (task.suffix) {
        result.push(task.suffix.rawLine);
    }

    return result;
}

export function serializeDocument(doc: TodoDocument): string {
    const parts: string[] = [
        ...doc.preamble,
        ...doc.active.flatMap((t) => t.rawLines),
        ...doc.midSection,
        ...doc.completed.flatMap((t) => t.rawLines),
        ...doc.epilogue,
    ];
    return parts.join("\n");
}

const HANG_INDENT_RE = /^      /;

export function stripHangingIndent(body: string): string {
    const lines = body.split("\n");
    return lines.map((l, i) => (i === 0 ? l : l.replace(HANG_INDENT_RE, ""))).join("\n");
}
