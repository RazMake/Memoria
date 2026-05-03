import * as vscode from "vscode";
import { textDecoder } from "./encoding";

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
