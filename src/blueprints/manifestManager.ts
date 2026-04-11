// Handles all reads and writes to the .memoria/ metadata directory.
// ManifestManager is the single owner of .memoria/ directory creation —
// all write methods ensure the directory exists before writing, so no other
// component needs to know about the metadata folder structure.
//
// SHA-256 is used for file hashes to detect user modifications during re-init
// without storing any file content or PII.

import * as vscode from "vscode";
import { createHash } from "crypto";
import type { BlueprintManifest, DecorationsConfig, DotfoldersConfig } from "./types";

export class ManifestManager {
    // Injectable for testability — unit tests pass a mock fs, E2E uses vscode.workspace.fs.
    private readonly fs: typeof vscode.workspace.fs;

    constructor(fs: typeof vscode.workspace.fs) {
        this.fs = fs;
    }

    /** Computes SHA-256 of the given bytes. Returns "sha256:<lowercase hex>". */
    computeFileHash(content: Uint8Array): string {
        const hash = createHash("sha256").update(content).digest("hex");
        return `sha256:${hash}`;
    }

    /** Returns true when .memoria/blueprint.json exists at the workspace root. */
    async isInitialized(workspaceRoot: vscode.Uri): Promise<boolean> {
        try {
            await this.fs.stat(this.manifestUri(workspaceRoot));
            return true;
        } catch {
            return false;
        }
    }

    /** Returns the first root that has .memoria/blueprint.json, or null if none. */
    async findInitializedRoot(roots: vscode.Uri[]): Promise<vscode.Uri | null> {
        for (const root of roots) {
            if (await this.isInitialized(root)) {
                return root;
            }
        }
        return null;
    }

    /** Deletes the .memoria/ directory and all its contents from the given root. */
    async deleteMemoriaDir(root: vscode.Uri): Promise<void> {
        await this.fs.delete(this.memoriaDir(root), { recursive: true });
    }

    async readManifest(workspaceRoot: vscode.Uri): Promise<BlueprintManifest | null> {
        return this.readJson<BlueprintManifest>(this.manifestUri(workspaceRoot));
    }

    async writeManifest(workspaceRoot: vscode.Uri, manifest: BlueprintManifest): Promise<void> {
        await this.ensureMemoriaDir(workspaceRoot);
        await this.writeJson(this.manifestUri(workspaceRoot), manifest);
    }

    async readDecorations(workspaceRoot: vscode.Uri): Promise<DecorationsConfig | null> {
        return this.readJson<DecorationsConfig>(this.decorationsUri(workspaceRoot));
    }

    async writeDecorations(workspaceRoot: vscode.Uri, config: DecorationsConfig): Promise<void> {
        await this.ensureMemoriaDir(workspaceRoot);
        await this.writeJson(this.decorationsUri(workspaceRoot), config);
    }

    async readDotfolders(workspaceRoot: vscode.Uri): Promise<DotfoldersConfig | null> {
        return this.readJson<DotfoldersConfig>(this.dotfoldersUri(workspaceRoot));
    }

    async writeDotfolders(workspaceRoot: vscode.Uri, config: DotfoldersConfig): Promise<void> {
        await this.ensureMemoriaDir(workspaceRoot);
        await this.writeJson(this.dotfoldersUri(workspaceRoot), config);
    }

    private manifestUri(root: vscode.Uri): vscode.Uri {
        return vscode.Uri.joinPath(root, ".memoria", "blueprint.json");
    }

    private decorationsUri(root: vscode.Uri): vscode.Uri {
        return vscode.Uri.joinPath(root, ".memoria", "decorations.json");
    }

    private dotfoldersUri(root: vscode.Uri): vscode.Uri {
        return vscode.Uri.joinPath(root, ".memoria", "dotfolders.json");
    }

    private memoriaDir(root: vscode.Uri): vscode.Uri {
        return vscode.Uri.joinPath(root, ".memoria");
    }

    private async ensureMemoriaDir(root: vscode.Uri): Promise<void> {
        await this.fs.createDirectory(this.memoriaDir(root));
    }

    private async readJson<T>(uri: vscode.Uri): Promise<T | null> {
        try {
            const bytes = await this.fs.readFile(uri);
            return JSON.parse(new TextDecoder().decode(bytes)) as T;
        } catch {
            return null;
        }
    }

    private async writeJson(uri: vscode.Uri, value: unknown): Promise<void> {
        const bytes = new TextEncoder().encode(JSON.stringify(value, null, 2));
        await this.fs.writeFile(uri, bytes);
    }
}
