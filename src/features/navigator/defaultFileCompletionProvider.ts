// Context-aware CompletionItemProvider for .memoria/default-files.json.
//
// WHY this provider exists: default-files.json paths must reference actual workspace
// folders and files. Without IDE-level completions the user must type paths manually,
// which is error-prone and requires them to memorise the exact folder/file names.
// This provider reads the live workspace structure so completions always reflect reality.
//
// Uses jsonc-parser to determine cursor position within the JSON tree and offers:
// - "defaultFiles" key at the top level
// - Workspace folder paths as keys inside "defaultFiles"
// - File/subfolder names as values inside the arrays (progressive "/" navigation)

import * as vscode from "vscode";
import { getLocation, type Location } from "jsonc-parser";
import { getWorkspaceRoots, getRootFolderName, classifyFolderKey, classifyFilePath } from "../../blueprints/workspaceUtils";
import { stripTrailingSlash } from "../../utils/path";
import { extractPartialValue } from "../../utils/jsonCompletionHelpers";
import {
    isTopLevelKey,
    isDefaultFilesKey,
    isDefaultFilesEntryKey,
    isDefaultFilesValue,
    getExistingDefaultFilesKeys,
    getExistingEntryKeys,
    getExistingArrayValues,
    listImmediateSubfolders,
} from "./defaultFileJsonHelpers";

// Re-export for backward compatibility with existing test imports.
export { isTopLevelKey, isDefaultFilesKey, isDefaultFilesEntryKey, isDefaultFilesValue } from "./defaultFileJsonHelpers";
export { extractPartialValue } from "../../utils/jsonCompletionHelpers";

/** Document selector that matches only .memoria/default-files.json files. */
export const DEFAULT_FILES_JSON_SELECTOR: vscode.DocumentSelector = {
    language: "json",
    scheme: "file",
    pattern: "**/.memoria/default-files.json",
};

export class DefaultFileCompletionProvider implements vscode.CompletionItemProvider {
    async provideCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
    ): Promise<vscode.CompletionItem[] | undefined> {
        // Async filesystem reads are performed here (rather than using a stale cache)
        // so that completions always reflect the actual current workspace structure.
        const text = document.getText();
        const offset = document.offsetAt(position);
        const location = getLocation(text, offset);

        if (isTopLevelKey(location, "defaultFiles")) {
            return this.topLevelKeyCompletions();
        }

        if (isDefaultFilesKey(location)) {
            const partialKey = extractPartialValue(text, offset);
            const replaceRange = new vscode.Range(
                position.line, position.character - partialKey.length,
                position.line, position.character,
            );
            return this.folderKeyCompletions(text, partialKey, replaceRange);
        }

        if (isDefaultFilesEntryKey(location)) {
            const folderKey = location.path[1] as string;
            return this.entryKeyCompletions(text, folderKey);
        }

        if (isDefaultFilesValue(location, text, offset)) {
            const folderKey = location.path[1] as string;
            const partialValue = extractPartialValue(text, offset);
            const replaceRange = new vscode.Range(
                position.line, position.character - partialValue.length,
                position.line, position.character,
            );
            return this.fileValueCompletions(text, folderKey, partialValue, replaceRange);
        }

        return undefined;
    }

    // ── Completion builders ─────────────────────────────────────────────

    private topLevelKeyCompletions(): vscode.CompletionItem[] {
        const item = new vscode.CompletionItem("defaultFiles", vscode.CompletionItemKind.Property);
        item.detail = "Map of folder paths to default file configuration";
        item.insertText = new vscode.SnippetString(
            '"defaultFiles": {\n\t"$1": {\n\t\t"filesToOpen": ["$2"]\n\t}\n}',
        );
        return [item];
    }

    private entryKeyCompletions(text: string, folderKey: string): vscode.CompletionItem[] {
        const existingKeys = getExistingEntryKeys(text, folderKey);
        const fields: Array<{ key: string; detail: string; snippet: string; sortText: string }> = [
            {
                key: "filesToOpen",
                detail: "(required) Array of file paths to open",
                snippet: `"filesToOpen": ["$1"]`,
                sortText: "0_filesToOpen",
            },
            {
                key: "closeCurrentlyOpenedFilesFirst",
                detail: "(optional) boolean — close existing editors before opening files (default: true)",
                snippet: `"closeCurrentlyOpenedFilesFirst": \${1|true,false|}`,
                sortText: "1_closeCurrentlyOpenedFilesFirst",
            },
            {
                key: "openSideBySide",
                detail: "(optional) boolean — open each file in its own column (default: true)",
                snippet: `"openSideBySide": \${1|true,false|}`,
                sortText: "1_openSideBySide",
            },
        ];

        return fields
            .filter(({ key }) => !existingKeys.has(key))
            .map(({ key, detail, snippet, sortText }) => {
                const item = new vscode.CompletionItem(key, vscode.CompletionItemKind.Property);
                item.detail = detail;
                item.insertText = new vscode.SnippetString(snippet);
                item.sortText = sortText;
                return item;
            });
    }

    private async folderKeyCompletions(text: string, partialKey: string, replaceRange: vscode.Range): Promise<vscode.CompletionItem[]> {
        const existingKeys = getExistingDefaultFilesKeys(text);
        const roots = getWorkspaceRoots();
        const rootNameSet = new Set(roots.map(getRootFolderName));

        const lastSlash = partialKey.lastIndexOf("/");
        const prefix = lastSlash >= 0 ? partialKey.slice(0, lastSlash + 1) : "";

        if (!prefix) {
            return this.buildRootLevelFolderCompletions(roots, rootNameSet, existingKeys, replaceRange);
        }
        return this.buildNestedFolderCompletions(roots, rootNameSet, existingKeys, prefix, replaceRange);
    }

    /** Initial level: show root names and immediate top-level folders. */
    private async buildRootLevelFolderCompletions(
        roots: vscode.Uri[],
        rootNameSet: Set<string>,
        existingKeys: Set<string>,
        replaceRange: vscode.Range,
    ): Promise<vscode.CompletionItem[]> {
        const items: vscode.CompletionItem[] = [];
        const seen = new Set<string>();

        for (const root of roots) {
            const rootName = getRootFolderName(root);

            // Root name entry (e.g. "MyProject/") for root-prefixed keys
            if (!seen.has(`root:${rootName}`)) {
                seen.add(`root:${rootName}`);
                items.push(this.makeFolderItem(
                    rootName + "/", rootName + "/", rootName + "/",
                    `1_${rootName}`, `Scope to "${rootName}" workspace root`, replaceRange,
                ));
            }

            // Immediate child folders (relative format)
            const children = await listImmediateSubfolders(root);
            for (const name of children) {
                const relativeKey = name + "/";
                if (seen.has(`rel:${relativeKey}`)) continue;
                seen.add(`rel:${relativeKey}`);

                if (existingKeys.has(relativeKey)) continue;

                items.push(this.makeFolderItem(
                    relativeKey, relativeKey, relativeKey,
                    `0_${relativeKey}`, "Matches in any workspace root", replaceRange,
                ));
            }
        }

        return items;
    }

    /** Subsequent level: show children of the resolved prefix. */
    private async buildNestedFolderCompletions(
        roots: vscode.Uri[],
        rootNameSet: Set<string>,
        existingKeys: Set<string>,
        prefix: string,
        replaceRange: vscode.Range,
    ): Promise<vscode.CompletionItem[]> {
        const items: vscode.CompletionItem[] = [];
        const seen = new Set<string>();

        // Handle the case where prefix is exactly "<rootName>/" — classifyFolderKey
        // requires content after the root segment, so detect this first.
        const firstSlash = prefix.indexOf("/");
        const firstSegment = prefix.slice(0, firstSlash);
        const isExactRootPrefix = rootNameSet.has(firstSegment) && prefix.length === firstSlash + 1;

        const { isRootSpecific, relFolder, rootName } = isExactRootPrefix
            ? { isRootSpecific: true, relFolder: "", rootName: firstSegment }
            : classifyFolderKey(prefix, rootNameSet);

        const targetRoots = isRootSpecific
            ? roots.filter((r) => getRootFolderName(r) === rootName)
            : roots;

        const relSegments = stripTrailingSlash(relFolder)
            .split("/")
            .filter(Boolean);

        for (const root of targetRoots) {
            const targetUri = vscode.Uri.joinPath(root, ...relSegments);
            const children = await listImmediateSubfolders(targetUri);

            for (const name of children) {
                const fullKey = prefix + name + "/";
                if (seen.has(fullKey)) continue;
                seen.add(fullKey);

                if (existingKeys.has(fullKey)) continue;

                items.push(this.makeFolderItem(
                    name + "/", fullKey, fullKey,
                    `0_${name}`,
                    isRootSpecific ? `Matches only in "${rootName}"` : "Matches in any workspace root",
                    replaceRange,
                ));
            }
        }

        return items;
    }

    // ── File value completions ──────────────────────────────────────────

    private async fileValueCompletions(
        text: string,
        folderKey: string,
        partialValue: string,
        replaceRange: vscode.Range,
    ): Promise<vscode.CompletionItem[]> {
        const existingValues = getExistingArrayValues(text, folderKey);
        const roots = getWorkspaceRoots();

        const rootNameSet = new Set(roots.map(getRootFolderName));
        const { isRootSpecific, relFolder, rootName } = classifyFolderKey(folderKey, rootNameSet);

        const lastSlash = partialValue.lastIndexOf("/");
        const prefix = lastSlash >= 0 ? partialValue.slice(0, lastSlash + 1) : "";

        const { isWorkspaceAbsolute, rootName: fileRootName } = classifyFilePath(
            prefix || partialValue,
            rootNameSet,
        );

        if (isWorkspaceAbsolute) {
            return this.buildWorkspaceAbsoluteFileCompletions(
                roots, existingValues, prefix, fileRootName, replaceRange,
            );
        }
        return this.buildRelativeFileCompletions(
            roots, existingValues, isRootSpecific, relFolder, rootName, prefix, replaceRange,
        );
    }

    /** Workspace-absolute mode: list relative to the matching root, ignoring folder context. */
    private async buildWorkspaceAbsoluteFileCompletions(
        roots: vscode.Uri[],
        existingValues: Set<string>,
        prefix: string,
        fileRootName: string,
        replaceRange: vscode.Range,
    ): Promise<vscode.CompletionItem[]> {
        const items: vscode.CompletionItem[] = [];
        const seen = new Set<string>();

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

                items.push(this.makeFolderItem(
                    rName + "/", rName + "/", rName + "/",
                    `2_${rName}`, `Open from the "${rName}" workspace root`, replaceRange,
                ));
            }
        }

        return items;
    }

    /** Folder-relative mode: list files relative to the folder key's resolved directory. */
    private async buildRelativeFileCompletions(
        roots: vscode.Uri[],
        existingValues: Set<string>,
        isRootSpecific: boolean,
        relFolder: string,
        rootName: string,
        prefix: string,
        replaceRange: vscode.Range,
    ): Promise<vscode.CompletionItem[]> {
        const items: vscode.CompletionItem[] = [];
        const seen = new Set<string>();

        const targetRoots = isRootSpecific
            ? roots.filter((r) => getRootFolderName(r) === rootName)
            : roots;

        for (const root of targetRoots) {
            // Build the full folder path: root + relative folder + prefix from partial value.
            const folderSegments = stripTrailingSlash(relFolder)
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

                items.push(this.makeFolderItem(
                    rName + "/", rName + "/", rName + "/",
                    `2_${rName}`, `Open from the "${rName}" workspace root`, replaceRange,
                ));
            }
        }

        return items;
    }

    // ── Helpers ──────────────────────────────────────────────────────────

    /** Create a folder CompletionItem that re-triggers suggestions after insertion. */
    private makeFolderItem(
        label: string,
        insertText: string,
        filterText: string,
        sortText: string,
        detail: string,
        replaceRange: vscode.Range,
    ): vscode.CompletionItem {
        const item = new vscode.CompletionItem(label, vscode.CompletionItemKind.Folder);
        item.detail = detail;
        item.insertText = insertText;
        item.filterText = filterText;
        item.sortText = sortText;
        item.range = replaceRange;
        item.command = {
            command: "editor.action.triggerSuggest",
            title: "Re-trigger completions",
        };
        return item;
    }
}
