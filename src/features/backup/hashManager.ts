/** SHA-256 content hashing for incremental backup detection. */

import * as crypto from "crypto";
import * as vscode from "vscode";

/**
 * Computes SHA-256 hex digest of the file's raw bytes.
 * Returns null if the file cannot be read.
 */
export async function computeFileHash(
    uri: vscode.Uri,
    fs: typeof vscode.workspace.fs = vscode.workspace.fs,
): Promise<string | null> {
    try {
        const content = await fs.readFile(uri);
        const hash = crypto.createHash("sha256");
        hash.update(content);
        return hash.digest("hex");
    } catch {
        return null;
    }
}

/**
 * Given a set of current file URIs with their workspace-relative POSIX paths
 * and the previous hash manifest, returns the subset of URIs whose content
 * has changed (or is new).
 */
export async function findChangedFiles(
    files: Array<{ uri: vscode.Uri; relativePath: string }>,
    previousHashes: Record<string, string>,
    fs: typeof vscode.workspace.fs = vscode.workspace.fs,
): Promise<Array<{ uri: vscode.Uri; relativePath: string; hash: string }>> {
    const changed: Array<{ uri: vscode.Uri; relativePath: string; hash: string }> = [];

    for (const file of files) {
        const hash = await computeFileHash(file.uri, fs);
        if (hash === null) {
            // Unreadable file — skip
            continue;
        }
        if (previousHashes[file.relativePath] !== hash) {
            changed.push({ ...file, hash });
        }
    }

    return changed;
}

/**
 * Builds a full hash manifest from the given set of files.
 * Files that cannot be read are omitted.
 */
export async function buildHashManifest(
    files: Array<{ uri: vscode.Uri; relativePath: string }>,
    fs: typeof vscode.workspace.fs = vscode.workspace.fs,
): Promise<Record<string, string>> {
    const manifest: Record<string, string> = {};

    for (const file of files) {
        const hash = await computeFileHash(file.uri, fs);
        if (hash !== null) {
            manifest[file.relativePath] = hash;
        }
    }

    return manifest;
}
