import * as vscode from "vscode";

// Shared utilities for E2E tests — workspace access and file operations
// that are common across integration test suites.

/** Returns the first open workspace folder, or throws if none is open. */
export function getWorkspaceFolder(): vscode.WorkspaceFolder {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
        throw new Error("No workspace folder open");
    }
    return folders[0];
}

export async function uriExists(uri: vscode.Uri): Promise<boolean> {
    try {
        await vscode.workspace.fs.stat(uri);
        return true;
    } catch {
        return false;
    }
}

export async function writeTextFile(uri: vscode.Uri, content: string): Promise<void> {
    await vscode.workspace.fs.writeFile(uri, Buffer.from(content, "utf-8"));
}

export async function readTextFile(uri: vscode.Uri): Promise<string> {
    const bytes = await vscode.workspace.fs.readFile(uri);
    return new TextDecoder().decode(bytes);
}

/**
 * Writes a JSON object as a UTF-8 file, creating parent directories as needed.
 */
export async function writeJsonFile(uri: vscode.Uri, value: unknown): Promise<void> {
    const parent = vscode.Uri.joinPath(uri, "..");
    await vscode.workspace.fs.createDirectory(parent);
    const bytes = new TextEncoder().encode(JSON.stringify(value, null, 2));
    await vscode.workspace.fs.writeFile(uri, bytes);
}

/**
 * Reads and JSON-parses a file. Returns null when the file does not exist.
 */
export async function readJsonFile<T>(uri: vscode.Uri): Promise<T | null> {
    try {
        const bytes = await vscode.workspace.fs.readFile(uri);
        return JSON.parse(new TextDecoder().decode(bytes)) as T;
    } catch {
        return null;
    }
}

/**
 * Deletes a directory and all its contents if it exists. No-op when absent.
 */
export async function deleteRecursive(uri: vscode.Uri): Promise<void> {
    try {
        await vscode.workspace.fs.delete(uri, { recursive: true });
    } catch {
        // Ignore — directory may not exist.
    }
}

