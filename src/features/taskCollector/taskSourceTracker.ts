import * as path from "node:path";
import * as vscode from "vscode";
import { minimatch } from "minimatch";
import type { ManifestManager } from "../../blueprints/manifestManager";
import { normalizePath } from "../../utils/path";
import { DEFAULT_TASK_COLLECTOR_CONFIG, makeSourceKey } from "./taskIndex";
import { isMarkdownPath, type SourceContext } from "./taskHelpers";
import type { TaskCollectorConfig } from "./types";

export class TaskSourceTracker {
    constructor(
        private readonly workspaceRoot: vscode.Uri,
        private readonly collectorPath: string,
        private readonly manifest: ManifestManager,
    ) {}

    async findTrackedSources(config: TaskCollectorConfig): Promise<vscode.Uri[]> {
        const found = new Map<string, vscode.Uri>();
        const folders = vscode.workspace.workspaceFolders ?? [];

        for (const folder of folders) {
            for (const includePattern of config.include) {
                const results = await vscode.workspace.findFiles(new vscode.RelativePattern(folder, includePattern));
                for (const uri of results) {
                    if (await this.isTrackedSourceUri(uri, config)) {
                        found.set(uri.toString(), uri);
                    }
                }
            }
        }

        return [...found.values()].sort((left, right) => left.toString().localeCompare(right.toString()));
    }

    async isTrackedSourceUri(uri: vscode.Uri, config?: TaskCollectorConfig): Promise<boolean> {
        if (!isMarkdownPath(uri.path)) {
            return false;
        }
        if (this.isCollectorUri(uri)) {
            return false;
        }

        const context = this.describeUri(uri);
        if (!context) {
            return false;
        }

        const effectiveConfig = config ?? await this.readConfig();
        if (context.relativePath.startsWith(".memoria/") || context.relativePath.startsWith("WorkspaceInitializationBackups/")) {
            return false;
        }

        const includeMatch = effectiveConfig.include.some((pattern) => minimatch(context.relativePath, pattern, { dot: true }));
        if (!includeMatch) {
            return false;
        }

        const excludePatterns = [
            ...effectiveConfig.exclude,
            "**/.memoria/**",
            "**/WorkspaceInitializationBackups/**",
        ];
        return !excludePatterns.some((pattern) => minimatch(context.relativePath, pattern, { dot: true }));
    }

    isCollectorUri(uri: vscode.Uri): boolean {
        return uri.toString() === this.getCollectorUri().toString();
    }

    getCollectorUri(): vscode.Uri {
        return vscode.Uri.joinPath(this.workspaceRoot, ...this.collectorPath.split("/"));
    }

    describeUri(uri: vscode.Uri): SourceContext | null {
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
        if (!workspaceFolder || !isMarkdownPath(uri.path)) {
            return null;
        }

        const relativePath = normalizePath(path.relative(workspaceFolder.uri.fsPath, uri.fsPath));
        return {
            uri,
            workspaceFolder,
            sourceRoot: workspaceFolder.name,
            relativePath,
            sourceKey: makeSourceKey(relativePath, workspaceFolder.name),
        };
    }

    resolveSourceUri(source: string | null, sourceRoot: string | null): vscode.Uri | null {
        if (!source) {
            return null;
        }

        const folders = vscode.workspace.workspaceFolders ?? [];
        const candidates = sourceRoot
            ? folders.filter((folder) => folder.name === sourceRoot)
            : folders;

        for (const folder of candidates) {
            return vscode.Uri.joinPath(folder.uri, ...source.split("/"));
        }

        return null;
    }

    private async readConfig(): Promise<TaskCollectorConfig> {
        const stored = await this.manifest.readTaskCollectorConfig(this.workspaceRoot);
        return {
            completedRetentionDays: stored?.completedRetentionDays ?? DEFAULT_TASK_COLLECTOR_CONFIG.completedRetentionDays,
            syncOnStartup: stored?.syncOnStartup ?? DEFAULT_TASK_COLLECTOR_CONFIG.syncOnStartup,
            include: stored?.include ?? [...DEFAULT_TASK_COLLECTOR_CONFIG.include],
            exclude: stored?.exclude ?? [...DEFAULT_TASK_COLLECTOR_CONFIG.exclude],
            debounceMs: stored?.debounceMs ?? DEFAULT_TASK_COLLECTOR_CONFIG.debounceMs,
        };
    }
}
