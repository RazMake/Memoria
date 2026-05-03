// URI classification and path resolution for the task collector.
// Extracted from TaskCollectorFeature to keep path logic separate from
// orchestration and event handling.

import * as path from "node:path";
import * as vscode from "vscode";
import { minimatch } from "minimatch";
import { normalizePath } from "../../utils/path";
import { isMarkdownPath } from "../../utils/markdown";
import { makeSourceKey } from "./taskIndex";
import type { SourceContext } from "./taskHelpers";
import type { TaskCollectorConfig } from "./types";

export function describeUri(
    uri: vscode.Uri,
    workspaceRoot: vscode.Uri | null,
): SourceContext | null {
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
    if (!workspaceFolder || !workspaceRoot || !isMarkdownPath(uri.path)) {
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

export function resolveSourceUri(source: string | null, sourceRoot: string | null): vscode.Uri | null {
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

export async function findTrackedSources(
    config: TaskCollectorConfig,
    isTrackedSourceUri: (uri: vscode.Uri, config: TaskCollectorConfig) => Promise<boolean>,
): Promise<vscode.Uri[]> {
    const found = new Map<string, vscode.Uri>();
    const folders = vscode.workspace.workspaceFolders ?? [];

    for (const folder of folders) {
        for (const includePattern of config.include) {
            const results = await vscode.workspace.findFiles(new vscode.RelativePattern(folder, includePattern));
            for (const uri of results) {
                if (await isTrackedSourceUri(uri, config)) {
                    found.set(uri.toString(), uri);
                }
            }
        }
    }

    return [...found.values()].sort((left, right) => left.toString().localeCompare(right.toString()));
}

export function isCollectorUri(
    uri: vscode.Uri,
    collectorPath: string | null,
    workspaceRoot: vscode.Uri | null,
    getCollectorUri: () => vscode.Uri,
): boolean {
    return collectorPath !== null && workspaceRoot !== null && uri.toString() === getCollectorUri().toString();
}

export function getCollectorUri(workspaceRoot: vscode.Uri | null, collectorPath: string | null): vscode.Uri {
    if (!workspaceRoot || !collectorPath) {
        throw new Error("Memoria: Task collector is not initialized.");
    }
    return vscode.Uri.joinPath(workspaceRoot, ...collectorPath.split("/"));
}

export async function isTrackedSourceUri(
    uri: vscode.Uri,
    workspaceRoot: vscode.Uri | null,
    collectorPath: string | null,
    config: TaskCollectorConfig,
    readConfig: () => Promise<TaskCollectorConfig>,
): Promise<boolean> {
    if (!isMarkdownPath(uri.path)) {
        return false;
    }
    if (collectorPath !== null && workspaceRoot !== null
        && uri.toString() === vscode.Uri.joinPath(workspaceRoot, ...collectorPath.split("/")).toString()) {
        return false;
    }

    const context = describeUri(uri, workspaceRoot);
    if (!context) {
        return false;
    }

    const effectiveConfig = config ?? await readConfig();
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
