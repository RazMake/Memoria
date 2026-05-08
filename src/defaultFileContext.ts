import * as vscode from "vscode";
import type { ManifestManager } from "./blueprints/manifestManager";
import type { DefaultFilesEntry } from "./blueprints/types";
import { getRootFolderName, classifyFolderKey, classifyFilePath } from "./blueprints/workspaceUtils";
import { stripTrailingSlash } from "./utils/path";

interface FolderCheckResult {
    folderUri: string;
    compactDescendants: Record<string, true>;
}

/**
 * Checks whether at least one default file in `entry` exists on disk for `root` + `relFolder`.
 * Returns the folder URI and compact-chain descendants if a file exists, or `null` otherwise.
 */
async function checkFolderHasDefaultFile(
    root: vscode.Uri,
    relFolder: string,
    entry: DefaultFilesEntry,
    rootNameSet: ReadonlySet<string>,
    allRoots: readonly vscode.Uri[],
): Promise<FolderCheckResult | null> {
    const folderSegments = stripTrailingSlash(relFolder);

    for (const fileName of entry.filesToOpen) {
        const { isWorkspaceAbsolute, rootName: fileRootName, relPath } = classifyFilePath(fileName, rootNameSet);
        const fileUri = isWorkspaceAbsolute
            ? vscode.Uri.joinPath(
                  allRoots.find((r) => getRootFolderName(r) === fileRootName) ?? root,
                  ...relPath.split("/").filter(Boolean),
              )
            : vscode.Uri.joinPath(root, ...folderSegments.split("/"), ...fileName.split("/"));

        try {
            await vscode.workspace.fs.stat(fileUri);
        } catch {
            continue;
        }

        const folderUri = folderSegments
            ? vscode.Uri.joinPath(root, ...folderSegments.split("/"))
            : root;

        const compactDescendants: Record<string, true> = {};
        await addCompactChainDescendants(folderUri, compactDescendants);

        return { folderUri: folderUri.toString(), compactDescendants };
    }

    return null;
}

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
    const { available, folderLookup } = initializedRoot
        ? await scanDefaultFiles(initializedRoot, allRoots, manifest)
        : { available: false, folderLookup: {} as Record<string, true> };

    await vscode.commands.executeCommand("setContext", "memoria.defaultFileAvailable", available);
    await vscode.commands.executeCommand("setContext", "memoria.defaultFileFolders", folderLookup);
}

function resolveRootsForKey(
    key: string,
    rootNameSet: ReadonlySet<string>,
    allRoots: readonly vscode.Uri[],
): { isRootSpecific: boolean; relFolder: string; rootName: string | undefined; matchedRoots: vscode.Uri[] } {
    const { isRootSpecific, relFolder, rootName } = classifyFolderKey(key, rootNameSet);
    const matchedRoots = isRootSpecific
        ? allRoots.filter((r) => getRootFolderName(r) === rootName)
        : [...allRoots];
    return { isRootSpecific, relFolder, rootName, matchedRoots };
}

async function scanDefaultFiles(
    initializedRoot: vscode.Uri,
    allRoots: vscode.Uri[],
    manifest: ManifestManager
): Promise<{ available: boolean; folderLookup: Record<string, true> }> {
    const defaultFiles = await manifest.readDefaultFiles(initializedRoot);
    if (!defaultFiles) {
        return { available: false, folderLookup: {} };
    }

    let available = false;
    const folderLookup: Record<string, true> = {};
    const rootNameSet = new Set(allRoots.map(getRootFolderName));

    const checks = Object.entries(defaultFiles).flatMap(([key, entry]) => {
        const { isRootSpecific, relFolder, matchedRoots } = resolveRootsForKey(key, rootNameSet, allRoots);

        const targetRoots = isRootSpecific
            ? matchedRoots
            : matchedRoots.filter((r) => !defaultFiles[getRootFolderName(r) + "/" + key]);

        return targetRoots.map((root) =>
            checkFolderHasDefaultFile(root, relFolder, entry, rootNameSet, allRoots).then(
                (result) => {
                    if (result) {
                        available = true;
                        folderLookup[result.folderUri] = true;
                        Object.assign(folderLookup, result.compactDescendants);
                    }
                },
            ),
        );
    });

    await Promise.all(checks);
    return { available, folderLookup };
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
export async function registerDefaultFileWatcher(
    context: vscode.ExtensionContext,
    initializedRoot: vscode.Uri | null,
    allRoots: vscode.Uri[],
    manifest: ManifestManager,
    holder: DefaultFileWatcherHolder
): Promise<void> {
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
        await registerDefaultFileWatcher(context, initializedRoot, allRoots, manifest, holder);
    };
    configWatcher.onDidCreate(() => void onConfigChanged());
    configWatcher.onDidChange(() => void onConfigChanged());
    configWatcher.onDidDelete(() => void updateDefaultFileContext(initializedRoot, allRoots, manifest));
    disposables.push(configWatcher);
    context.subscriptions.push(configWatcher);

    // Also watch each individual default file for create/delete so context keys
    // update when the user adds or removes the actual files on disk.
    const defaultFiles = await manifest.readDefaultFiles(initializedRoot);
    if (defaultFiles && Object.keys(defaultFiles).length > 0) {
        const rootNameSet = new Set(allRoots.map(getRootFolderName));

        for (const [key, entry] of Object.entries(defaultFiles)) {
            const { relFolder, matchedRoots: watchRoots } = resolveRootsForKey(key, rootNameSet, allRoots);

            for (const root of watchRoots) {
                for (const fileName of entry.filesToOpen) {
                    const watcher = vscode.workspace.createFileSystemWatcher(
                        new vscode.RelativePattern(root, relFolder + fileName)
                    );
                    watcher.onDidCreate(() => void updateDefaultFileContext(initializedRoot, allRoots, manifest));
                    watcher.onDidDelete(() => void updateDefaultFileContext(initializedRoot, allRoots, manifest));
                    disposables.push(watcher);
                    context.subscriptions.push(watcher);
                }
            }
        }
    }

    holder.current = vscode.Disposable.from(...disposables);
}
