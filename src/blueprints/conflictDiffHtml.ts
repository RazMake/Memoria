import type * as vscode from "vscode";
import { buildWebviewHtml } from "../utils/webview";

export { getNonce } from "../utils/webview";

export function getConflictDiffHtml(
    webview: vscode.Webview,
    nonce: string,
    scriptUri: vscode.Uri,
    cssUri: vscode.Uri,
): string {
    return buildWebviewHtml({
        webview,
        nonce,
        title: "Conflict Diff",
        scriptUri,
        cssUri,
        bodyHtml: `<div id="root">
        <div class="loading-skeleton">
            <div class="skeleton-bar skeleton-short"></div>
            <div class="skeleton-bar"></div>
            <div class="skeleton-bar"></div>
        </div>
    </div>`,
    });
}
