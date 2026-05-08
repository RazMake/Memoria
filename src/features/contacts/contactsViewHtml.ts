import type * as vscode from "vscode";
import { buildWebviewHtml } from "../../utils/webview";

export { escapeAttribute, getNonce } from "../../utils/webview";

export function getHtmlForWebview(webview: vscode.Webview, nonce: string, scriptUri: vscode.Uri): string {
    return buildWebviewHtml({
        webview,
        nonce,
        title: "Contacts",
        scriptUri,
        cspDirectives: [
            "default-src 'none'",
            `style-src ${webview.cspSource} 'nonce-${nonce}'`,
            `script-src 'nonce-${nonce}'`,
            `img-src ${webview.cspSource} data:`,
            `font-src ${webview.cspSource}`,
            "base-uri 'none'",
            "form-action 'none'",
            "frame-src 'none'",
            "connect-src 'none'",
        ],
    });
}

