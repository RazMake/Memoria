// Factory for the "Memoria: Toggle dot-folders" command handler.
// Toggles visibility of dot-folders (directories starting with ".") at the workspace root
// by managing the workspace-level files.exclude setting.
//
// Tracking which entries Memoria manages is stored in .memoria/dotfolders.json.
// The command never touches files.exclude entries it does not own, ensuring it coexists
// safely with user-managed or other-extension-managed exclusions.

import * as vscode from "vscode";
import type { ManifestManager } from "../blueprints/manifestManager";
import type { TelemetryEmitter } from "../telemetry";
import { requireInitializedRoot } from "./commandHelpers";

/** Persists the exclusion state to workspace config, dotfolders manifest, and telemetry. */
async function applyExclusions(
    config: vscode.WorkspaceConfiguration,
    workspaceRoot: vscode.Uri,
    exclude: Record<string, boolean>,
    managed: string[],
    manifest: ManifestManager,
    telemetry: TelemetryEmitter,
    telemetryProps: Record<string, string | number>,
): Promise<void> {
    await config.update("exclude", exclude, vscode.ConfigurationTarget.Workspace);
    await manifest.writeDotfolders(workspaceRoot, { managedEntries: managed });
    telemetry.logUsage("dotfolders.toggle", telemetryProps);
}

/** "All visible" path: scan for dot-folders and hide them all. */
async function hideAllDotFolders(
    config: vscode.WorkspaceConfiguration,
    workspaceRoot: vscode.Uri,
    currentExclude: Record<string, boolean>,
    manifest: ManifestManager,
    telemetry: TelemetryEmitter,
): Promise<void> {
    const dotFolders = await scanDotFolders(workspaceRoot);
    if (dotFolders.length === 0) {
        vscode.window.showInformationMessage("Memoria: No dot-folders found at the workspace root.");
        return;
    }

    const updatedExclude = { ...currentExclude };
    for (const name of dotFolders) {
        updatedExclude[name] = true;
    }

    await applyExclusions(config, workspaceRoot, updatedExclude, dotFolders, manifest, telemetry, {
        action: "hide",
        count: dotFolders.length,
    });
    vscode.window.showInformationMessage(
        `Memoria: ${dotFolders.length} dot-folder(s) hidden.`
    );
}

/** "Some hidden" path: show a multi-select QuickPick for fine-grained control. */
async function interactiveToggleDotFolders(
    config: vscode.WorkspaceConfiguration,
    workspaceRoot: vscode.Uri,
    currentExclude: Record<string, boolean>,
    managedEntries: string[],
    manifest: ManifestManager,
    telemetry: TelemetryEmitter,
): Promise<void> {
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

    await applyExclusions(config, workspaceRoot, updatedExclude, allToManage, manifest, telemetry, {
        action: "update",
        hidden: selected.length,
        visible: allToManage.length - selected.length,
    });
}

export function createToggleDotFoldersCommand(
    manifest: ManifestManager,
    telemetry: TelemetryEmitter
): () => Promise<void> {
    return async () => {
        // Use the first initialized root. If none is initialized, the command should not
        // be visible (enforced by the "when" clause in package.json), but guard defensively.
        const workspaceRoot = await requireInitializedRoot(manifest);
        if (!workspaceRoot) {
            return;
        }

        const config = vscode.workspace.getConfiguration("files", workspaceRoot);
        const currentExclude: Record<string, boolean> = config.get<Record<string, boolean>>("exclude") ?? {};

        // Read managed entries from .memoria/dotfolders.json (empty on first use).
        const dotfoldersConfig = await manifest.readDotfolders(workspaceRoot);
        // Only entries that Memoria manages are ever hidden or shown.
        // This prevents the command from touching files.exclude entries added by the
        // user or other extensions, ensuring safe coexistence with other exclusion rules.
        const managedEntries: string[] = dotfoldersConfig?.managedEntries ?? [];

        // Determine which managed entries are currently hidden.
        const hiddenManaged = managedEntries.filter((entry) => currentExclude[entry] === true);

        // Two code paths intentionally:
        // 1. First toggle (nothing hidden yet): hides all discovered dot-folders at once —
        //    fast and requires no user interaction.
        // 2. Subsequent toggles (some already hidden): shows a QuickPick for fine-grained
        //    per-folder control, so the user can selectively show/hide individual entries.
        if (hiddenManaged.length === 0) {
            await hideAllDotFolders(config, workspaceRoot, currentExclude, manifest, telemetry);
        } else {
            await interactiveToggleDotFolders(config, workspaceRoot, currentExclude, managedEntries, manifest, telemetry);
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
