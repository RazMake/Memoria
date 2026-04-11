// Factory for the "Memoria: Toggle dot-folders" command handler.
// Toggles visibility of dot-folders (directories starting with ".") at the workspace root
// by managing the workspace-level files.exclude setting.
//
// Tracking which entries Memoria manages is stored in .memoria/dotfolders.json.
// The command never touches files.exclude entries it does not own, ensuring it coexists
// safely with user-managed or other-extension-managed exclusions.

import * as vscode from "vscode";
import type { ManifestManager } from "../blueprints/manifestManager";

export function createToggleDotFoldersCommand(
    manifest: ManifestManager,
    telemetry: vscode.TelemetryLogger
): () => Promise<void> {
    return async () => {
        const folders = vscode.workspace.workspaceFolders;
        if (!folders || folders.length === 0) {
            vscode.window.showErrorMessage("Memoria: No workspace is open.");
            return;
        }

        // Use the first initialized root. If none is initialized, the command should not
        // be visible (enforced by the "when" clause in package.json), but guard defensively.
        const workspaceRoot = folders[0].uri;
        if (!(await manifest.isInitialized(workspaceRoot))) {
            vscode.window.showErrorMessage(
                "Memoria: Workspace is not initialized. Run 'Memoria: Initialize workspace' first."
            );
            return;
        }

        const config = vscode.workspace.getConfiguration("files", workspaceRoot);
        const currentExclude: Record<string, boolean> = config.get<Record<string, boolean>>("exclude") ?? {};

        // Read managed entries from .memoria/dotfolders.json (empty on first use).
        const dotfoldersConfig = await manifest.readDotfolders(workspaceRoot);
        const managedEntries: string[] = dotfoldersConfig?.managedEntries ?? [];

        // Determine which managed entries are currently hidden.
        const hiddenManaged = managedEntries.filter((entry) => currentExclude[entry] === true);

        if (hiddenManaged.length === 0) {
            // "All visible" path: scan for dot-folders and hide them all.
            const dotFolders = await scanDotFolders(workspaceRoot);
            if (dotFolders.length === 0) {
                vscode.window.showInformationMessage("Memoria: No dot-folders found at the workspace root.");
                return;
            }

            const updatedExclude = { ...currentExclude };
            for (const name of dotFolders) {
                updatedExclude[name] = true;
            }

            await config.update("exclude", updatedExclude, vscode.ConfigurationTarget.Workspace);
            await manifest.writeDotfolders(workspaceRoot, { managedEntries: dotFolders });
            telemetry.logUsage("dotfolders.toggle", { action: "hide", count: dotFolders.length });
            vscode.window.showInformationMessage(
                `Memoria: ${dotFolders.length} dot-folder(s) hidden.`
            );
        } else {
            // "Some hidden" path: show a multi-select QuickPick for fine-grained control.
            // All managed dot-folders are listed; currently hidden ones are pre-checked.
            const allDotFolders = await scanDotFolders(workspaceRoot);
            // Merge with managed entries so newly-discovered dot-folders appear too.
            const allToManage = [...new Set([...managedEntries, ...allDotFolders])];

            const items = allToManage.map((name) => ({
                label: name,
                picked: currentExclude[name] === true,
            }));

            const selected = await vscode.window.showQuickPick(items, {
                title: "Memoria: Manage dot-folder visibility",
                placeHolder: "Checked = hidden, unchecked = visible",
                canPickMany: true,
            });

            if (selected === undefined) {
                return; // User cancelled
            }

            const selectedNames = new Set(selected.map((item) => item.label));
            const updatedExclude = { ...currentExclude };

            // Only touch entries that Memoria manages.
            for (const name of allToManage) {
                if (selectedNames.has(name)) {
                    updatedExclude[name] = true;
                } else {
                    delete updatedExclude[name];
                }
            }

            await config.update("exclude", updatedExclude, vscode.ConfigurationTarget.Workspace);
            await manifest.writeDotfolders(workspaceRoot, { managedEntries: allToManage });
            telemetry.logUsage("dotfolders.toggle", {
                action: "update",
                hidden: selected.length,
                visible: allToManage.length - selected.length,
            });
        }
    };
}

/** Returns the names of all directories starting with "." at the workspace root. */
async function scanDotFolders(workspaceRoot: vscode.Uri): Promise<string[]> {
    const entries = await vscode.workspace.fs.readDirectory(workspaceRoot);
    return entries
        .filter(([name, type]) => type === vscode.FileType.Directory && name.startsWith("."))
        .map(([name]) => name);
}
