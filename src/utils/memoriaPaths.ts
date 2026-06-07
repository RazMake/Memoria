import * as vscode from "vscode";

/** Name of the per-workspace metadata directory that holds all Memoria config and index files. */
export const MEMORIA_DIR_NAME = ".memoria";

/** Returns the URI of the `.memoria/` metadata directory for the given workspace root. */
export function getMemoriaDirUri(workspaceRoot: vscode.Uri): vscode.Uri {
    return vscode.Uri.joinPath(workspaceRoot, MEMORIA_DIR_NAME);
}

/** Returns the URI of a file inside the `.memoria/` metadata directory. */
export function getMemoriaConfigUri(workspaceRoot: vscode.Uri, filename: string): vscode.Uri {
    return vscode.Uri.joinPath(workspaceRoot, MEMORIA_DIR_NAME, filename);
}
