// Context-aware CompletionItemProvider for .memoria/default-files.json.
// Uses jsonc-parser to determine cursor position within the JSON tree and offers:
// - "defaultFiles" key at the top level
// - Workspace folder paths as keys inside "defaultFiles"
// - File/subfolder names as values inside the arrays (progressive "/" navigation)

import * as vscode from "vscode";
import { getLocation, parseTree, findNodeAtLocation, type Location } from "jsonc-parser";
import { getWorkspaceRoots, getRootFolderName, classifyFolderKey } from "../../blueprints/workspaceUtils";

/** Document selector that matches only .memoria/default-files.json files. */
export const DEFAULT_FILES_JSON_SELECTOR: vscode.DocumentSelector = {
    language: "json",
    scheme: "file",
    pattern: "**/.memoria/default-files.json",
};

/** Maximum recursion depth when enumerating workspace folders. */
const MAX_FOLDER_DEPTH = 5;

export class DefaultFileCompletionProvider implements vscode.CompletionItemProvider {
    async provideCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
    ): Promise<vscode.CompletionItem[] | undefined> {
        const text = document.getText();
        const offset = document.offsetAt(position);
        const location = getLocation(text, offset);

        if (isTopLevelKey(location)) {
            return this.topLevelKeyCompletions();
        }

        if (isDefaultFilesKey(location)) {
            return this.folderKeyCompletions(text);
        }

        if (isDefaultFilesValue(location, text, offset)) {
            const folderKey = location.path[1] as string;
            const partialValue = extractPartialValue(text, offset);
            return this.fileValueCompletions(text, folderKey, partialValue);
        }

        return undefined;
    }

    // ── Completion builders ─────────────────────────────────────────────

    private topLevelKeyCompletions(): vscode.CompletionItem[] {
        const item = new vscode.CompletionItem("defaultFiles", vscode.CompletionItemKind.Property);
        item.detail = "Map of folder paths to default file arrays";
        item.insertText = new vscode.SnippetString(
            '"defaultFiles": {\n\t"$1": ["$2"]\n}',
        );
        return [item];
    }

    private async folderKeyCompletions(text: string): Promise<vscode.CompletionItem[]> {
        const existingKeys = getExistingDefaultFilesKeys(text);
        const roots = getWorkspaceRoots();
        const items: vscode.CompletionItem[] = [];

        for (const root of roots) {
            const rootName = getRootFolderName(root);
            const relativeFolders = await enumerateFolders(root, "", MAX_FOLDER_DEPTH);

            for (const relPath of relativeFolders) {
                const relativeKey = relPath + "/";
                const rootPrefixedKey = rootName + "/" + relativeKey;

                // Relative format (e.g. "00-ToDo/")
                if (!existingKeys.has(relativeKey)) {
                    const item = new vscode.CompletionItem(
                        relativeKey,
                        vscode.CompletionItemKind.Folder,
                    );
                    item.detail = "Matches in any workspace root";
                    item.insertText = new vscode.SnippetString(
                        `"${relativeKey}": ["$1"]`,
                    );
                    item.sortText = `0_${relativeKey}`;
                    items.push(item);
                }

                // Root-prefixed format (e.g. "RootName/00-ToDo/")
                if (!existingKeys.has(rootPrefixedKey)) {
                    const item = new vscode.CompletionItem(
                        rootPrefixedKey,
                        vscode.CompletionItemKind.Folder,
                    );
                    item.detail = `Matches only in "${rootName}"`;
                    item.insertText = new vscode.SnippetString(
                        `"${rootPrefixedKey}": ["$1"]`,
                    );
                    item.sortText = `1_${rootPrefixedKey}`;
                    items.push(item);
                }
            }
        }

        // Deduplicate relative keys that appear from multiple roots.
        const seen = new Set<string>();
        return items.filter((item) => {
            const key = `${item.sortText}_${item.label}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }

    private async fileValueCompletions(
        text: string,
        folderKey: string,
        partialValue: string,
    ): Promise<vscode.CompletionItem[]> {
        const existingValues = getExistingArrayValues(text, folderKey);
        const roots = getWorkspaceRoots();

        // Determine which roots to search based on key format.
        const rootNameSet = new Set(roots.map(getRootFolderName));
        const { isRootSpecific, relFolder, rootName } = classifyFolderKey(folderKey, rootNameSet);

        const targetRoots = isRootSpecific
            ? roots.filter((r) => getRootFolderName(r) === rootName)
            : roots;

        // The partial value determines the subdirectory to list.
        // e.g. partialValue "A/" → list children of <folder>/A/
        // e.g. partialValue "A/B/" → list children of <folder>/A/B/
        const lastSlash = partialValue.lastIndexOf("/");
        const prefix = lastSlash >= 0 ? partialValue.slice(0, lastSlash + 1) : "";

        const items: vscode.CompletionItem[] = [];
        const seen = new Set<string>();

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

        return items;
    }
}

// ── Location helpers ────────────────────────────────────────────────────

/**
 * Cursor is at a top-level property key position (e.g. completing "defaultFiles").
 */
export function isTopLevelKey(loc: Location): boolean {
    return loc.isAtPropertyKey && loc.path.length === 1 && typeof loc.path[0] === "string"
        && !loc.path[0].startsWith("defaultFiles");
}

/**
 * Cursor is at a property key inside the "defaultFiles" object.
 * jsonc-parser reports path ["defaultFiles", ""] or ["defaultFiles", "<partial>"]
 * with isAtPropertyKey.
 */
export function isDefaultFilesKey(loc: Location): boolean {
    return loc.isAtPropertyKey && loc.path.length === 2
        && loc.path[0] === "defaultFiles" && typeof loc.path[1] === "string";
}

/**
 * Cursor is inside a string value within the "defaultFiles" arrays.
 * jsonc-parser reports path ["defaultFiles", "<folder>", <index>] when the cursor
 * is at a value position inside an array element.
 * Falls back to a text scan when the parser hasn't resolved the key yet.
 */
export function isDefaultFilesValue(loc: Location, text: string, offset: number): boolean {
    // Fast path: parser resolved the full path.
    if (
        !loc.isAtPropertyKey
        && loc.path.length === 3
        && loc.path[0] === "defaultFiles"
        && typeof loc.path[1] === "string"
        && typeof loc.path[2] === "number"
    ) {
        return true;
    }

    // Fallback: cursor is inside a string value in an array but the parser only
    // resolved to depth 2. Look behind for an array context ("[" or ",") after a ":".
    if (
        !loc.isAtPropertyKey
        && loc.path.length >= 2
        && loc.path[0] === "defaultFiles"
        && typeof loc.path[1] === "string"
    ) {
        const preceding = text.substring(Math.max(0, offset - 200), offset);
        // Match pattern: ": [" ... (possibly with existing values) ... current position inside "
        return /:\s*\[[^]*"[^"]*$/.test(preceding);
    }

    return false;
}

// ── Parsing helpers ─────────────────────────────────────────────────────

/**
 * Extracts the partial string value the user has typed so far at the cursor offset.
 * Scans backwards from the cursor to find the opening quote of the current string.
 */
export function extractPartialValue(text: string, offset: number): string {
    // Search backwards for the opening quote of the string the cursor is inside.
    let i = offset - 1;
    while (i >= 0 && text[i] !== '"') {
        i--;
    }
    // i is now at the opening quote; extract from i+1 to offset.
    return i >= 0 ? text.substring(i + 1, offset) : "";
}

/** Returns the set of existing keys inside the "defaultFiles" object. */
function getExistingDefaultFilesKeys(text: string): Set<string> {
    const keys = new Set<string>();
    const root = parseTree(text);
    if (!root) return keys;

    const defaultFilesNode = findNodeAtLocation(root, ["defaultFiles"]);
    if (!defaultFilesNode || defaultFilesNode.type !== "object" || !defaultFilesNode.children) {
        return keys;
    }

    for (const prop of defaultFilesNode.children) {
        if (prop.type === "property" && prop.children?.[0]?.type === "string") {
            keys.add(prop.children[0].value as string);
        }
    }
    return keys;
}

/** Returns the set of existing string values in the array for a given folder key. */
function getExistingArrayValues(text: string, folderKey: string): Set<string> {
    const values = new Set<string>();
    const root = parseTree(text);
    if (!root) return values;

    const arrayNode = findNodeAtLocation(root, ["defaultFiles", folderKey]);
    if (!arrayNode || arrayNode.type !== "array" || !arrayNode.children) {
        return values;
    }

    for (const element of arrayNode.children) {
        if (element.type === "string") {
            values.add(element.value as string);
        }
    }
    return values;
}

// ── Filesystem helpers ──────────────────────────────────────────────────

/**
 * Recursively enumerates folder paths relative to `root`, up to `maxDepth` levels.
 * Excludes dot-folders (e.g. .git, .memoria, .vscode).
 * Returns relative paths without trailing slash (e.g. "00-ToDo", "00-ToDo/Sub").
 */
async function enumerateFolders(
    root: vscode.Uri,
    prefix: string,
    maxDepth: number,
): Promise<string[]> {
    if (maxDepth <= 0) return [];

    const targetUri = prefix
        ? vscode.Uri.joinPath(root, ...prefix.split("/"))
        : root;

    let entries: [string, vscode.FileType][];
    try {
        entries = await vscode.workspace.fs.readDirectory(targetUri);
    } catch {
        return [];
    }

    const result: string[] = [];
    const childPromises: Promise<string[]>[] = [];

    for (const [name, type] of entries) {
        if (name.startsWith(".")) continue;
        if ((type & vscode.FileType.Directory) === 0) continue;

        const relPath = prefix ? prefix + "/" + name : name;
        result.push(relPath);
        childPromises.push(enumerateFolders(root, relPath, maxDepth - 1));
    }

    const childResults = await Promise.all(childPromises);
    for (const children of childResults) {
        result.push(...children);
    }

    return result;
}
