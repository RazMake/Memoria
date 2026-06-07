// Factory for the "Memoria: Toggle folders/files visibility" command handler.
// Toggles visibility of dot-folders and dot-files (entries starting with ".") at the
// workspace root by managing the workspace-level files.exclude setting.
// Users can also add arbitrary paths (files or folders at any depth) to the managed list.
//
// Tracking which entries Memoria manages is stored in .memoria/dotfolders.json.
// The command never touches files.exclude entries it does not own, ensuring it coexists
// safely with user-managed or other-extension-managed exclusions.

import * as vscode from "vscode";
import type { ManifestManager } from "../blueprints/manifestManager";
import type { TelemetryEmitter } from "../telemetry";
import { requireInitializedRoot } from "./commandHelpers";
import { showInfo } from "../utils/uiMessages";

/** Persists the exclusion state to workspace config, managed-entries manifest, and telemetry. */
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
    telemetry.logUsage("visibility.toggle", telemetryProps);
}

/** "All visible" path: scan for dot-entries (folders and files) and hide them all. */
async function hideAllDotEntries(
    config: vscode.WorkspaceConfiguration,
    workspaceRoot: vscode.Uri,
    currentExclude: Record<string, boolean>,
    manifest: ManifestManager,
    telemetry: TelemetryEmitter,
): Promise<void> {
    const dotEntries = await scanDotEntries(workspaceRoot);
    if (dotEntries.length === 0) {
        showInfo("No items starting with '.' found at the workspace root.");
        return;
    }

    const updatedExclude = { ...currentExclude };
    for (const name of dotEntries) {
        updatedExclude[name] = true;
    }

    await applyExclusions(config, workspaceRoot, updatedExclude, dotEntries, manifest, telemetry, {
        action: "hide",
        count: dotEntries.length,
    });
    showInfo(
        `${dotEntries.length} item(s) hidden.`
    );
}

/** "Some hidden" path: show a multi-select QuickPick for fine-grained control. */
async function interactiveToggleVisibility(
    config: vscode.WorkspaceConfiguration,
    workspaceRoot: vscode.Uri,
    currentExclude: Record<string, boolean>,
    managedEntries: string[],
    manifest: ManifestManager,
    telemetry: TelemetryEmitter,
): Promise<void> {
    // All managed entries are listed; currently hidden ones are pre-checked.
    const allDotEntries = await scanDotEntries(workspaceRoot);
    // Merge with managed entries so newly-discovered dot-entries appear too.
    const allToManage = [...new Set([...managedEntries, ...allDotEntries])];

    const items = allToManage.map((name) => ({
        label: name,
        picked: currentExclude[name] === true,
    }));

    const selected = await vscode.window.showQuickPick(items, {
        title: "Memoria: Manage folders/files visibility",
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

export function createToggleVisibilityCommand(
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
        const dotfoldersConfig = await manifest.readVisibilityConfig(workspaceRoot);
        // Only entries that Memoria manages are ever hidden or shown.
        // This prevents the command from touching files.exclude entries added by the
        // user or other extensions, ensuring safe coexistence with other exclusion rules.
        const managedEntries: string[] = dotfoldersConfig?.managedEntries ?? [];

        // Determine which managed entries are currently hidden.
        const hiddenManaged = managedEntries.filter((entry) => currentExclude[entry] === true);

        // Two code paths intentionally:
        // 1. First toggle (nothing hidden yet): hides all discovered dot-entries at once —
        //    fast and requires no user interaction.
        // 2. Subsequent toggles (some already hidden): shows a QuickPick for fine-grained
        //    per-entry control, so the user can selectively show/hide individual entries.
        if (hiddenManaged.length === 0) {
            await hideAllDotEntries(config, workspaceRoot, currentExclude, manifest, telemetry);
        } else {
            await interactiveToggleVisibility(config, workspaceRoot, currentExclude, managedEntries, manifest, telemetry);
        }
    };
}

/** Returns the names of all entries (directories and files) starting with "." at the workspace root. */
async function scanDotEntries(workspaceRoot: vscode.Uri): Promise<string[]> {
    const entries = await vscode.workspace.fs.readDirectory(workspaceRoot);
    return entries
        .filter(([name]) => name.startsWith("."))
        .map(([name]) => name);
}
