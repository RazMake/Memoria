// Factory for the "Memoria: Open User Guide" command handler.
// Shows a quick-pick of documentation sections, then opens the selected
// markdown file in VS Code's built-in markdown preview.

import * as vscode from "vscode";

interface SelectableDocItem extends vscode.QuickPickItem {
    file: string;
}

function buildItems(): SelectableDocItem[] {
    const doc = (label: string, description: string, file: string): SelectableDocItem => ({
        label,
        description,
        file,
    });

    return [
        doc("Getting Started", "Installation and first steps", "getting-started.md"),
        doc("All Commands", "Overview of available commands", "commands/index.md"),
        doc("All Blueprints", "Overview of blueprints included with the extension", "blueprints/index.md"),
        doc("All Features", "Overview of features provided by the extension", "features/index.md"),
        doc("Configuration Overview", "Details of the configuration files and their structure", "configuration/index.md"),
        doc("FAQ & Troubleshooting", "Common questions and fixes", "faq.md"),
    ];
}

export function createOpenUserGuideCommand(
    extensionUri: vscode.Uri
): (sectionFile?: string) => Promise<void> {
    return async (sectionFile?: string) => {
        const items = buildItems();
        let targetFile: string;

        if (sectionFile) {
            const match = items.find((s) => s.file === sectionFile);
            targetFile = match ? match.file : items[0].file;
        } else {
            const picked = await vscode.window.showQuickPick(items, {
                title: "Memoria: User Guide",
                placeHolder: "Select a section to open",
            });
            if (!picked || !picked.file) {
                return;
            }
            targetFile = picked.file;
        }

        const docUri = vscode.Uri.joinPath(extensionUri, "resources", "docs", targetFile);
        await vscode.commands.executeCommand("markdown.showPreview", docUri);
    };
}
