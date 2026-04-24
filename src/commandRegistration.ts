import * as vscode from "vscode";
import { type DeferredTelemetryLogger } from "./telemetry";
import { BlueprintRegistry } from "./blueprints/blueprintRegistry";
import { ManifestManager } from "./blueprints/manifestManager";
import { BlueprintEngine } from "./blueprints/blueprintEngine";
import { WorkspaceInitConflictResolver } from "./blueprints/workspaceInitConflictResolver";
import { getWorkspaceRoots } from "./blueprints/workspaceUtils";
import { createInitializeWorkspaceCommand } from "./commands/initializeWorkspace";
import { createToggleDotFoldersCommand } from "./commands/toggleDotFolders";
import { createManageFeaturesCommand } from "./commands/manageFeatures";
import { createOpenDefaultFileCommand } from "./commands/openDefaultFile";
import { createSyncTasksCommand } from "./commands/syncTasks";
import {
    createAddPersonCommand,
    createDeletePersonCommand,
    createEditPersonCommand,
    createMovePersonCommand,
} from "./commands/contactCommands";
import { FeatureManager } from "./features/featureManager";
import { ContactsFeature } from "./features/contacts/contactsFeature";
import { TaskCollectorFeature } from "./features/taskCollector/taskCollectorFeature";
import { SnippetsFeature } from "./features/snippets/snippetsFeature";

export function registerCommands(
    context: vscode.ExtensionContext,
    engine: BlueprintEngine,
    registry: BlueprintRegistry,
    manifest: ManifestManager,
    telemetry: DeferredTelemetryLogger,
    resolver: WorkspaceInitConflictResolver,
    featureManager: FeatureManager,
    taskCollectorFeature: TaskCollectorFeature,
    contactsFeature: ContactsFeature,
    snippetsFeature: SnippetsFeature,
    onWorkspaceInitialized: (root: vscode.Uri) => Promise<void>
): void {
    context.subscriptions.push(
        vscode.commands.registerCommand(
            "memoria.initializeWorkspace",
            createInitializeWorkspaceCommand(
                engine,
                registry,
                manifest,
                telemetry,
                resolver,
                onWorkspaceInitialized
            )
        ),
        vscode.commands.registerCommand(
            "memoria.toggleDotFolders",
            createToggleDotFoldersCommand(manifest, telemetry)
        ),
        vscode.commands.registerCommand(
            "memoria.manageFeatures",
            createManageFeaturesCommand(manifest, telemetry, featureManager)
        ),
        vscode.commands.registerCommand(
            "memoria.openDefaultFile",
            createOpenDefaultFileCommand(manifest)
        ),
        vscode.commands.registerCommand(
            "memoria.syncTasks",
            createSyncTasksCommand(taskCollectorFeature, telemetry)
        ),
        vscode.commands.registerCommand(
            "memoria.addPerson",
            createAddPersonCommand(contactsFeature)
        ),
        vscode.commands.registerCommand(
            "memoria.editPerson",
            createEditPersonCommand(contactsFeature)
        ),
        vscode.commands.registerCommand(
            "memoria.deletePerson",
            createDeletePersonCommand(contactsFeature)
        ),
        vscode.commands.registerCommand(
            "memoria.movePerson",
            createMovePersonCommand(contactsFeature)
        ),
        vscode.commands.registerCommand(
            "memoria.expandSnippet",
            async (trigger: string, documentUriStr: string) => {
                const editor = vscode.window.activeTextEditor;
                if (!editor || editor.document.uri.toString() !== documentUriStr) return;

                const allSnippets = snippetsFeature.getAllSnippets();
                const snippet = allSnippets.find((s) => s.trigger === trigger);
                if (!snippet) return;

                // Use the current cursor — VS Code places it after the accepted
                // completion's insertText (which is ""), so the cursor sits where
                // the trigger text was removed. A stray `}` may remain if the user
                // typed the full `{trigger}` before accepting.
                const cursorPos = editor.selection.active;
                const lineText = editor.document.lineAt(cursorPos.line).text;
                const hasStrayBrace = lineText[cursorPos.character] === "}";

                const selectedText = editor.selection.isEmpty === false
                    ? editor.document.getText(editor.selection)
                    : undefined;

                const expanded = await snippetsFeature.expandSnippet(
                    snippet, editor.document, cursorPos, selectedText,
                );

                await editor.edit((editBuilder) => {
                    if (hasStrayBrace) {
                        const braceRange = new vscode.Range(
                            cursorPos,
                            new vscode.Position(cursorPos.line, cursorPos.character + 1),
                        );
                        editBuilder.replace(braceRange, expanded);
                    } else {
                        editBuilder.insert(cursorPos, expanded);
                    }
                });
            },
        ),
        vscode.commands.registerCommand(
            "memoria.resetSnippet",
            async (uri: vscode.Uri) => {
                if (!uri) {
                    vscode.window.showInformationMessage("Memoria: No file selected.");
                    return;
                }

                const roots = getWorkspaceRoots();
                const root = await manifest.findInitializedRoot(roots);
                if (!root) return;

                const manifestData = await manifest.readManifest(root);
                if (!manifestData?.snippets) return;

                const relativePath = vscode.workspace.asRelativePath(uri, false);
                if (!(relativePath in manifestData.fileManifest)) {
                    vscode.window.showInformationMessage(
                        "This snippet was not shipped with the blueprint and cannot be reset.",
                    );
                    return;
                }

                try {
                    const originalBytes = await registry.getSeedFileContent(
                        manifestData.blueprintId,
                        relativePath,
                    );
                    if (!originalBytes) {
                        vscode.window.showWarningMessage("Memoria: Could not reset snippet — original not found.");
                        return;
                    }
                    await vscode.workspace.fs.writeFile(uri, originalBytes);
                    vscode.window.showInformationMessage(`Memoria: Snippet reset to default.`);
                } catch {
                    vscode.window.showWarningMessage("Memoria: Could not reset snippet — original not found.");
                }
            },
        ),
    );
}
