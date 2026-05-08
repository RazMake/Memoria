// Factory for the "Memoria: Open default file(s)" command handler.
// Opens the blueprint-defined default files for the right-clicked folder in the editor.
// Behavior (close existing editors, side-by-side columns) is controlled per-folder
// via DefaultFilesEntry flags in .memoria/default-files.json.

import * as vscode from "vscode";
import type { ManifestManager } from "../blueprints/manifestManager";
import type { DefaultFilesEntry } from "../blueprints/types";
import { getRootFolderName, classifyFilePath } from "../blueprints/workspaceUtils";

interface ResolvedDefaultFiles {
    entry: DefaultFilesEntry;
    relativeFolderPath: string;
    workspaceRoot: vscode.Uri;
    folders: readonly vscode.WorkspaceFolder[];
}

export function createOpenDefaultFileCommand(
    manifest: ManifestManager
): (folderUri?: vscode.Uri) => Promise<void> {
    return async (folderUri?: vscode.Uri) => {
        if (!folderUri) {
            return;
        }

        const resolved = await resolveDefaultFilesEntry(manifest, folderUri);
        if (!resolved) {
            return;
        }

        const { entry, relativeFolderPath, workspaceRoot, folders } = resolved;
        const closeFirst = entry.closeCurrentlyOpenedFilesFirst ?? true;
        const sideBySide = entry.openSideBySide ?? true;

        if (closeFirst) {
            const shouldProceed = await promptToSaveDirtyFiles();
            if (!shouldProceed) {
                return;
            }

            const allTabs = vscode.window.tabGroups.all.flatMap((g) => g.tabs);
            await vscode.window.tabGroups.close(allTabs);
        }

        await openFilesFromEntry(entry.filesToOpen, workspaceRoot, relativeFolderPath, folders, sideBySide);
    };
}

/**
 * Resolves which default-files entry matches the right-clicked folder.
 * Walks up the directory tree for VS Code compact folder mode support.
 */
async function resolveDefaultFilesEntry(
    manifest: ManifestManager,
    folderUri: vscode.Uri,
): Promise<ResolvedDefaultFiles | null> {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
        return null;
    }

    const owningFolder = folders.find((f) => {
        const rootPath = f.uri.path.endsWith("/") ? f.uri.path : f.uri.path + "/";
        return folderUri.path.startsWith(rootPath) || folderUri.path === f.uri.path;
    });
    if (!owningFolder) {
        return null;
    }

    const initializedRoot = await manifest.findInitializedRoot(folders.map((f) => f.uri));
    if (!initializedRoot) {
        return null;
    }

    const defaultFiles = await manifest.readDefaultFiles(initializedRoot);
    if (!defaultFiles || Object.keys(defaultFiles).length === 0) {
        return null;
    }

    const workspaceRoot = owningFolder.uri;
    const rootPath = workspaceRoot.path.endsWith("/") ? workspaceRoot.path : workspaceRoot.path + "/";
    let relativeFolderPath = folderUri.path.slice(rootPath.length);
    const folderKey = relativeFolderPath.endsWith("/") ? relativeFolderPath : relativeFolderPath + "/";
    const rootName = getRootFolderName(workspaceRoot);

    let targetEntry = defaultFiles[rootName + "/" + folderKey] ?? defaultFiles[folderKey];

    // Walk up the directory tree for VS Code compact folder mode.
    if (!targetEntry) {
        let parentRelPath = relativeFolderPath;
        while (!targetEntry) {
            const lastSlash = parentRelPath.lastIndexOf("/");
            if (lastSlash < 0) { break; }
            parentRelPath = parentRelPath.substring(0, lastSlash);
            const parentKey = parentRelPath + "/";
            const parentEntry = defaultFiles[rootName + "/" + parentKey] ?? defaultFiles[parentKey];
            if (parentEntry) {
                targetEntry = parentEntry;
                relativeFolderPath = parentRelPath;
            }
        }
    }

    if (!targetEntry || targetEntry.filesToOpen.length === 0) {
        return null;
    }

    return { entry: targetEntry, relativeFolderPath, workspaceRoot, folders };
}

/** Opens each file from the entry, resolving workspace-absolute vs folder-relative paths. */
async function openFilesFromEntry(
    filesToOpen: string[],
    workspaceRoot: vscode.Uri,
    relativeFolderPath: string,
    folders: readonly vscode.WorkspaceFolder[],
    sideBySide: boolean,
): Promise<void> {
    const rootNameSet = new Set(folders.map((f) => getRootFolderName(f.uri)));
    let nextColumn = vscode.ViewColumn.One;

    for (const filePath of filesToOpen) {
        const { isWorkspaceAbsolute, rootName: fileRootName, relPath } = classifyFilePath(filePath, rootNameSet);
        let fileUri: vscode.Uri;
        if (isWorkspaceAbsolute) {
            const fileRoot = folders.find((f) => getRootFolderName(f.uri) === fileRootName)?.uri ?? workspaceRoot;
            fileUri = vscode.Uri.joinPath(fileRoot, ...relPath.split("/").filter(Boolean));
        } else {
            fileUri = vscode.Uri.joinPath(
                workspaceRoot,
                ...relativeFolderPath.split("/").filter(Boolean),
                ...filePath.split("/"),
            );
        }
        try {
            await vscode.commands.executeCommand("vscode.open", fileUri, {
                viewColumn: sideBySide ? nextColumn : vscode.ViewColumn.Active,
                preview: false,
            });
            if (sideBySide) {
                nextColumn++;
            }
        } catch {
            // File does not exist on disk — skip silently.
        }
    }
}

/**
 * If any open text documents have unsaved changes, shows a multi-select
 * QuickPick so the user can choose which files to save. Checked files are
 * saved, unchecked files will be discarded. Returns `true` to proceed, `false`
 * if the user cancelled.
 */
export async function promptToSaveDirtyFiles(): Promise<boolean> {
    const dirtyDocs = vscode.workspace.textDocuments.filter((d) => d.isDirty);
    if (dirtyDocs.length === 0) {
        return true;
    }

    interface DirtyFileItem extends vscode.QuickPickItem {
        doc: vscode.TextDocument;
    }

    const items: DirtyFileItem[] = dirtyDocs.map((doc) => ({
        label: vscode.workspace.asRelativePath(doc.uri),
        picked: true,
        doc,
    }));

    const picked = await vscode.window.showQuickPick(items, {
        canPickMany: true,
        title: "Save changes before closing?",
        placeHolder: "Checked files will be saved, unchecked files will be discarded",
    });

    // User pressed Escape / cancelled the QuickPick.
    if (!picked) {
        return false;
    }

    const toSave = new Set(picked.map((p) => p.doc));

    // Save checked files.
    await Promise.all(
        dirtyDocs.filter((doc) => toSave.has(doc)).map((doc) => doc.save()),
    );

    // Revert unchecked files so they are no longer dirty — this prevents
    // the built-in "Save changes?" dialog when tabs are closed afterwards.
    for (const doc of dirtyDocs) {
        if (!toSave.has(doc)) {
            await vscode.window.showTextDocument(doc, { preserveFocus: true, preview: true });
            await vscode.commands.executeCommand("workbench.action.files.revert");
        }
    }

    return true;
}
