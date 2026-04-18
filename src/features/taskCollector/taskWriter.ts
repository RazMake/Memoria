// TaskWriter wraps VS Code WorkspaceEdit with two concerns that plain WorkspaceEdit cannot handle:
//   1. PendingWrites integration — registers every write so the onDidSave handler can ignore
//      self-triggered saves and avoid infinite reconciliation loops.
//   2. Retry logic — VS Code WorkspaceEdit can fail if the document changes concurrently with
//      the edit attempt; retrying recovers from transient conflicts without surfacing errors.
import * as vscode from "vscode";
import { PendingWrites } from "./pendingWrites";
import type { TaskBlock } from "./types";

interface MutationOptions {
    allowCreate?: boolean;
}

type MutationBuilder = (
    document: vscode.TextDocument | null,
    currentText: string,
    eol: string,
) => string | null | Promise<string | null>;

export class TaskWriter {
    constructor(
        private readonly pendingWrites: PendingWrites,
        private readonly maxRetries = 3,
    ) {}

    async mutateDocument(
        uri: vscode.Uri,
        buildNextText: MutationBuilder,
        options: MutationOptions = {},
    ): Promise<boolean> {
        for (let attempt = 0; attempt < this.maxRetries; attempt++) {
            const existing = await openTextDocumentIfPresent(uri);
            if (!existing && !options.allowCreate) {
                return false;
            }

            const currentText = existing?.getText() ?? "";
            const eol = existing?.eol === vscode.EndOfLine.CRLF ? "\r\n" : "\n";
            const rawNextText = await buildNextText(existing, currentText, eol);
            if (rawNextText === null) {
                return false;
            }
            const nextText = eol === "\r\n"
                ? rawNextText.replace(/\r\n/g, "\n").replace(/\n/g, "\r\n")
                : rawNextText.replace(/\r\n/g, "\n");
            if (nextText === currentText) {
                return false;
            }

            const edit = new vscode.WorkspaceEdit();
            if (!existing) {
                edit.createFile(uri, { ignoreIfExists: true });
                edit.insert(uri, new vscode.Position(0, 0), nextText);
            } else {
                edit.replace(uri, fullDocumentRange(existing, currentText.length), nextText);
            }

            const applied = await vscode.workspace.applyEdit(edit, { isRefactoring: false });
            // applyEdit returns false when VS Code cannot apply the edit, which can happen if
            // the document was modified concurrently. Looping retries the full read-compute-write
            // cycle so the mutation is based on the latest document state.
            if (!applied) {
                continue;
            }

            this.pendingWrites.register(uri.toString(), nextText);
            const updated = await vscode.workspace.openTextDocument(uri);
            await updated.save();

            return true;
        }

        throw new Error(`Memoria: Failed to apply task edit for ${uri.toString()} after ${this.maxRetries} attempts.`);
    }
}

export function replaceLineRange(
    text: string,
    startLine: number,
    endLine: number,
    replacement: string,
    eol: string,
): string {
    const lines = text.split(/\r?\n/);
    const replacementLines = replacement === "" ? [] : replacement.split("\n");
    lines.splice(startLine, (endLine - startLine) + 1, ...replacementLines);
    return lines.join(eol);
}

export function renderTaskBlock(block: TaskBlock, body: string, checked: boolean): string {
    const bodyLines = body.split("\n");
    const firstLine = `${block.indentText}- [${checked ? "x" : " "}] ${bodyLines[0] ?? ""}`;
    return [firstLine, ...bodyLines.slice(1)].join("\n");
}

export function renderDoneBlock(block: TaskBlock, body: string): string {
    const bodyLines = body.split("\n");
    const firstLine = `${block.indentText}- **Done**: ${bodyLines[0] ?? ""}`;
    return [firstLine, ...bodyLines.slice(1)].join("\n");
}

async function openTextDocumentIfPresent(uri: vscode.Uri): Promise<vscode.TextDocument | null> {
    try {
        return await vscode.workspace.openTextDocument(uri);
    } catch {
        return null;
    }
}

function fullDocumentRange(document: vscode.TextDocument, textLength: number): vscode.Range {
    return new vscode.Range(document.positionAt(0), document.positionAt(textLength));
}
