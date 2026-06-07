import * as vscode from "vscode";
import type { ManifestManager } from "../blueprints/manifestManager";
import { showError } from "../utils/uiMessages";

/**
 * Resolves the initialized workspace root, showing standardized error messages
 * when no workspace is open or the workspace is not initialized.
 *
 * Returns `null` when the user should not proceed (no workspace or not initialized).
 */
export async function requireInitializedRoot(
    manifest: ManifestManager,
): Promise<vscode.Uri | null> {
    const root = await findInitializedRootSilently(manifest);
    if (!root) {
        const hasWorkspace = (vscode.workspace.workspaceFolders?.length ?? 0) > 0;
        showError(
            hasWorkspace
                ? "Workspace is not initialized. Run 'Memoria: Initialize workspace' first."
                : "No workspace is open.",
        );
    }
    return root;
}

/**
 * Resolves the initialized workspace root without showing error messages.
 * Returns `null` when no workspace is open or the workspace is not initialized.
 */
export async function findInitializedRootSilently(
    manifest: ManifestManager,
): Promise<vscode.Uri | null> {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
        return null;
    }
    return await manifest.findInitializedRoot(folders.map((f) => f.uri)) ?? null;
}
