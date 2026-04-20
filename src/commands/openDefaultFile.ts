// Factory for the "Memoria: Open default file(s)" command handler.
// Opens the blueprint-defined default files for the right-clicked folder in the editor.
// Behavior (close existing editors, side-by-side columns) is controlled per-folder
// via DefaultFilesEntry flags in .memoria/default-files.json.

import * as vscode from "vscode";
import type { ManifestManager } from "../blueprints/manifestManager";
import { getRootFolderName, classifyFilePath } from "../blueprints/workspaceUtils";

export { getRootFolderName } from "../blueprints/workspaceUtils";

export function createOpenDefaultFileCommand(
    manifest: ManifestManager
): (folderUri?: vscode.Uri) => Promise<void> {
    return async (folderUri?: vscode.Uri) => {
        if (!folderUri) {
            return;
        }

        const folders = vscode.workspace.workspaceFolders;
        if (!folders || folders.length === 0) {
            return;
        }

        // Find which workspace folder contains the right-clicked folder.
        const owningFolder = folders.find((f) => {
            const rootPath = f.uri.path.endsWith("/") ? f.uri.path : f.uri.path + "/";
            return folderUri.path.startsWith(rootPath) || folderUri.path === f.uri.path;
        });
        if (!owningFolder) {
            return;
        }

        // Only one root holds .memoria/ — find it to read the default files config.
        const initializedRoot = await manifest.findInitializedRoot(
            folders.map((f) => f.uri)
        );
        if (!initializedRoot) {
            return;
        }

        const defaultFiles = await manifest.readDefaultFiles(initializedRoot);
        if (!defaultFiles || Object.keys(defaultFiles).length === 0) {
            return;
        }

        // Resolve which default files match the right-clicked folder.
        // The folder key is relative to the owning root, not the initialized root.
        const workspaceRoot = owningFolder.uri;
        const rootPath = workspaceRoot.path.endsWith("/")
            ? workspaceRoot.path
            : workspaceRoot.path + "/";
        let relativeFolderPath = folderUri.path.slice(rootPath.length);
        // Normalize to match the keys in defaultFiles (folder paths end with "/").
        const folderKey = relativeFolderPath.endsWith("/")
            ? relativeFolderPath
            : relativeFolderPath + "/";

        // Root-prefixed key (e.g. "MyRoot/00-ToDo/") takes priority over
        // relative key (e.g. "00-ToDo/") for root-specific matching.
        const rootName = getRootFolderName(workspaceRoot);
        let targetEntry = defaultFiles[rootName + "/" + folderKey] ?? defaultFiles[folderKey];

        // Fallback: walk up the directory tree to handle VS Code compact folder mode.
        // When a folder has exactly one subfolder, VS Code displays them together as
        // "parent/child" and passes the leaf folder's URI as the right-click resource.
        // The config entry lives on the parent, so we traverse upward to find it.
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
                    // Resolve files relative to the ancestor folder that owns the config.
                    relativeFolderPath = parentRelPath;
                }
            }
        }

        // Build a set of root names for workspace-absolute file path classification.
        const rootNameSet = new Set(folders.map((f) => getRootFolderName(f.uri)));

        if (!targetEntry || targetEntry.filesToOpen.length === 0) {
            return;
        }

        // Determine behavior flags — both default to true for backward compatibility
        // (matches the original "close everything, open side by side" behavior).
        const closeFirst = targetEntry.closeCurrentlyOpenedFilesFirst ?? true;
        const sideBySide = targetEntry.openSideBySide ?? true;

        if (closeFirst) {
            // Prompt to save unsaved changes before closing editors.
            const shouldProceed = await promptToSaveDirtyFiles();
            if (!shouldProceed) {
                return;
            }

            // Close all existing editors before opening the default files.
            // Use tabGroups API to close tabs without prompting for unsaved files
            // (selected files were already saved by promptToSaveDirtyFiles).
            const allTabs = vscode.window.tabGroups.all.flatMap((g) => g.tabs);
            await vscode.window.tabGroups.close(allTabs);
        }

        // Open each file, skipping any that are missing.
        // File paths are either:
        //   - Workspace-absolute: first segment matches a root name (e.g. "ProjectA/00-ToDo/Main.todo")
        //     → resolved from that root, ignoring the owning folder.
        //   - Folder-relative: resolved from the matched folder (existing behaviour).
        // When openSideBySide is true each file gets its own editor column.
        // When openSideBySide is false all files open in the active column (additional tabs).
        let nextColumn = vscode.ViewColumn.One;
        for (const filePath of targetEntry.filesToOpen) {
            const { isWorkspaceAbsolute, rootName: fileRootName, relPath } = classifyFilePath(filePath, rootNameSet);
            let fileUri: vscode.Uri;
            if (isWorkspaceAbsolute) {
                const fileRoot = folders.find((f) => getRootFolderName(f.uri) === fileRootName)?.uri ?? workspaceRoot;
                fileUri = vscode.Uri.joinPath(fileRoot, ...relPath.split("/").filter(Boolean));
            } else {
                fileUri = vscode.Uri.joinPath(
                    workspaceRoot,
                    ...relativeFolderPath.split("/").filter(Boolean),
                    ...filePath.split("/")
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
    };
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
