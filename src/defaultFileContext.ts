import * as vscode from "vscode";
import type { ManifestManager } from "./blueprints/manifestManager";
import { getRootFolderName, classifyFolderKey, classifyFilePath } from "./blueprints/workspaceUtils";

/**
 * Walks down single-child subfolder chains and adds each step to `lookup`.
 * VS Code compact folder mode shows "parent/child" as one tree item when `child`
 * is the only subfolder of `parent`. The right-click resource URI is the leaf
 * folder, so the leaf must be in the lookup for the context menu `when` clause.
 */
async function addCompactChainDescendants(
    folderUri: vscode.Uri,
    lookup: Record<string, true>,
    depth = 0
): Promise<void> {
    if (depth >= 50) { return; } // guard against unexpectedly deep chains
    try {
        const entries = await vscode.workspace.fs.readDirectory(folderUri);
        const subfolders = entries.filter(([, type]) => type === vscode.FileType.Directory);
        if (subfolders.length === 1) {
            const childUri = vscode.Uri.joinPath(folderUri, subfolders[0][0]);
            lookup[childUri.toString()] = true;
            await addCompactChainDescendants(childUri, lookup, depth + 1);
        }
    } catch {
        // Folder not readable — skip.
    }
}

/**
 * Sets the VS Code context keys for default file availability.
 * - `memoria.defaultFileAvailable`: true when at least one default file exists on disk.
 * - `memoria.defaultFileFolders`: lookup object mapping full folder URI → true for
 *   folders that have an existing default file (drives explorer/context menu visibility).
 *
 * Default file config is read from the single initialized root, but files are checked
 * across all workspace roots so the context menu appears in every root.
 *
 * Keys in defaultFiles are either relative (e.g. "00-ToDo/") — matching any root —
 * or root-prefixed (e.g. "ProjectA/00-ToDo/") — matching only the named root.
 * Root-prefixed keys take priority over relative keys.
 * File paths in values are relative to the matched folder, not to the workspace root.
 */
export async function updateDefaultFileContext(
    initializedRoot: vscode.Uri | null,
    allRoots: vscode.Uri[],
    manifest: ManifestManager
): Promise<void> {
    let available = false;
    const folderLookup: Record<string, true> = {};

    if (initializedRoot) {
        const defaultFiles = await manifest.readDefaultFiles(initializedRoot);
        if (defaultFiles) {
            const rootNameSet = new Set(allRoots.map(getRootFolderName));

            // Each root×key combination requires a file-system stat. These checks are
            // independent so they are collected into an array and awaited in parallel,
            // reducing total latency from O(n) sequential to O(1) (one round trip).
            const checks: Promise<void>[] = [];

            for (const [key, entry] of Object.entries(defaultFiles)) {
                const { isRootSpecific, relFolder, rootName } = classifyFolderKey(key, rootNameSet);

                // Root-specific entries apply only to matching roots.
                // Relative entries apply to all roots that don't have a root-specific override.
                const targetRoots = isRootSpecific
                    ? allRoots.filter((r) => getRootFolderName(r) === rootName)
                    : allRoots.filter((r) => !defaultFiles[getRootFolderName(r) + "/" + key]);

                for (const root of targetRoots) {
                    checks.push(
                        (async () => {
                            const folderSegments = relFolder.endsWith("/") ? relFolder.slice(0, -1) : relFolder;
                            let folderHasFile = false;
                            for (const fileName of entry.filesToOpen) {
                                const { isWorkspaceAbsolute, rootName: fileRootName, relPath } = classifyFilePath(fileName, rootNameSet);
                                let fileUri: vscode.Uri;
                                if (isWorkspaceAbsolute) {
                                    const fileRoot = allRoots.find((r) => getRootFolderName(r) === fileRootName) ?? root;
                                    fileUri = vscode.Uri.joinPath(fileRoot, ...relPath.split("/").filter(Boolean));
                                } else {
                                    fileUri = vscode.Uri.joinPath(
                                        root,
                                        ...folderSegments.split("/"),
                                        ...fileName.split("/")
                                    );
                                }
                                try {
                                    await vscode.workspace.fs.stat(fileUri);
                                    folderHasFile = true;
                                    break;
                                } catch {
                                    // File does not exist — try next.
                                }
                            }
                            if (folderHasFile) {
                                available = true;
                                const folderUri = folderSegments
                                    ? vscode.Uri.joinPath(root, ...folderSegments.split("/"))
                                    : root;
                                folderLookup[folderUri.toString()] = true;
                                // Also register single-child subfolder chains so the context
                                // menu appears on compact "parent/child" items in the explorer.
                                await addCompactChainDescendants(folderUri, folderLookup);
                            }
                        })()
                    );
                }
            }

            await Promise.all(checks);
        }
    }

    await vscode.commands.executeCommand(
        "setContext",
        "memoria.defaultFileAvailable",
        available
    );
    await vscode.commands.executeCommand(
        "setContext",
        "memoria.defaultFileFolders",
        folderLookup
    );
}

/**
 * Holds the active default-file watcher so it can be replaced on re-initialization.
 *
 * An object wrapper is used (instead of a bare `let` variable) so that
 * `registerDefaultFileWatcher` can update `current` in place — the caller passes
 * the holder once and always sees the latest disposable without needing to track
 * the previous value itself.
 */
export interface DefaultFileWatcherHolder { current: vscode.Disposable | undefined; }
export function registerDefaultFileWatcher(
    context: vscode.ExtensionContext,
    initializedRoot: vscode.Uri | null,
    allRoots: vscode.Uri[],
    manifest: ManifestManager,
    holder: DefaultFileWatcherHolder
): void {
    // Dispose previous watchers if any (e.g. on re-init with different default files).
    if (holder.current) {
        holder.current.dispose();
        holder.current = undefined;
    }

    if (!initializedRoot) {
        return;
    }

    const disposables: vscode.Disposable[] = [];

    // Watch the config file itself — re-read and refresh everything when it changes.
    const configWatcher = vscode.workspace.createFileSystemWatcher(
        new vscode.RelativePattern(initializedRoot, ".memoria/default-files.json")
    );
    const onConfigChanged = async (): Promise<void> => {
        await updateDefaultFileContext(initializedRoot, allRoots, manifest);
        // Re-register watchers for the (possibly changed) individual files.
        registerDefaultFileWatcher(context, initializedRoot, allRoots, manifest, holder);
    };
    configWatcher.onDidCreate(() => void onConfigChanged());
    configWatcher.onDidChange(() => void onConfigChanged());
    configWatcher.onDidDelete(() => void updateDefaultFileContext(initializedRoot, allRoots, manifest));
    disposables.push(configWatcher);
    context.subscriptions.push(configWatcher);

    // Also watch each individual default file for create/delete so context keys
    // update when the user adds or removes the actual files on disk.
    // Watch in ALL roots, not just the initialized one.
    // Root-specific entries are watched only in the matching root.
    void manifest.readDefaultFiles(initializedRoot).then((defaultFiles) => {
        if (!defaultFiles || Object.keys(defaultFiles).length === 0) {
            return;
        }

        const rootNameSet = new Set(allRoots.map(getRootFolderName));

        const fileDisposables: vscode.Disposable[] = [];
        for (const [key, entry] of Object.entries(defaultFiles)) {
            const { isRootSpecific, relFolder, rootName } = classifyFolderKey(key, rootNameSet);

            // For watchers, root-specific entries watch only matching roots.
            // Relative entries watch all roots (redundant watchers are harmless).
            const watchRoots = isRootSpecific
                ? allRoots.filter((r) => getRootFolderName(r) === rootName)
                : allRoots;

            for (const root of watchRoots) {
                for (const fileName of entry.filesToOpen) {
                    const watcher = vscode.workspace.createFileSystemWatcher(
                        new vscode.RelativePattern(root, relFolder + fileName)
                    );
                    watcher.onDidCreate(() => void updateDefaultFileContext(initializedRoot, allRoots, manifest));
                    watcher.onDidDelete(() => void updateDefaultFileContext(initializedRoot, allRoots, manifest));
                    fileDisposables.push(watcher);
                    context.subscriptions.push(watcher);
                }
            }
        }
        disposables.push(...fileDisposables);
    });

    holder.current = vscode.Disposable.from(...disposables);
}
