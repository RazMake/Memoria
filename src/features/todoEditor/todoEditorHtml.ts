import type * as vscode from "vscode";

export { getNonce } from "../../utils/webview";

export function getHtmlForWebview(webview: vscode.Webview, nonce: string, scriptUri: vscode.Uri, cssUri: vscode.Uri): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'nonce-${nonce}'; script-src 'nonce-${nonce}'; font-src ${webview.cspSource};">
    <title>Todo Editor</title>
    <link rel="stylesheet" href="${cssUri}">
    <style nonce="${nonce}">
        .loading-skeleton { padding: 16px; opacity: 0.5; }
        .skeleton-bar { height: 48px; background: var(--vscode-editor-foreground, #888); opacity: 0.08; border-radius: 6px; margin-bottom: 8px; }
        .skeleton-short { height: 14px; width: 120px; opacity: 0.15; margin-bottom: 16px; }
    </style>
</head>
<body>
    <div id="root" data-nonce="${nonce}">
        <div class="loading-skeleton">
            <div class="skeleton-bar skeleton-short"></div>
            <div class="skeleton-bar"></div>
            <div class="skeleton-bar"></div>
            <div class="skeleton-bar"></div>
        </div>
    </div>
    <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}

