// Provides file/folder decorations (badge + color) in the VS Code Explorer based on the
// decoration rules stored in .memoria/decorations.json.
//
// WHY decorations are applied per-file rather than per-directory: VS Code's
// FileDecorationProvider API works per-resource URI, one at a time. There is no
// directory-level API; folder decoration propagation to children is opt-in via the
// `propagate` flag in the decoration options, which this provider honours per-rule.
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
    /** Pre-built decorations matching rules by index — avoids allocating on every provideFileDecoration call. */
    private builtDecorations: (vscode.FileDecoration | undefined)[] = [];
    /** All workspace root paths to decorate (not just the initialized one). */
    private rootPaths: string[] = [];
    /** Tracks whether diagnostic suppression is currently active so the config watcher can re-apply it. */
    private suppressionRoot: vscode.Uri | null = null;

    constructor(private readonly manifest: ManifestManager) {}

    /**
     * Reloads decoration rules from .memoria/decorations.json and fires the change event
     * so VS Code re-queries all URIs. Called by FeatureManager after every refresh cycle.
     *
     * WHY fireChangeEvent() is called after loading: VS Code caches the last decoration
     * per URI and will not re-query the provider unless it receives an explicit change
     * notification. Without firing the event, new rules would have no visible effect
     * until the Explorer refreshed for an unrelated reason.
     *
     * Rules are read from `initializedRoot` but applied to items under any of the
     * `allRoots` — in a multi-root workspace only one root holds .memoria/ but
     * folders in other roots should still be decorated.
     *
     * When `enabled` is false the provider clears all rules so no decorations are shown.
     */
    async refresh(initializedRoot: vscode.Uri | null, enabled: boolean, allRoots?: vscode.Uri[]): Promise<void> {
        if (initializedRoot && enabled) {
            const config = await this.manifest.readDecorations(initializedRoot);
            this.rules = config?.rules ?? [];
            this.rootPaths = (allRoots ?? [initializedRoot]).map((r) => r.path);
        } else {
            this.rules = [];
            this.rootPaths = [];
        }

        this.builtDecorations = this.rules.map(buildDecoration);
        this._onDidChangeFileDecorations.fire(undefined);
        this.suppressionRoot = (initializedRoot && enabled) ? initializedRoot : null;
        await suppressDiagnosticDecorations(initializedRoot, enabled);
    }

    /**
     * Returns a disposable that watches for external changes to `problems.decorations.enabled`
     * and re-suppresses them while custom decorations are active.
     *
     * WHY: The suppression writes `problems.decorations.enabled: false` into
     * `.vscode/settings.json`. If that file is overwritten externally (git pull,
     * another editor, a script) the setting is lost and diagnostic colors reappear
     * on folders, overriding Memoria's custom colors. This listener detects the
     * change and re-applies the suppression.
     */
    watchDiagnosticSuppression(): vscode.Disposable {
        return vscode.workspace.onDidChangeConfiguration((e) => {
            if (this.suppressionRoot && e.affectsConfiguration("problems.decorations.enabled")) {
                void suppressDiagnosticDecorations(this.suppressionRoot, true);
            }
        });
    }

    provideFileDecoration(uri: vscode.Uri): vscode.FileDecoration | undefined {
        if (this.rules.length === 0 || this.rootPaths.length === 0) {
            return undefined;
        }

        const uriPath = uri.path;

        // Find which workspace root this URI belongs to.
        let relativePath: string | undefined;
        for (const rootPath of this.rootPaths) {
            if (uriPath.startsWith(rootPath + "/")) {
                relativePath = uriPath.slice(rootPath.length + 1);
                break;
            }
            if (uriPath === rootPath) {
                // Don't decorate the root itself.
                return undefined;
            }
        }

        if (relativePath === undefined) {
            return undefined;
        }

        for (let i = 0; i < this.rules.length; i++) {
            if (matchesFilter(this.rules[i].filter, relativePath, this.rules[i].propagate ?? false)) {
                return this.builtDecorations[i];
            }
        }

        return undefined;
    }

    dispose(): void {
        this._onDidChangeFileDecorations.dispose();
        this.suppressionRoot = null;
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
 *   "Glob*Name/"    — like folder filters but the name may contain `*` wildcards.
 *                     For example `".*&#47;"` matches any dot-folder (`.memoria`, `.git`, etc.).
 *   "*.ext"         — matches any item whose filename ends with ".ext".
 *   "exact/path"    — exact workspace-relative path match.
 */
export function matchesFilter(filter: string, relativePath: string, propagate = false): boolean {
    if (filter.endsWith("/")) {
        const name = filter.slice(0, -1);

        if (name.includes("*")) {
            const pattern = simpleGlobToRegex(name);
            if (propagate) {
                return relativePath.split("/").some((seg) => pattern.test(seg));
            }
            const lastSlash = relativePath.lastIndexOf("/");
            const lastSegment = lastSlash >= 0 ? relativePath.slice(lastSlash + 1) : relativePath;
            return pattern.test(lastSegment);
        }

        if (propagate) {
            // Check if any segment equals the filter name.
            // Segments are delimited by "/" — so name must appear between "/" boundaries
            // or at the start/end of the path.
            return relativePath === name
                || relativePath.startsWith(name + "/")
                || relativePath.endsWith("/" + name)
                || relativePath.includes("/" + name + "/");
        }
        // Non-propagate: only the last segment must match.
        const lastSlash = relativePath.lastIndexOf("/");
        const lastSegment = lastSlash >= 0 ? relativePath.slice(lastSlash + 1) : relativePath;
        return lastSegment === name;
    }

    if (filter.startsWith("*.")) {
        const extension = filter.slice(1); // e.g. ".todo"
        const lastSlash = relativePath.lastIndexOf("/");
        const lastSegment = lastSlash >= 0 ? relativePath.slice(lastSlash + 1) : relativePath;
        return lastSegment.endsWith(extension);
    }

    if (propagate) {
        return relativePath === filter || relativePath.startsWith(filter + "/");
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

/**
 * Suppresses VS Code's built-in diagnostic decorations in the Explorer when Memoria's
 * custom Explorer Decorations feature is active.
 *
 * WHY: VS Code propagates warning/error severity colors from files to their parent
 * folders. This overrides Memoria's custom folder colors (e.g. a purple "Workstreams"
 * folder turns orange when a child file has a warning). Disabling
 * `problems.decorations.enabled` prevents that propagation while diagnostics remain
 * visible in the Problems panel, editor squiggles, and the status bar.
 *
 * The setting is applied at the workspace level so it only affects initialized
 * workspaces and does not change the user's global preference.
 */
async function suppressDiagnosticDecorations(root: vscode.Uri | null, decorationsEnabled: boolean): Promise<void> {
    if (!root) {
        return;
    }
    const config = vscode.workspace.getConfiguration("problems.decorations", root);
    const inspect = config.inspect<boolean>("enabled");

    if (decorationsEnabled) {
        // Only set when not already set at workspace level to avoid needless writes.
        if (inspect?.workspaceValue !== false) {
            await config.update("enabled", false, vscode.ConfigurationTarget.Workspace);
        }
    } else {
        // Remove the workspace override so the user's global setting takes effect again.
        if (inspect?.workspaceValue !== undefined) {
            await config.update("enabled", undefined, vscode.ConfigurationTarget.Workspace);
        }
    }
}

/**
 * Converts a simple glob (only `*` wildcards) into a RegExp anchored to match the full string.
 * All regex-special characters except `*` are escaped; each `*` becomes `.*`.
 */
function simpleGlobToRegex(glob: string): RegExp {
    const escaped = glob.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp("^" + escaped.replace(/\*/g, ".*") + "$");
}
