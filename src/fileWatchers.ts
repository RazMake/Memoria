import * as vscode from "vscode";
import { ManifestManager } from "./blueprints/manifestManager";
import { updateDefaultFileContext, registerDefaultFileWatcher, type DefaultFileWatcherHolder } from "./defaultFileContext";
import { FeatureManager } from "./features/featureManager";
import { updateWorkspaceInitializedContext } from "./blueprintUpdateCheck";

/**
 * Refreshes all workspace-level state derived from the initialized root:
 * context key, feature manager, and default file context.
 * Extracted to eliminate the 3-call sequence duplicated across activation and file watchers.
 */
export async function refreshWorkspaceState(
    root: vscode.Uri | null,
    roots: vscode.Uri[],
    manifest: ManifestManager,
    featureManager: FeatureManager,
): Promise<void> {
    await Promise.all([
        updateWorkspaceInitializedContext(root),
        featureManager.refresh(root),
        updateDefaultFileContext(root, roots, manifest),
    ]);
}

function watchRoots(
    context: vscode.ExtensionContext,
    roots: vscode.Uri[],
    glob: string,
    handlers: {
        onDidCreate?: () => void;
        onDidChange?: () => void;
        onDidDelete?: () => void;
    },
): void {
    for (const root of roots) {
        const watcher = vscode.workspace.createFileSystemWatcher(
            new vscode.RelativePattern(root, glob),
        );
        if (handlers.onDidCreate) { watcher.onDidCreate(handlers.onDidCreate); }
        if (handlers.onDidChange) { watcher.onDidChange(handlers.onDidChange); }
        if (handlers.onDidDelete) { watcher.onDidDelete(handlers.onDidDelete); }
        context.subscriptions.push(watcher);
    }
}

/**
 * Watches .memoria/blueprint.json across all workspace roots so the context key
 * and features stay in sync when external tools or the user modify the file system.
 *
 * Two complementary listeners are needed:
 *  - FileSystemWatcher — fires for external FS changes (terminal, OS, etc.)
 *  - onDidDeleteFiles  — fires when the user deletes via the VS Code Explorer.
 *    (Deleting the .memoria/ *directory* does not trigger the file-level watcher
 *     because the glob targets a child file, not the directory itself.)
 */
export function registerFileWatchers(
    context: vscode.ExtensionContext,
    roots: vscode.Uri[],
    manifest: ManifestManager,
    featureManager: FeatureManager,
    initializedRoot: vscode.Uri | null,
    defaultFileWatcherHolder: DefaultFileWatcherHolder
): void {
    // Tracks the previously seen initialized root. Used to short-circuit recheckInitialization()
    // when the filesystem watcher fires but the initialized root has not actually changed —
    // this avoids redundant feature refreshes on unrelated file-system events.
    let lastKnownRoot: string | null = initializedRoot?.toString() ?? null;

    const recheckInitialization = async (): Promise<void> => {
        const currentRoot = await manifest.findInitializedRoot(roots);
        const currentRootStr = currentRoot?.toString() ?? null;
        if (currentRootStr === lastKnownRoot) {
            return;
        }
        lastKnownRoot = currentRootStr;
        await refreshWorkspaceState(currentRoot, roots, manifest, featureManager);
        void registerDefaultFileWatcher(context, currentRoot, roots, manifest, defaultFileWatcherHolder);
    };

    // Watch every root — not just the first — so multi-root workspaces are fully covered.
    watchRoots(context, roots, ".memoria/blueprint.json", {
        onDidCreate: recheckInitialization,
        onDidDelete: recheckInitialization,
    });

    // Watch decorations.json so explorer colors update live when the user edits the file.
    // This needs a separate handler because recheckInitialization short-circuits when the
    // initialized root hasn't changed — but here the root is the same, only the rules changed.
    const refreshFeatures = async (): Promise<void> => {
        const currentRoot = await manifest.findInitializedRoot(roots);
        await featureManager.refresh(currentRoot);
    };
    const onDecChange = () => void refreshFeatures();
    watchRoots(context, roots, ".memoria/decorations.json", {
        onDidCreate: onDecChange,
        onDidChange: onDecChange,
        onDidDelete: onDecChange,
    });

    const memoriaDir = "/.memoria";
    context.subscriptions.push(
        vscode.workspace.onDidDeleteFiles((e) => {
            const affectsMemoria = e.files.some((uri) =>
                uri.path.includes(memoriaDir + "/") || uri.path.endsWith(memoriaDir)
            );
            if (affectsMemoria) {
                void recheckInitialization();
            }
        })
    );
}
