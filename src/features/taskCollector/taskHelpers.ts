import * as vscode from "vscode";
import { isMarkdownPath } from "../../utils/markdown";
import type { TaskBlock, TaskIndexEntry } from "./types";

export { isMarkdownPath };

export interface SourceContext {
    uri: vscode.Uri;
    workspaceFolder: vscode.WorkspaceFolder;
    sourceRoot: string | null;
    relativePath: string;
    sourceKey: string;
}

export interface IndexedTaskLocation {
    block: TaskBlock;
    blockIndex: number;
}

export function isMarkdownDocument(document: vscode.TextDocument): boolean {
    return isMarkdownPath(document.uri.path);
}

export async function openTextDocumentIfPresent(uri: vscode.Uri): Promise<vscode.TextDocument | null> {
    try {
        return await vscode.workspace.openTextDocument(uri);
    } catch {
        return null;
    }
}

export function stringArrayEqual(left: string[], right: string[]): boolean {
    return left.length === right.length && left.every((value, index) => value === right[index]);
}

export function taskEntriesEqual(left: TaskIndexEntry, right: TaskIndexEntry): boolean {
    return left.id === right.id
        && left.source === right.source
        && left.sourceRoot === right.sourceRoot
        && left.sourceOrder === right.sourceOrder
        && left.fingerprint === right.fingerprint
        && left.body === right.body
        && left.firstSeenAt === right.firstSeenAt
        && left.completed === right.completed
        && left.doneDate === right.doneDate
        && left.collectorOwned === right.collectorOwned
        && (left.agingSkipCount ?? 0) === (right.agingSkipCount ?? 0);
}
