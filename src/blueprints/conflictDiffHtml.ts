import type * as vscode from "vscode";

export { getNonce } from "../utils/webview";

export function getConflictDiffHtml(
    webview: vscode.Webview,
    nonce: string,
    scriptUri: vscode.Uri,
    cssUri: vscode.Uri,
): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'nonce-${nonce}'; script-src 'nonce-${nonce}'; font-src ${webview.cspSource};">
    <title>Conflict Diff</title>
    <link rel="stylesheet" href="${cssUri}">
</head>
<body>
    <div id="root">
        <div class="loading-skeleton">
            <div class="skeleton-bar skeleton-short"></div>
            <div class="skeleton-bar"></div>
            <div class="skeleton-bar"></div>
        </div>
    </div>
    <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}
