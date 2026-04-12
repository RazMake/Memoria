// Handles the UI-facing conflict resolution prompts during workspace re-initialization.
// Separates user-interaction logic from the engine's orchestration so each can be tested
// and reasoned about independently.
//
// resolveConflicts() performs all upfront analysis (extra folders, modified files) and
// drives the folder-cleanup QuickPick. Per-file overwrite decisions are made lazily
// during scaffolding via promptFileOverwrite() — called by BlueprintEngine as it visits
// each conflicted file.

import * as vscode from "vscode";
import { computeFileHash } from "./hashUtils";
import type {
    BlueprintDefinition,
    BlueprintManifest,
    OverwriteChoice,
    ReinitPlan,
    WorkspaceEntry,
} from "./types";

export class ReinitConflictResolver {
    constructor(
        private readonly fs: typeof vscode.workspace.fs
    ) {}

    /**
     * Analyses the current workspace state against the new blueprint definition and returns
     * a ReinitPlan. For extra folders, the user is prompted interactively via a QuickPick.
     * The returned plan drives all subsequent engine operations (folder moves, file overwrite decisions).
     *
     * For a different-blueprint reinit, ALL top-level folders present on disk are treated as
     * extra (since none of them belong to the new blueprint's structure).
     */
    async resolveConflicts(
        workspaceRoot: vscode.Uri,
        currentManifest: BlueprintManifest,
        newDefinition: BlueprintDefinition
    ): Promise<ReinitPlan> {
        const isDifferentBlueprint = currentManifest.blueprintId !== newDefinition.id;

        // Identify extra top-level folders: present on disk but absent from the new blueprint.
        const extraFolders = await this.findExtraFolders(workspaceRoot, newDefinition, isDifferentBlueprint);

        const foldersToCleanup =
            extraFolders.length > 0 ? await this.promptFolderCleanup(extraFolders) : [];

        // Categorise files in the new blueprint as unmodified or modified.
        const flatFiles = this.flattenWorkspaceFiles(newDefinition.workspace);
        const unmodifiedBlueprintFiles: string[] = [];
        const modifiedBlueprintFiles = new Set<string>();
        const currentFileHashes: Record<string, string | null> = {};

        // Parallel hash reads — independent I/O operations across distinct files.
        const hashResults = await Promise.all(
            flatFiles.map(async (relativePath) => {
                const isInCleanupFolder = foldersToCleanup.some(
                    (f) => relativePath === f || relativePath.startsWith(f + "/") || relativePath.startsWith(f.replace(/\/$/, "") + "/")
                );
                if (isInCleanupFolder) {
                    return { relativePath, skip: true, hash: null as string | null };
                }

                const storedHash = currentManifest.fileManifest[relativePath];
                if (!storedHash) {
                    return { relativePath, skip: false, isNew: true, hash: null as string | null };
                }

                const currentHash = await this.readCurrentHash(workspaceRoot, relativePath);
                return { relativePath, skip: false, isNew: false, storedHash, hash: currentHash };
            })
        );

        for (const result of hashResults) {
            if (result.skip) {
                continue;
            }
            if (result.isNew) {
                unmodifiedBlueprintFiles.push(result.relativePath);
                continue;
            }

            currentFileHashes[result.relativePath] = result.hash;
            if (result.hash === null || result.hash === result.storedHash) {
                unmodifiedBlueprintFiles.push(result.relativePath);
            } else {
                modifiedBlueprintFiles.add(result.relativePath);
            }
        }

        return { foldersToCleanup, unmodifiedBlueprintFiles, modifiedBlueprintFiles, currentFileHashes };
    }

    /**
     * Shows a multi-select QuickPick listing extra folders.
     * Returns the subset the user chose to move to ReInitializationCleanup/.
     * Returns an empty array if the user cancels.
     */
    async promptFolderCleanup(extraFolders: string[]): Promise<string[]> {
        const items = extraFolders.map((folder) => ({
            label: folder,
            description: "Move to ReInitializationCleanup/",
            picked: false,
        }));

        const picked = await vscode.window.showQuickPick(items, {
            title: "Memoria: Extra folders found",
            placeHolder: "Select folders to move to ReInitializationCleanup/ (unselected folders are kept)",
            canPickMany: true,
        });

        return picked ? picked.map((item) => item.label) : [];
    }

    /**
     * Shows a modal-style information message prompting the user to decide what to do with
     * a blueprint-managed file that they have modified.
     *
     * Returns the user's choice:
     *   - "yes"                 — overwrite this file only
     *   - "yes-folder"          — overwrite all modified files in the same folder (non-recursive)
     *   - "yes-folder-recursive"— overwrite all modified files in the folder and its subfolders
     *   - "no"                  — skip this file (keep the user's version)
     */
    async promptFileOverwrite(modifiedFile: string): Promise<OverwriteChoice> {
        const folder = modifiedFile.includes("/")
            ? modifiedFile.substring(0, modifiedFile.lastIndexOf("/"))
            : "(root)";

        const yesLabel = "Yes";
        const yesFolderLabel = `Yes — all in ${folder}/`;
        const yesFolderRecursiveLabel = `Yes — all in ${folder}/ (recursive)`;
        const noLabel = "No";

        const result = await vscode.window.showInformationMessage(
            `"${modifiedFile}" has been modified. Overwrite with the blueprint version?`,
            { modal: true },
            yesLabel,
            yesFolderLabel,
            yesFolderRecursiveLabel,
            noLabel
        );

        switch (result) {
            case yesLabel:
                return "yes";
            case yesFolderLabel:
                return "yes-folder";
            case yesFolderRecursiveLabel:
                return "yes-folder-recursive";
            default:
                // "No" or dialog dismissed — preserve the user's file.
                return "no";
        }
    }

    private async findExtraFolders(
        workspaceRoot: vscode.Uri,
        newDefinition: BlueprintDefinition,
        allFoldersAreExtra: boolean
    ): Promise<string[]> {
        const entries = await this.fs.readDirectory(workspaceRoot);
        const blueprintTopLevelFolders = new Set(
            newDefinition.workspace
                .filter((e) => e.isFolder)
                .map((e) => e.name.replace(/\/$/, ""))
        );

        const excludedFolders = new Set(["ReInitializationCleanup", ".memoria"]);

        return entries
            .filter(([name, type]) => {
                if (type !== vscode.FileType.Directory) return false;
                if (excludedFolders.has(name)) return false;
                if (allFoldersAreExtra) return true;
                return !blueprintTopLevelFolders.has(name);
            })
            .map(([name]) => name);
    }

    private flattenWorkspaceFiles(entries: WorkspaceEntry[], prefix = "", result: string[] = []): string[] {
        for (const entry of entries) {
            const name = entry.name.replace(/\/$/, "");
            const relativePath = prefix ? `${prefix}/${name}` : name;
            if (entry.isFolder) {
                if (entry.children) {
                    this.flattenWorkspaceFiles(entry.children, relativePath, result);
                }
            } else {
                result.push(relativePath);
            }
        }
        return result;
    }

    private async readCurrentHash(workspaceRoot: vscode.Uri, relativePath: string): Promise<string | null> {
        try {
            const uri = vscode.Uri.joinPath(workspaceRoot, ...relativePath.split("/"));
            const content = await this.fs.readFile(uri);
            return computeFileHash(content);
        } catch {
            return null;
        }
    }
}
