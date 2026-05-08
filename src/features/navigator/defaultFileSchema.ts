// Pure JSON structure parsing helpers for .memoria/default-files.json.
//
// These functions use jsonc-parser to extract existing keys and values from
// the document text. They have NO dependency on the VS Code API so they can
// be unit-tested in isolation without mocking vscode.

import { parseTree, findNodeAtLocation } from "jsonc-parser";

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
