// Creates the workspace folder/file tree defined by a blueprint.
// Uses vscode.workspace.fs exclusively (not Node fs) for virtual filesystem compatibility.
//
// Path validation ensures blueprint entries cannot escape the workspace root via "../" segments.
// The manifest is built during a single scaffolding pass to avoid re-reading created files.

import * as vscode from "vscode";
import { computeFileHash } from "./hashUtils";
import type { WorkspaceEntry, ScaffoldResult } from "./types";

export class FileScaffold {
    // Injectable for testability — unit tests pass a mock fs, E2E uses vscode.workspace.fs.
    private readonly fs: typeof vscode.workspace.fs;

    constructor(fs: typeof vscode.workspace.fs) {
        this.fs = fs;
    }

    /**
     * Recursively creates all folders and files defined by the workspace entry tree.
     * Returns a ScaffoldResult with fileManifest mapping each written file's relative path
     * to its SHA-256 hash.
     *
     * The seed content callback may return:
     *   - Uint8Array  → write this content
     *   - null        → create an empty file
     *
     * @param rootUri - The workspace root to scaffold into.
     * @param entries - The blueprint workspace tree to create.
     * @param getSeedContent - Callback to retrieve a file's seed content.
     */
    async scaffoldTree(
        rootUri: vscode.Uri,
        entries: WorkspaceEntry[],
        getSeedContent: (relativePath: string) => Promise<Uint8Array | null>
    ): Promise<ScaffoldResult> {
        const fileManifest: Record<string, string> = {};
        await this.processEntries(rootUri, rootUri, entries, getSeedContent, fileManifest);
        return { fileManifest };
    }

    private async processEntries(
        rootUri: vscode.Uri,
        currentUri: vscode.Uri,
        entries: WorkspaceEntry[],
        getSeedContent: (relativePath: string) => Promise<Uint8Array | null>,
        fileManifest: Record<string, string>
    ): Promise<void> {
        for (const entry of entries) {
            this.validateEntryName(entry.name);

            const entryUri = vscode.Uri.joinPath(currentUri, entry.name.replace(/\/$/, ""));
            this.assertWithinRoot(rootUri, entryUri);

            if (entry.isFolder) {
                await this.backupObstructingFile(rootUri, entryUri);
                await this.fs.createDirectory(entryUri);
                if (entry.children && entry.children.length > 0) {
                    await this.processEntries(rootUri, entryUri, entry.children, getSeedContent, fileManifest);
                }
            } else {
                const relativePath = this.toRelativePath(rootUri, entryUri);
                const content = (await getSeedContent(relativePath)) ?? new Uint8Array(0);
                await this.fs.writeFile(entryUri, content);
                fileManifest[relativePath] = computeFileHash(content);
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

    /**
     * If a plain file exists at the path where a folder is expected, moves it to
     * WorkspaceInitializationBackups/ to make room for the folder.
     * Does nothing if the path is absent or is already a directory.
     */
    private async backupObstructingFile(rootUri: vscode.Uri, folderUri: vscode.Uri): Promise<void> {
        let stat: vscode.FileStat;
        try {
            stat = await this.fs.stat(folderUri);
        } catch {
            return; // Nothing at this path — no obstruction.
        }
        if (stat.type !== vscode.FileType.File) {
            return; // A directory already exists here — createDirectory handles it.
        }
        const relativePath = this.toRelativePath(rootUri, folderUri);
        const segments = relativePath.split("/");
        const backupParent = vscode.Uri.joinPath(rootUri, "WorkspaceInitializationBackups", ...segments.slice(0, -1));
        const backupDest = vscode.Uri.joinPath(rootUri, "WorkspaceInitializationBackups", ...segments);
        await this.fs.createDirectory(backupParent);
        await this.fs.rename(folderUri, backupDest, { overwrite: false });
    }
}
