// File system traversal helpers for .memoria/default-files.json completions.
//
// These functions read the live workspace structure and build completion items
// for file/folder paths. Extracted from DefaultFileCompletionProvider to keep
// the provider focused on document position analysis and completion dispatch.

import * as vscode from "vscode";
import { getWorkspaceRoots, getRootFolderName, classifyFolderKey, classifyFilePath } from "../../blueprints/workspaceUtils";
import { stripTrailingSlash } from "../../utils/path";
import { getExistingArrayValues, listImmediateSubfolders } from "./defaultFileJsonHelpers";

// Re-export for backward compatibility with existing test imports.
export { listImmediateSubfolders } from "./defaultFileJsonHelpers";

/** Reads a directory and builds completion items for its entries, skipping dot-folders and duplicates. */
async function buildDirectoryCompletionItems(
    targetUri: vscode.Uri,
    pathPrefix: string,
    detailLabel: string,
    existingValues: ReadonlySet<string>,
    seen: Set<string>,
    replaceRange: vscode.Range,
): Promise<vscode.CompletionItem[]> {
    let entries: [string, vscode.FileType][];
    try {
        entries = await vscode.workspace.fs.readDirectory(targetUri);
    } catch {
        return [];
    }

    const items: vscode.CompletionItem[] = [];
    for (const [name, type] of entries) {
        if (name.startsWith(".")) continue;

        const isFolder = (type & vscode.FileType.Directory) !== 0;
        const fullPath = pathPrefix + name + (isFolder ? "/" : "");

        if (!isFolder && existingValues.has(pathPrefix + name)) continue;
        if (seen.has(fullPath)) continue;
        seen.add(fullPath);

        const item = new vscode.CompletionItem(
            name + (isFolder ? "/" : ""),
            isFolder ? vscode.CompletionItemKind.Folder : vscode.CompletionItemKind.File,
        );
        item.detail = isFolder ? `Subfolder in "${detailLabel}" — type / to drill deeper` : detailLabel === "" ? "File" : `File in "${detailLabel}"`;
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
    return items;
}

/** Builds root-name suggestion items for workspace-absolute path discovery. */
function buildRootNameCompletionItems(
    roots: vscode.Uri[],
    seen: Set<string>,
    replaceRange: vscode.Range,
): vscode.CompletionItem[] {
    const items: vscode.CompletionItem[] = [];
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
    return items;
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
    const lastSlash = partialValue.lastIndexOf("/");
    const prefix = lastSlash >= 0 ? partialValue.slice(0, lastSlash + 1) : "";

    // Check if the partial value is workspace-absolute (starts with a root name prefix).
    const { isWorkspaceAbsolute, rootName: fileRootName } = classifyFilePath(
        prefix || partialValue,
        rootNameSet,
    );

    const items: vscode.CompletionItem[] = [];
    const seen = new Set<string>();

    if (isWorkspaceAbsolute) {
        // Workspace-absolute mode: list relative to the matching root, ignoring folder context.
        const absoluteRoots = roots.filter((r) => getRootFolderName(r) === fileRootName);
        const prefixAfterRoot = prefix.slice(fileRootName.length + 1);
        const prefixSegments = prefixAfterRoot ? prefixAfterRoot.slice(0, -1).split("/").filter(Boolean) : [];

        for (const root of absoluteRoots) {
            const targetUri = vscode.Uri.joinPath(root, ...prefixSegments);
            const dirItems = await buildDirectoryCompletionItems(
                targetUri, fileRootName + "/" + prefixAfterRoot, fileRootName,
                existingValues, seen, replaceRange,
            );
            items.push(...dirItems);
        }

        if (!prefix) {
            items.push(...buildRootNameCompletionItems(roots, seen, replaceRange));
        }

        return items;
    }

    // Folder-relative mode.
    const targetRoots = isRootSpecific
        ? roots.filter((r) => getRootFolderName(r) === rootName)
        : roots;

    for (const root of targetRoots) {
        const folderSegments = stripTrailingSlash(relFolder)
            .split("/")
            .filter(Boolean);
        const prefixSegments = prefix ? prefix.slice(0, -1).split("/").filter(Boolean) : [];
        const targetUri = vscode.Uri.joinPath(root, ...folderSegments, ...prefixSegments);

        const dirItems = await buildDirectoryCompletionItems(
            targetUri, prefix, "",
            existingValues, seen, replaceRange,
        );
        items.push(...dirItems);
    }

    // Offer root names in multi-root workspaces for workspace-absolute path discovery.
    if (!prefix && roots.length > 1) {
        items.push(...buildRootNameCompletionItems(roots, seen, replaceRange));
    }

    return items;
}
