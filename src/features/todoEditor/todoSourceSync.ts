import * as vscode from "vscode";
import { parseTaskBlocks } from "../taskCollector/taskParser";
import { replaceLineRange } from "../taskCollector/taskWriter";
import type { TaskBlock } from "../taskCollector/types";

async function mutateSourceBlock(
    workspaceRoot: vscode.Uri,
    sourceRelativePath: string,
    body: string,
    buildReplacement: (match: TaskBlock, eol: string) => string,
    warningMessage: string,
): Promise<void> {
    const sourceUri = vscode.Uri.joinPath(workspaceRoot, sourceRelativePath);
    try {
        const sourceDoc = await vscode.workspace.openTextDocument(sourceUri);
        const sourceText = sourceDoc.getText();
        const blocks = parseTaskBlocks(sourceText);
        const match = blocks.find(b => b.body === body);
        if (!match) {
            vscode.window.showWarningMessage(warningMessage);
            return;
        }
        const eol = sourceDoc.eol === vscode.EndOfLine.CRLF ? "\r\n" : "\n";
        const replacement = buildReplacement(match, eol);
        const newText = replaceLineRange(sourceText, match.bodyRange.startLine, match.bodyRange.endLine, replacement, eol);
        const edit = new vscode.WorkspaceEdit();
        edit.replace(sourceUri, new vscode.Range(0, 0, sourceDoc.lineCount, 0), newText);
        await vscode.workspace.applyEdit(edit);
        const updated = await vscode.workspace.openTextDocument(sourceUri);
        await updated.save();
    } catch {
        vscode.window.showWarningMessage(warningMessage);
    }
}

// Propagates task body edits from the collector file back to the original source file.
// The collector is a view of collected tasks; the source file is the authoritative location,
// so both must stay in sync when the user edits a task in the Todo Editor.
export async function writeBackToSource(
    workspaceRoot: vscode.Uri,
    sourceRelativePath: string,
    oldBody: string,
    newBody: string,
): Promise<void> {
    await mutateSourceBlock(
        workspaceRoot,
        sourceRelativePath,
        oldBody,
        (match) => {
            const bodyLines = newBody.split("\n");
            const firstLine = `${match.indentText}- [${match.checked ? "x" : " "}] ${bodyLines[0]}`;
            const hangPrefix = match.indentText ? `${match.indentText}      ` : "      ";
            const continuations = bodyLines.slice(1).map(l => `${hangPrefix}${l}`);
            return [firstLine, ...continuations].join("\n");
        },
        "Memoria: Could not find task in source file — .todo.md updated only.",
    );
}

// Marks a deleted task as "(Removed)" in the source file rather than deleting it outright.
// Non-destructive: the user may have meaningful context around the task in the source
// that should be preserved for manual review and cleanup.
export async function markRemovedInSource(
    workspaceRoot: vscode.Uri,
    sourceRelativePath: string,
    body: string,
): Promise<void> {
    await mutateSourceBlock(
        workspaceRoot,
        sourceRelativePath,
        body,
        (match) => {
            const firstLineText = body.split("\n")[0];
            return `${match.indentText}- TODO: (Removed) ${firstLineText}`;
        },
        "Memoria: Could not find task in source file — collector updated only.",
    );
}
