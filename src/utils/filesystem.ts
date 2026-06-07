import * as vscode from "vscode";
import { textDecoder, textEncoder } from "./encoding";

/**
 * Reads the full text content of a file via the VS Code filesystem API.
 * Returns an empty string when the file does not exist or cannot be read.
 */
export async function readTextFile(fs: typeof vscode.workspace.fs, uri: vscode.Uri): Promise<string> {
    try {
        const bytes = await fs.readFile(uri);
        return textDecoder.decode(bytes);
    } catch {
        return "";
    }
}

/**
 * Writes text content to a file via the VS Code filesystem API.
 */
export async function writeTextFile(fs: typeof vscode.workspace.fs, uri: vscode.Uri, text: string): Promise<void> {
    await fs.writeFile(uri, textEncoder.encode(text));
}

/**
 * Lists directory entries, returning an empty array when the directory
 * does not exist or cannot be read.
 */
export async function readDirectorySafe(
    fs: typeof vscode.workspace.fs,
    uri: vscode.Uri,
): Promise<readonly [string, vscode.FileType][]> {
    try {
        return await fs.readDirectory(uri);
    } catch {
        return [];
    }
}

/**
 * Creates a directory (and any missing parents) via the VS Code filesystem API.
 * Silently succeeds when the directory already exists — `createDirectory` throws
 * on some filesystems when the target is already present, so callers that don't
 * track creation state can use this to stay idempotent.
 */
export async function ensureDirectory(fs: typeof vscode.workspace.fs, uri: vscode.Uri): Promise<void> {
    try {
        await fs.createDirectory(uri);
    } catch {
        // Already exists (or a benign race) — ignore.
    }
}
