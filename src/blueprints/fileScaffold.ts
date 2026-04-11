// Creates the workspace folder/file tree defined by a blueprint.
// Uses vscode.workspace.fs exclusively (not Node fs) for virtual filesystem compatibility.
//
// Path validation ensures blueprint entries cannot escape the workspace root via "../" segments.
// The manifest is built during a single scaffolding pass to avoid re-reading created files.

import * as vscode from "vscode";
import { computeFileHash } from "./hashUtils";
import type { WorkspaceEntry, ScaffoldResult } from "./types";

/** Returned by the seed content callback to signal that an existing file should not be overwritten. */
export const SKIP_FILE = Symbol("SKIP_FILE");

export class FileScaffold {
    // Injectable for testability — unit tests pass a mock fs, E2E uses vscode.workspace.fs.
    private readonly fs: typeof vscode.workspace.fs;

    constructor(fs: typeof vscode.workspace.fs) {
        this.fs = fs;
    }

    /**
     * Recursively creates all folders and files defined by the workspace entry tree.
     * Returns a ScaffoldResult with:
     *   - fileManifest: relative path → SHA-256 hash for every file written.
     *   - skippedPaths: relative paths of files explicitly skipped via SKIP_FILE.
     *
     * The seed content callback may return:
     *   - Uint8Array  → write this content
     *   - null        → create an empty file
     *   - SKIP_FILE   → do not create or overwrite the file
     *
     * @param rootUri - The workspace root to scaffold into.
     * @param entries - The blueprint workspace tree to create.
     * @param getSeedContent - Callback to retrieve a file's seed content or skip signal.
     */
    async scaffoldTree(
        rootUri: vscode.Uri,
        entries: WorkspaceEntry[],
        getSeedContent: (relativePath: string) => Promise<Uint8Array | null | typeof SKIP_FILE>
    ): Promise<ScaffoldResult> {
        const fileManifest: Record<string, string> = {};
        const skippedPaths: string[] = [];
        await this.processEntries(rootUri, rootUri, entries, getSeedContent, fileManifest, skippedPaths);
        return { fileManifest, skippedPaths };
    }

    private async processEntries(
        rootUri: vscode.Uri,
        currentUri: vscode.Uri,
        entries: WorkspaceEntry[],
        getSeedContent: (relativePath: string) => Promise<Uint8Array | null | typeof SKIP_FILE>,
        fileManifest: Record<string, string>,
        skippedPaths: string[]
    ): Promise<void> {
        for (const entry of entries) {
            this.validateEntryName(entry.name);

            const entryUri = vscode.Uri.joinPath(currentUri, entry.name.replace(/\/$/, ""));
            this.assertWithinRoot(rootUri, entryUri);

            if (entry.isFolder) {
                await this.fs.createDirectory(entryUri);
                if (entry.children && entry.children.length > 0) {
                    await this.processEntries(rootUri, entryUri, entry.children, getSeedContent, fileManifest, skippedPaths);
                }
            } else {
                const relativePath = this.toRelativePath(rootUri, entryUri);
                const seedResult = await getSeedContent(relativePath);
                if (seedResult === SKIP_FILE) {
                    skippedPaths.push(relativePath);
                } else {
                    const content = seedResult ?? new Uint8Array(0);
                    await this.fs.writeFile(entryUri, content);
                    fileManifest[relativePath] = computeFileHash(content);
                }
            }
        }
    }

    private validateEntryName(name: string): void {
        // Reject any entry that contains path traversal segments.
        const normalized = name.replace(/\\/g, "/");
        if (normalized.split("/").some((segment) => segment === "..")) {
            throw new Error(`Blueprint entry name "${name}" contains a path traversal segment ("..") and is not allowed.`);
        }
    }

    private assertWithinRoot(rootUri: vscode.Uri, targetUri: vscode.Uri): void {
        // Ensure the resolved path stays within the workspace root.
        const rootPath = rootUri.path.endsWith("/") ? rootUri.path : rootUri.path + "/";
        const targetPath = targetUri.path.endsWith("/") ? targetUri.path : targetUri.path + "/";
        if (!targetPath.startsWith(rootPath)) {
            throw new Error(`Blueprint entry resolves outside workspace root: "${targetUri.path}".`);
        }
    }

    private toRelativePath(rootUri: vscode.Uri, targetUri: vscode.Uri): string {
        const rootPath = rootUri.path.endsWith("/") ? rootUri.path : rootUri.path + "/";
        return targetUri.path.slice(rootPath.length).replace(/\\/g, "/");
    }
}
