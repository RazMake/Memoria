import * as vscode from "vscode";
import { type DeferredTelemetryLogger } from "./telemetry";
import { BlueprintRegistry } from "./blueprints/blueprintRegistry";
import { ManifestManager } from "./blueprints/manifestManager";
import { BlueprintEngine } from "./blueprints/blueprintEngine";
import { WorkspaceInitConflictResolver } from "./blueprints/workspaceInitConflictResolver";
import { createInitializeWorkspaceCommand } from "./commands/initializeWorkspace";
import { createToggleVisibilityCommand } from "./commands/toggleDotFolders";
import { createManageFeaturesCommand } from "./commands/manageFeatures";
import { createOpenDefaultFileCommand } from "./commands/openDefaultFile";
import { createSyncTasksCommand } from "./commands/syncTasks";
import {
    createAddPersonCommand,
    createDeletePersonCommand,
    createEditPersonCommand,
    createMovePersonCommand,
    createRepairContactsLocationCommand,
} from "./commands/contactCommands";
import { createExpandSnippetCommand, createResetSnippetCommand } from "./commands/snippetCommands";
import { createOpenUserGuideCommand } from "./commands/openUserGuide";
import { FeatureManager } from "./features/featureManager";
import { ContactsFeature } from "./features/contacts/contactsFeature";
import { TaskCollectorFeature } from "./features/taskCollector/taskCollectorFeature";
import { SnippetsFeature } from "./features/snippets/snippetsFeature";
import { BackupFeature } from "./features/backup/backupFeature";
import {
    createCreateBackupProfileCommand,
    createRunBackupCommand,
    createBackupHistoryCommand,
} from "./commands/backupCommands";

export interface CommandDependencies {
    engine: BlueprintEngine;
    registry: BlueprintRegistry;
    manifest: ManifestManager;
    telemetry: DeferredTelemetryLogger;
    resolver: WorkspaceInitConflictResolver;
    featureManager: FeatureManager;
    taskCollectorFeature: TaskCollectorFeature;
    contactsFeature: ContactsFeature;
    snippetsFeature: SnippetsFeature;
    backupFeature: BackupFeature;
    extensionUri: vscode.Uri;
    onWorkspaceInitialized: (root: vscode.Uri) => Promise<void>;
}

export function registerCommands(
    context: vscode.ExtensionContext,
    deps: CommandDependencies,
): void {
    const { engine, registry, manifest, telemetry, resolver, featureManager,
        taskCollectorFeature, contactsFeature, snippetsFeature, backupFeature, extensionUri, onWorkspaceInitialized } = deps;

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
            createToggleVisibilityCommand(manifest, telemetry)
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
            "memoria.repairContactsLocation",
            createRepairContactsLocationCommand(contactsFeature)
        ),
        vscode.commands.registerCommand(
            "memoria.expandSnippet",
            createExpandSnippetCommand(snippetsFeature),
        ),
        vscode.commands.registerCommand(
            "memoria.resetSnippet",
            createResetSnippetCommand(manifest, registry),
        ),
        vscode.commands.registerCommand(
            "memoria.openUserGuide",
            createOpenUserGuideCommand(extensionUri)
        ),
        // Noop command used to shadow built-in keybindings (e.g. Ctrl+B toggling
        // the sidebar) when the todo editor webview has focus.  The actual
        // formatting is handled inside the webview's own keydown handler.
        vscode.commands.registerCommand("memoria.todoEditor.noop", () => {}),
        vscode.commands.registerCommand(
            "memoria.createBackupProfile",
            createCreateBackupProfileCommand(backupFeature, telemetry),
        ),
        vscode.commands.registerCommand(
            "memoria.runBackup",
            createRunBackupCommand(backupFeature),
        ),
        vscode.commands.registerCommand(
            "memoria.backupHistory",
            createBackupHistoryCommand(backupFeature),
        ),
    );
}
