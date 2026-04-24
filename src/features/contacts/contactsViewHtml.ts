import type * as vscode from "vscode";
import { escapeAttribute } from "../../utils/webview";

export { escapeAttribute, getNonce } from "../../utils/webview";

export function getHtmlForWebview(webview: vscode.Webview, nonce: string, scriptUri: vscode.Uri): string {
    const csp = [
        "default-src 'none'",
        `style-src ${webview.cspSource} 'nonce-${nonce}'`,
        `script-src 'nonce-${nonce}'`,
        `img-src ${webview.cspSource} data:`,
        `font-src ${webview.cspSource}`,
        "base-uri 'none'",
        "form-action 'none'",
        "frame-src 'none'",
        "connect-src 'none'",
    ].join("; ");

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="${escapeAttribute(csp)}">
    <title>Contacts</title>
</head>
<body>
    <div id="root" data-nonce="${escapeAttribute(nonce)}"></div>
    <script nonce="${escapeAttribute(nonce)}" src="${escapeAttribute(scriptUri.toString())}"></script>
</body>
</html>`;
}

