import * as vscode from "vscode";
import { stripTrailingSlash } from "../utils/path";

/** Returns the URIs of all open workspace folders, or an empty array if none. */
export function getWorkspaceRoots(): vscode.Uri[] {
    const folders = vscode.workspace.workspaceFolders;
    return folders ? folders.map((f) => f.uri) : [];
}

/**
 * Extracts the folder name (last path segment) from a URI.
 * Used to match root-prefixed keys in default-files.json.
 */
export function getRootFolderName(rootUri: { path: string }): string {
    const path = rootUri.path;
    const trimmed = stripTrailingSlash(path);
    const lastSlash = trimmed.lastIndexOf("/");
    return lastSlash >= 0 ? trimmed.slice(lastSlash + 1) : trimmed;
}

/**
 * Splits a path at its first "/" and returns the leading segment and the remainder.
 * Returns `null` when the path has no "/".
 */
function splitFirstSegment(path: string): { segment: string; rest: string } | null {
    const firstSlash = path.indexOf("/");
    if (firstSlash === -1) {
        return null;
    }
    return { segment: path.slice(0, firstSlash), rest: path.slice(firstSlash + 1) };
}

/**
 * Classifies a default-files.json key as root-specific or relative.
 *
 * Root-specific keys have a first segment that matches a workspace root name
 * and a remaining folder path after the prefix (e.g. "ProjectA/00-ToDo/").
 * Relative keys match any root (e.g. "00-ToDo/").
 *
 * Drives multi-root default-file resolution in both extension.ts (on activation) and
 * the openDefaultFile command, so the correct file opens regardless of which workspace
 * root is active.
 */
export function classifyFolderKey(
    key: string,
    rootNameSet: ReadonlySet<string>
): { isRootSpecific: boolean; relFolder: string; rootName: string } {
    const split = splitFirstSegment(key);
    if (!split) {
        return { isRootSpecific: false, relFolder: key, rootName: "" };
    }
    const isRootSpecific = rootNameSet.has(split.segment) && split.rest.length > 0;
    const relFolder = isRootSpecific ? split.rest : key;
    return { isRootSpecific, relFolder, rootName: split.segment };
}

/**
 * Classifies a file path entry in default-files.json as workspace-absolute or folder-relative.
 *
 * Workspace-absolute paths have their first segment matching a workspace root name
 * (e.g. "ProjectA/00-ToDo/Main.todo"). The file is resolved from that root, ignoring
 * the folder context used to trigger the command — making it possible to open files
 * from any root in a multi-root workspace.
 *
 * Folder-relative paths (e.g. "Main.todo", "sub/file.md") are resolved relative to
 * the folder that was right-clicked (the existing behaviour).
 */
export function classifyFilePath(
    filePath: string,
    rootNameSet: ReadonlySet<string>
): { isWorkspaceAbsolute: boolean; rootName: string; relPath: string } {
    const split = splitFirstSegment(filePath);
    if (!split) {
        return { isWorkspaceAbsolute: false, rootName: "", relPath: filePath };
    }
    const isWorkspaceAbsolute = rootNameSet.has(split.segment);
    const relPath = isWorkspaceAbsolute ? split.rest : filePath;
    return { isWorkspaceAbsolute, rootName: split.segment, relPath };
}
