import type * as vscode from "vscode";
import { buildWebviewHtml } from "../../utils/webview";

export { getNonce } from "../../utils/webview";

export function getHtmlForWebview(webview: vscode.Webview, nonce: string, scriptUri: vscode.Uri, cssUri: vscode.Uri): string {
    return buildWebviewHtml({
        webview,
        nonce,
        title: "Todo Editor",
        scriptUri,
        cssUri,
        inlineStyles: `
        .loading-skeleton { padding: 16px; opacity: 0.5; }
        .skeleton-bar { height: 48px; background: var(--vscode-editor-foreground, #888); opacity: 0.08; border-radius: 6px; margin-bottom: 8px; }
        .skeleton-short { height: 14px; width: 120px; opacity: 0.15; margin-bottom: 16px; }
    `,
        bodyHtml: `<div id="root" data-nonce="${nonce}">
        <div class="loading-skeleton">
            <div class="skeleton-bar skeleton-short"></div>
            <div class="skeleton-bar"></div>
            <div class="skeleton-bar"></div>
            <div class="skeleton-bar"></div>
        </div>
    </div>`,
    });
}

