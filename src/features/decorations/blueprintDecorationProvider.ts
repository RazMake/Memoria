// Provides file/folder decorations (badge + color) in the VS Code Explorer based on the
// decoration rules stored in .memoria/decorations.json.
//
// Rules are loaded on demand (via refresh()) and cached in memory. Calling refresh() after
// init or re-init causes VS Code to re-query all URIs so freshly applied rules take effect
// immediately without a reload.

import * as vscode from "vscode";
import type { ManifestManager } from "../../blueprints/manifestManager";
import type { DecorationRule } from "../../blueprints/types";

export class BlueprintDecorationProvider implements vscode.FileDecorationProvider {
    // EventEmitter drives VS Code's re-query of all decorated URIs. Firing with `undefined`
    // tells VS Code to refresh every URI, which is the right behaviour after a rule change.
    private readonly _onDidChangeFileDecorations = new vscode.EventEmitter<
        vscode.Uri | vscode.Uri[] | undefined
    >();
    readonly onDidChangeFileDecorations = this._onDidChangeFileDecorations.event;

    private rules: DecorationRule[] = [];
    private workspaceRoot: vscode.Uri | null = null;

    constructor(private readonly manifest: ManifestManager) {}

    /**
     * Reloads decoration rules from .memoria/decorations.json and fires the change event
     * so VS Code re-queries all URIs. Should be called after every successful init/reinit.
     * Discovers the initialized root itself so callers do not need to pass it — this keeps
     * the onWorkspaceInitialized callback signature unchanged from Phase 1/2.
     */
    async refresh(): Promise<void> {
        const folders = vscode.workspace.workspaceFolders;
        const roots = folders ? folders.map((f) => f.uri) : [];
        const initializedRoot = await this.manifest.findInitializedRoot(roots);

        if (initializedRoot) {
            const config = await this.manifest.readDecorations(initializedRoot);
            this.workspaceRoot = initializedRoot;
            this.rules = config?.rules ?? [];
        } else {
            this.workspaceRoot = null;
            this.rules = [];
        }

        this._onDidChangeFileDecorations.fire(undefined);
    }

    provideFileDecoration(uri: vscode.Uri): vscode.FileDecoration | undefined {
        if (!this.workspaceRoot || this.rules.length === 0) {
            return undefined;
        }

        const rootPath = this.workspaceRoot.path;
        const uriPath = uri.path;

        // Only decorate items that live inside the initialized workspace root.
        if (!uriPath.startsWith(rootPath + "/") && uriPath !== rootPath) {
            return undefined;
        }

        // Workspace-relative path, always forward-slash separated. Strip leading /.
        const relativePath = uriPath.slice(rootPath.length).replace(/^\//, "");
        if (!relativePath) {
            return undefined; // Don't decorate the root itself.
        }

        for (const rule of this.rules) {
            if (matchesFilter(rule.filter, relativePath, rule.propagate ?? false)) {
                return buildDecoration(rule);
            }
        }

        return undefined;
    }

    dispose(): void {
        this._onDidChangeFileDecorations.dispose();
    }
}

/**
 * Returns true when `relativePath` satisfies `filter`.
 *
 * Supported filter syntaxes:
 *   "FolderName/"   — matches any item whose last path segment equals FolderName.
 *                     Applied to both files and folders; the trailing / is a convention
 *                     (provideFileDecoration does not receive file-type information).
 *                     When `propagate` is true, any item whose path includes a segment
 *                     equal to FolderName is matched (folder itself + all descendants).
 *   "*.ext"         — matches any item whose filename ends with ".ext".
 *   "exact/path"    — exact workspace-relative path match.
 */
export function matchesFilter(filter: string, relativePath: string, propagate = false): boolean {
    if (filter.endsWith("/")) {
        const name = filter.slice(0, -1);
        const segments = relativePath.split("/");
        if (propagate) {
            return segments.includes(name);
        }
        const lastSegment = segments.at(-1) ?? "";
        return lastSegment === name;
    }

    if (filter.startsWith("*.")) {
        const extension = filter.slice(1); // e.g. ".todo"
        const lastSegment = relativePath.split("/").at(-1) ?? "";
        return lastSegment.endsWith(extension);
    }

    return relativePath === filter;
}

/** Converts a DecorationRule into a vscode.FileDecoration. Returns undefined if the rule has no visible properties. */
function buildDecoration(rule: DecorationRule): vscode.FileDecoration | undefined {
    if (!rule.color && !rule.badge && !rule.tooltip) {
        return undefined;
    }
    return new vscode.FileDecoration(
        rule.badge,
        rule.tooltip,
        rule.color ? new vscode.ThemeColor(rule.color) : undefined
    );
}
