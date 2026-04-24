// File system traversal helpers for .memoria/default-files.json completions.
//
// These functions read the live workspace structure and build completion items
// for file/folder paths. Extracted from DefaultFileCompletionProvider to keep
// the provider focused on document position analysis and completion dispatch.

import * as vscode from "vscode";
import { getWorkspaceRoots, getRootFolderName, classifyFolderKey, classifyFilePath } from "../../blueprints/workspaceUtils";
import { getExistingArrayValues } from "./defaultFileSchema";

/**
 * Lists the names of immediate subdirectories under a given URI.
 * Excludes dot-folders (e.g. .git, .memoria, .vscode).
 */
export async function listImmediateSubfolders(parentUri: vscode.Uri): Promise<string[]> {
    let entries: [string, vscode.FileType][];
    try {
        entries = await vscode.workspace.fs.readDirectory(parentUri);
    } catch {
        return [];
    }

    return entries
        .filter(([name, type]) => !name.startsWith(".") && (type & vscode.FileType.Directory) !== 0)
        .map(([name]) => name);
}

/**
 * Builds completion items for file values inside a "filesToOpen" array.
 * Reads the live workspace structure to offer file/folder names.
 *
 * Supports two path modes:
 * - **Workspace-absolute**: the partial value starts with a workspace root name
 *   (e.g. "MyProject/src/") — files are resolved relative to that root.
 * - **Folder-relative** (default): files are resolved relative to the folder
 *   indicated by the JSON key (e.g. "00-ToDo/").
 */
export async function buildFileValueCompletions(
    text: string,
    folderKey: string,
    partialValue: string,
    replaceRange: vscode.Range,
): Promise<vscode.CompletionItem[]> {
    const existingValues = getExistingArrayValues(text, folderKey);
    const roots = getWorkspaceRoots();

    // Determine which roots to search based on key format.
    const rootNameSet = new Set(roots.map(getRootFolderName));
    const { isRootSpecific, relFolder, rootName } = classifyFolderKey(folderKey, rootNameSet);

    // The partial value determines the subdirectory to list.
    // e.g. partialValue "A/" → list children of <folder>/A/
    // e.g. partialValue "A/B/" → list children of <folder>/A/B/
    const lastSlash = partialValue.lastIndexOf("/");
    const prefix = lastSlash >= 0 ? partialValue.slice(0, lastSlash + 1) : "";

    // Check if the partial value is workspace-absolute (starts with a root name prefix).
    // If so, list files from the root rather than from the folder context.
    const { isWorkspaceAbsolute, rootName: fileRootName } = classifyFilePath(
        prefix || partialValue,
        rootNameSet,
    );

    const items: vscode.CompletionItem[] = [];
    const seen = new Set<string>();

    if (isWorkspaceAbsolute) {
        // Workspace-absolute mode: list relative to the matching root, ignoring folder context.
        const absoluteRoots = roots.filter((r) => getRootFolderName(r) === fileRootName);
        // Strip the "RootName/" prefix that the user has already typed.
        const prefixAfterRoot = prefix.slice(fileRootName.length + 1);
        const prefixSegments = prefixAfterRoot ? prefixAfterRoot.slice(0, -1).split("/").filter(Boolean) : [];

        for (const root of absoluteRoots) {
            const targetUri = vscode.Uri.joinPath(root, ...prefixSegments);

            let entries: [string, vscode.FileType][];
            try {
                entries = await vscode.workspace.fs.readDirectory(targetUri);
            } catch {
                continue;
            }

            for (const [name, type] of entries) {
                if (name.startsWith(".")) continue;

                const isFolder = (type & vscode.FileType.Directory) !== 0;
                const fullPath = fileRootName + "/" + prefixAfterRoot + name + (isFolder ? "/" : "");

                if (!isFolder && existingValues.has(fullPath)) continue;
                if (seen.has(fullPath)) continue;
                seen.add(fullPath);

                const item = new vscode.CompletionItem(
                    name + (isFolder ? "/" : ""),
                    isFolder ? vscode.CompletionItemKind.Folder : vscode.CompletionItemKind.File,
                );
                item.detail = isFolder
                    ? `Subfolder in "${fileRootName}" — type / to drill deeper`
                    : `File in "${fileRootName}"`;
                item.insertText = fullPath;
                item.filterText = fullPath;
                item.sortText = isFolder ? `0_${name}` : `1_${name}`;
                item.range = replaceRange;

                if (isFolder) {
                    item.command = {
                        command: "editor.action.triggerSuggest",
                        title: "Re-trigger completions",
                    };
                }

                items.push(item);
            }
        }

        // When no prefix has been typed yet (user just started), also add root name
        // entries so they can discover the workspace-absolute path syntax.
        if (!prefix) {
            for (const root of roots) {
                const rName = getRootFolderName(root);
                if (seen.has(`root:${rName}`)) continue;
                seen.add(`root:${rName}`);

                const item = new vscode.CompletionItem(rName + "/", vscode.CompletionItemKind.Folder);
                item.detail = `Open from the "${rName}" workspace root`;
                item.insertText = rName + "/";
                item.filterText = rName + "/";
                item.sortText = `2_${rName}`;
                item.range = replaceRange;
                item.command = {
                    command: "editor.action.triggerSuggest",
                    title: "Re-trigger completions",
                };
                items.push(item);
            }
        }

        return items;
    }

    // Folder-relative mode (existing behaviour).
    const targetRoots = isRootSpecific
        ? roots.filter((r) => getRootFolderName(r) === rootName)
        : roots;

    for (const root of targetRoots) {
        // Build the full folder path: root + relative folder + prefix from partial value.
        const folderSegments = (relFolder.endsWith("/") ? relFolder.slice(0, -1) : relFolder)
            .split("/")
            .filter(Boolean);
        const prefixSegments = prefix ? prefix.slice(0, -1).split("/").filter(Boolean) : [];
        const targetUri = vscode.Uri.joinPath(root, ...folderSegments, ...prefixSegments);

        let entries: [string, vscode.FileType][];
        try {
            entries = await vscode.workspace.fs.readDirectory(targetUri);
        } catch {
            // Folder does not exist — skip.
            continue;
        }

        for (const [name, type] of entries) {
            if (name.startsWith(".")) continue;

            const isFolder = (type & vscode.FileType.Directory) !== 0;
            const fullPath = prefix + name + (isFolder ? "/" : "");

            // Skip files that are already in the array (exact match only for files).
            if (!isFolder && existingValues.has(prefix + name)) continue;

            if (seen.has(fullPath)) continue;
            seen.add(fullPath);

            const item = new vscode.CompletionItem(
                name + (isFolder ? "/" : ""),
                isFolder ? vscode.CompletionItemKind.Folder : vscode.CompletionItemKind.File,
            );
            item.detail = isFolder ? "Subfolder — type / to drill deeper" : "File";
            // Insert the full path including the prefix so the value is correct.
            item.insertText = fullPath;
            item.filterText = fullPath;
            item.sortText = isFolder ? `0_${name}` : `1_${name}`;
            item.range = replaceRange;

            // For folders, trigger suggest again after inserting so the user
            // can keep drilling without manually pressing Ctrl+Space.
            if (isFolder) {
                item.command = {
                    command: "editor.action.triggerSuggest",
                    title: "Re-trigger completions",
                };
            }

            items.push(item);
        }
    }

    // When no prefix is typed, also offer root names so users can discover
    // workspace-absolute path syntax without memorising it.
    // Only shown in multi-root workspaces where cross-root references are meaningful.
    if (!prefix && roots.length > 1) {
        for (const root of roots) {
            const rName = getRootFolderName(root);
            const key = `root:${rName}`;
            if (seen.has(key)) continue;
            seen.add(key);

            const item = new vscode.CompletionItem(rName + "/", vscode.CompletionItemKind.Folder);
            item.detail = `Open from the "${rName}" workspace root`;
            item.insertText = rName + "/";
            item.filterText = rName + "/";
            item.sortText = `2_${rName}`;
            item.range = replaceRange;
            item.command = {
                command: "editor.action.triggerSuggest",
                title: "Re-trigger completions",
            };
            items.push(item);
        }
    }

    return items;
}
