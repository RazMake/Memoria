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

/**
 * Ensures `entry` appears as its own line in the `.gitignore` at the workspace root.
 * Creates the file if it does not exist. No-ops when the entry is already present.
 */
export async function ensureGitignoreEntry(
    fs: typeof vscode.workspace.fs,
    workspaceRoot: vscode.Uri,
    entry: string,
): Promise<void> {
    const uri = vscode.Uri.joinPath(workspaceRoot, ".gitignore");
    const existing = await readTextFile(fs, uri);
    const lines = existing.split(/\r?\n/);
    if (lines.some((l) => l.trim() === entry)) {
        return;
    }
    const trailingNewline = existing.length === 0 || existing.endsWith("\n") ? "" : "\n";
    await writeTextFile(fs, uri, `${existing}${trailingNewline}${entry}\n`);
}
