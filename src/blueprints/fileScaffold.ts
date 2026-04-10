// Creates the workspace folder/file tree defined by a blueprint.
// Uses vscode.workspace.fs exclusively (not Node fs) for virtual filesystem compatibility.
//
// Path validation ensures blueprint entries cannot escape the workspace root via "../" segments.
// The manifest is built during a single scaffolding pass to avoid re-reading created files.

import * as vscode from "vscode";
import { createHash } from "crypto";
import type { WorkspaceEntry } from "./types";

export class FileScaffold {
    // Injectable for testability — unit tests pass a mock fs, E2E uses vscode.workspace.fs.
    private readonly fs: typeof vscode.workspace.fs;

    constructor(fs: typeof vscode.workspace.fs) {
        this.fs = fs;
    }

    /**
     * Recursively creates all folders and files defined by the workspace entry tree.
     * Returns a fileManifest mapping each created file's relative path to its SHA-256 hash.
     * The manifest uses forward-slash paths regardless of OS.
     *
     * @param rootUri - The workspace root to scaffold into.
     * @param entries - The blueprint workspace tree to create.
     * @param getSeedContent - Callback to retrieve a file's seed content; receives the relative path.
     *                         Returns null when no seed exists — an empty file is created instead.
     */
    async scaffoldTree(
        rootUri: vscode.Uri,
        entries: WorkspaceEntry[],
        getSeedContent: (relativePath: string) => Promise<Uint8Array | null>
    ): Promise<Record<string, string>> {
        const manifest: Record<string, string> = {};
        await this.processEntries(rootUri, rootUri, entries, getSeedContent, manifest);
        return manifest;
    }

    private async processEntries(
        rootUri: vscode.Uri,
        currentUri: vscode.Uri,
        entries: WorkspaceEntry[],
        getSeedContent: (relativePath: string) => Promise<Uint8Array | null>,
        manifest: Record<string, string>
    ): Promise<void> {
        for (const entry of entries) {
            this.validateEntryName(entry.name);

            const entryUri = vscode.Uri.joinPath(currentUri, entry.name.replace(/\/$/, ""));
            this.assertWithinRoot(rootUri, entryUri);

            if (entry.isFolder) {
                await this.fs.createDirectory(entryUri);
                if (entry.children && entry.children.length > 0) {
                    await this.processEntries(rootUri, entryUri, entry.children, getSeedContent, manifest);
                }
            } else {
                const relativePath = this.toRelativePath(rootUri, entryUri);
                const seedContent = await getSeedContent(relativePath);
                const content = seedContent ?? new Uint8Array(0);
                await this.fs.writeFile(entryUri, content);
                manifest[relativePath] = this.computeHash(content);
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

    private computeHash(content: Uint8Array): string {
        const hash = createHash("sha256").update(content).digest("hex");
        return `sha256:${hash}`;
    }
}
