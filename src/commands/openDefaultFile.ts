// Factory for the "Memoria: Open default file(s)" command handler.
// Opens the blueprint-defined default files for the right-clicked folder in the editor, side by side.

import * as vscode from "vscode";
import type { ManifestManager } from "../blueprints/manifestManager";
import { getRootFolderName } from "../blueprints/workspaceUtils";

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
        const relativeFolderPath = folderUri.path.slice(rootPath.length);
        // Normalize to match the keys in defaultFiles (folder paths end with "/").
        const folderKey = relativeFolderPath.endsWith("/")
            ? relativeFolderPath
            : relativeFolderPath + "/";

        // Root-prefixed key (e.g. "MyRoot/00-ToDo/") takes priority over
        // relative key (e.g. "00-ToDo/") for root-specific matching.
        const rootName = getRootFolderName(workspaceRoot);
        const targetFiles = defaultFiles[rootName + "/" + folderKey] ?? defaultFiles[folderKey];

        if (!targetFiles || targetFiles.length === 0) {
            return;
        }

        // Close all existing editors before opening the default files.
        await vscode.commands.executeCommand("workbench.action.closeAllEditors");

        // Open each file side by side, skipping any that are missing.
        // File paths are relative to the matched folder, not to the workspace root.
        let nextColumn = vscode.ViewColumn.One;
        for (const filePath of targetFiles) {
            const fileUri = vscode.Uri.joinPath(
                workspaceRoot,
                ...relativeFolderPath.split("/").filter(Boolean),
                ...filePath.split("/")
            );
            try {
                const doc = await vscode.workspace.openTextDocument(fileUri);
                await vscode.window.showTextDocument(doc, { viewColumn: nextColumn, preview: false });
                nextColumn++;
            } catch {
                // File does not exist on disk — skip silently.
            }
        }
    };
}
