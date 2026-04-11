import * as vscode from "vscode";

/** Returns the URIs of all open workspace folders, or an empty array if none. */
export function getWorkspaceRoots(): vscode.Uri[] {
    const folders = vscode.workspace.workspaceFolders;
    return folders ? folders.map((f) => f.uri) : [];
}
