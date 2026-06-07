// Handles all reads and writes to the .memoria/ metadata directory.
// ManifestManager is the single owner of .memoria/ directory creation —
// all write methods ensure the directory exists before writing, so no other
// component needs to know about the metadata folder structure.
//
// SHA-256 is used for file hashes to detect user modifications during re-init
// without storing any file content or PII.

import * as vscode from "vscode";
import type { BlueprintManifest, DefaultFilesConfig, DefaultFilesEntry, DecorationsConfig, DotfoldersConfig, FeaturesConfig } from "./types";
import { BACKUP_FOLDER_NAME } from "./types";
import type { StoredTaskIndex, TaskCollectorConfig } from "../features/taskCollector/types";
import type { TelemetryEmitter } from "../telemetry";
import { readJsonFile, writeJsonFile } from "../utils/jsonFile";
import { getMemoriaConfigUri, getMemoriaDirUri } from "../utils/memoriaPaths";

export class ManifestManager {
    // Injectable for testability — unit tests pass a mock fs, E2E uses vscode.workspace.fs.
    private readonly fs: typeof vscode.workspace.fs;
    /**
     * Tracks which .memoria/ dirs have been ensured this session to avoid redundant
     * createDirectory calls. vscode.workspace.fs.createDirectory() throws if the directory
     * already exists on some filesystems, so caching ensures we only call it once per root.
     */
    private readonly ensuredDirs = new Set<string>();

    constructor(
        fs: typeof vscode.workspace.fs,
        private readonly telemetry?: TelemetryEmitter,
    ) {
        this.fs = fs;
    }

    /** Returns true when .memoria/blueprint.json exists at the workspace root. */
    async isInitialized(workspaceRoot: vscode.Uri): Promise<boolean> {
        try {
            await this.fs.stat(this.configUri(workspaceRoot, "blueprint.json"));
            return true;
        } catch {
            return false;
        }
    }

    /** Returns the first root that has .memoria/blueprint.json, or null if none. */
    async findInitializedRoot(roots: vscode.Uri[]): Promise<vscode.Uri | null> {
        if (roots.length === 0) return null;
        // Parallel stat — faster in multi-root workspaces.
        const results = await Promise.all(roots.map((root) => this.isInitialized(root)));
        const index = results.indexOf(true);
        return index >= 0 ? roots[index] : null;
    }

    /** Deletes the .memoria/ directory and all its contents from the given root. */
    async deleteMemoriaDir(root: vscode.Uri): Promise<void> {
        await this.fs.delete(this.memoriaDir(root), { recursive: true });
        this.ensuredDirs.delete(root.toString());
    }

    /**
     * Copies all files from oldRoot/.memoria/ into newRoot/WorkspaceInitializationBackups/.memoria/
     * so the user can recover them after .memoria/ is deleted.
     * Returns the list of relative paths that failed to copy (empty on full success).
     */
    async backupMemoriaDir(oldRoot: vscode.Uri, newRoot: vscode.Uri): Promise<string[]> {
        const failedPaths: string[] = [];
        const srcDir = this.memoriaDir(oldRoot);
        const destDir = vscode.Uri.joinPath(newRoot, BACKUP_FOLDER_NAME, ".memoria");

        let entries: [string, vscode.FileType][];
        try {
            entries = await this.fs.readDirectory(srcDir);
        } catch {
            // .memoria/ does not exist or is unreadable — nothing to back up.
            return failedPaths;
        }

        await this.fs.createDirectory(destDir);

        for (const [name, type] of entries) {
            if (type !== vscode.FileType.File) {
                continue;
            }
            try {
                const src = vscode.Uri.joinPath(srcDir, name);
                const dest = vscode.Uri.joinPath(destDir, name);
                await this.fs.copy(src, dest, { overwrite: true });
            } catch {
                failedPaths.push(name);
            }
        }

        return failedPaths;
    }

    async readManifest(workspaceRoot: vscode.Uri): Promise<BlueprintManifest | null> {
        return this.readJson<BlueprintManifest>(this.configUri(workspaceRoot, "blueprint.json"));
    }

    async writeManifest(workspaceRoot: vscode.Uri, manifest: BlueprintManifest): Promise<void> {
        await this.writeConfig(workspaceRoot, "blueprint.json", manifest);
    }

    async readDefaultFiles(workspaceRoot: vscode.Uri): Promise<Record<string, DefaultFilesEntry> | null> {
        const config = await this.readJson<DefaultFilesConfig>(this.configUri(workspaceRoot, "default-files.json"));
        if (!config?.defaultFiles) {
            return null;
        }
        // Normalize legacy formats to DefaultFilesEntry for backward compatibility:
        //   - plain string (very old format) → { filesToOpen: [value] }
        //   - string[] (previous format)     → { filesToOpen: value }
        //   - DefaultFilesEntry object       → used as-is
        const result: Record<string, DefaultFilesEntry> = {};
        for (const [key, value] of Object.entries(config.defaultFiles)) {
            if (typeof value === "string") {
                result[key] = { filesToOpen: [value] };
            } else if (Array.isArray(value)) {
                result[key] = { filesToOpen: value };
            } else {
                result[key] = value as DefaultFilesEntry;
            }
        }
        return result;
    }

    async writeDefaultFiles(workspaceRoot: vscode.Uri, defaultFiles: Record<string, DefaultFilesEntry>): Promise<void> {
        await this.writeConfig(workspaceRoot, "default-files.json", { defaultFiles } satisfies DefaultFilesConfig);
    }

    async readDecorations(workspaceRoot: vscode.Uri): Promise<DecorationsConfig | null> {
        return this.readJson<DecorationsConfig>(this.configUri(workspaceRoot, "decorations.json"));
    }

    async writeDecorations(workspaceRoot: vscode.Uri, config: DecorationsConfig): Promise<void> {
        await this.writeConfig(workspaceRoot, "decorations.json", config);
    }

    async readDotfolders(workspaceRoot: vscode.Uri): Promise<DotfoldersConfig | null> {
        return this.readJson<DotfoldersConfig>(this.configUri(workspaceRoot, "dotfolders.json"));
    }

    /** @deprecated Use {@link readVisibilityConfig} instead. */
    async readVisibilityConfig(workspaceRoot: vscode.Uri): Promise<DotfoldersConfig | null> {
        return this.readDotfolders(workspaceRoot);
    }

    async writeDotfolders(workspaceRoot: vscode.Uri, config: DotfoldersConfig): Promise<void> {
        await this.writeConfig(workspaceRoot, "dotfolders.json", config);
    }

    async readFeatures(workspaceRoot: vscode.Uri): Promise<FeaturesConfig | null> {
        return this.readJson<FeaturesConfig>(this.configUri(workspaceRoot, "features.json"));
    }

    async writeFeatures(workspaceRoot: vscode.Uri, config: FeaturesConfig): Promise<void> {
        await this.writeConfig(workspaceRoot, "features.json", config);
    }

    async readTaskCollectorConfig(workspaceRoot: vscode.Uri): Promise<TaskCollectorConfig | null> {
        return this.readJson<TaskCollectorConfig>(this.configUri(workspaceRoot, "task-collector.json"));
    }

    async writeTaskCollectorConfig(workspaceRoot: vscode.Uri, config: TaskCollectorConfig): Promise<void> {
        await this.writeConfig(workspaceRoot, "task-collector.json", config);
    }

    async readTaskIndex(workspaceRoot: vscode.Uri): Promise<StoredTaskIndex | null> {
        return this.readJson<StoredTaskIndex>(this.configUri(workspaceRoot, "tasks-index.json"));
    }

    async writeTaskIndex(workspaceRoot: vscode.Uri, index: StoredTaskIndex): Promise<void> {
        await this.writeConfig(workspaceRoot, "tasks-index.json", index);
    }

    async deleteTaskIndex(workspaceRoot: vscode.Uri): Promise<void> {
        try {
            await this.fs.delete(this.configUri(workspaceRoot, "tasks-index.json"));
        } catch {
            // tasks-index.json may not exist yet — this is expected on first init and safe to
            // ignore. Re-init always rebuilds the index from scratch, so a missing file is fine.
        }
    }

    private configUri(root: vscode.Uri, filename: string): vscode.Uri {
        return getMemoriaConfigUri(root, filename);
    }

    private memoriaDir(root: vscode.Uri): vscode.Uri {
        return getMemoriaDirUri(root);
    }

    private async ensureMemoriaDir(root: vscode.Uri): Promise<void> {
        const key = root.toString();
        if (this.ensuredDirs.has(key)) {
            return;
        }
        await this.fs.createDirectory(this.memoriaDir(root));
        this.ensuredDirs.add(key);
    }

    private async writeConfig(root: vscode.Uri, filename: string, value: unknown): Promise<void> {
        await this.ensureMemoriaDir(root);
        await this.writeJson(this.configUri(root, filename), value);
    }

    private async readJson<T>(uri: vscode.Uri): Promise<T | null> {
        return readJsonFile<T>(this.fs, uri, (failed) => {
            // JSON parse error — unexpected; the file exists but has invalid content.
            this.telemetry?.logError("manifest.parseFailed", {
                file: failed.path.split("/").pop() ?? "unknown",
            });
        });
    }

    private async writeJson(uri: vscode.Uri, value: unknown): Promise<void> {
        await writeJsonFile(this.fs, uri, value);
    }
}
