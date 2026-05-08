import * as vscode from "vscode";
import type { BlueprintRegistry } from "../blueprints/blueprintRegistry";
import type { ManifestManager } from "../blueprints/manifestManager";
import { findInitializedRootSilently } from "./commandHelpers";
import type { SnippetsFeature } from "../features/snippets/snippetsFeature";

export function createExpandSnippetCommand(
    snippetsFeature: SnippetsFeature,
): (trigger: string, documentUriStr: string) => Promise<void> {
    return async (trigger: string, documentUriStr: string) => {
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
    };
}

export function createResetSnippetCommand(
    manifest: ManifestManager,
    registry: BlueprintRegistry,
): (uri: vscode.Uri) => Promise<void> {
    return async (uri: vscode.Uri) => {
        if (!uri) {
            vscode.window.showInformationMessage("Memoria: No file selected.");
            return;
        }

        const root = await findInitializedRootSilently(manifest);
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
                throw new Error("original not found");
            }
            await vscode.workspace.fs.writeFile(uri, originalBytes);
            vscode.window.showInformationMessage(`Memoria: Snippet reset to default.`);
        } catch {
            vscode.window.showWarningMessage("Memoria: Could not reset snippet — original not found.");
        }
    };
}
