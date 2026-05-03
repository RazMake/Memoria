// Location detection and JSON tree parsing helpers for default-files.json completions.
// Extracted from DefaultFileCompletionProvider so they can be tested and reused independently.

import * as vscode from "vscode";
import { parseTree, findNodeAtLocation, type Location } from "jsonc-parser";

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
 * Cursor is at a property key inside a folder's entry object (depth 3).
 * jsonc-parser reports path ["defaultFiles", "<folder>", ""] or ["defaultFiles", "<folder>", "<partial>"]
 * with isAtPropertyKey when the user is typing a property key inside the entry object.
 */
export function isDefaultFilesEntryKey(loc: Location): boolean {
    return loc.isAtPropertyKey && loc.path.length === 3
        && loc.path[0] === "defaultFiles"
        && typeof loc.path[1] === "string"
        && typeof loc.path[2] === "string";
}

/**
 * Cursor is inside a string value within the "defaultFiles" arrays.
 * Handles both formats:
 *   - Legacy: path ["defaultFiles", "<folder>", <index>] (string[] value)
 *   - Current: path ["defaultFiles", "<folder>", "filesToOpen", <index>] (object value)
 * Falls back to a text scan when the parser hasn't resolved the key yet.
 */
export function isDefaultFilesValue(loc: Location, text: string, offset: number): boolean {
    // Fast path — new object format: ["defaultFiles", folderKey, "filesToOpen", index]
    if (
        !loc.isAtPropertyKey
        && loc.path.length === 4
        && loc.path[0] === "defaultFiles"
        && typeof loc.path[1] === "string"
        && loc.path[2] === "filesToOpen"
        && typeof loc.path[3] === "number"
    ) {
        return true;
    }

    // Fast path — legacy array format: ["defaultFiles", folderKey, index]
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
    // resolved to depth 2 or 3. Look behind for an array context ("[" or ",") after a ":".
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

/** Returns the set of existing keys inside the "defaultFiles" object. */
export function getExistingDefaultFilesKeys(text: string): Set<string> {
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

/** Returns the set of existing property keys inside a folder's entry object. */
export function getExistingEntryKeys(text: string, folderKey: string): Set<string> {
    const keys = new Set<string>();
    const root = parseTree(text);
    if (!root) return keys;

    const entryNode = findNodeAtLocation(root, ["defaultFiles", folderKey]);
    if (!entryNode || entryNode.type !== "object" || !entryNode.children) {
        return keys;
    }

    for (const prop of entryNode.children) {
        if (prop.type === "property" && prop.children?.[0]?.type === "string") {
            keys.add(prop.children[0].value as string);
        }
    }
    return keys;
}

/**
 * Returns the set of existing string values in the filesToOpen array for a given folder key.
 * Supports both the new object format ({ filesToOpen: [...] }) and the legacy array format ([...]).
 */
export function getExistingArrayValues(text: string, folderKey: string): Set<string> {
    const values = new Set<string>();
    const root = parseTree(text);
    if (!root) return values;

    // Try new object format first: defaultFiles[folderKey].filesToOpen
    const entryNode = findNodeAtLocation(root, ["defaultFiles", folderKey]);
    const arrayNode = entryNode?.type === "object"
        ? findNodeAtLocation(root, ["defaultFiles", folderKey, "filesToOpen"])
        : entryNode; // legacy: the node itself is the array

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
