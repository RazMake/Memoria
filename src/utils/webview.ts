import { randomBytes } from "node:crypto";
import type * as vscode from "vscode";

/** Number of random bytes used for CSP nonces. 24 bytes = 192 bits of entropy. */
const NONCE_BYTE_LENGTH = 24;

/**
 * Generates a cryptographically secure nonce for Content Security Policy headers.
 * Uses base64url encoding to avoid characters that need escaping in HTML attributes.
 */
export function getNonce(): string {
    return randomBytes(NONCE_BYTE_LENGTH).toString("base64url");
}

/** Escapes a string for safe use in an HTML attribute value. */
export function escapeAttribute(value: string): string {
    return value
        .replace(/&/g, "&amp;")
        .replace(/"/g, "&quot;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

export interface WebviewHtmlOptions {
    webview: vscode.Webview;
    nonce: string;
    title: string;
    scriptUri: vscode.Uri;
    cssUri?: vscode.Uri;
    cspDirectives?: string[];
    bodyHtml?: string;
    inlineStyles?: string;
}

export function buildWebviewHtml(options: WebviewHtmlOptions): string {
    const { webview, nonce, title, scriptUri, cssUri, bodyHtml, inlineStyles } = options;

    const cspDirectives = options.cspDirectives ?? [
        "default-src 'none'",
        `style-src ${webview.cspSource} 'nonce-${nonce}'`,
        `script-src 'nonce-${nonce}'`,
        `font-src ${webview.cspSource}`,
    ];
    const csp = cspDirectives.join("; ");

    const cssLink = cssUri ? `\n    <link rel="stylesheet" href="${cssUri}">` : "";
    const inlineStyleBlock = inlineStyles ? `\n    <style nonce="${nonce}">${inlineStyles}</style>` : "";
    const body = bodyHtml ?? `<div id="root" data-nonce="${escapeAttribute(nonce)}"></div>`;

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="${escapeAttribute(csp)}">
    <title>${escapeAttribute(title)}</title>${cssLink}${inlineStyleBlock}
</head>
<body>
    ${body}
    <script nonce="${escapeAttribute(nonce)}" src="${escapeAttribute(scriptUri.toString())}"></script>
</body>
</html>`;
}

/**
 * Returns a promise that resolves when the webview sends a `{ type: "ready" }` message,
 * or after `timeoutMs` (default 1000 ms) if the ready signal never arrives.
 *
 * This pattern is used by all webview panels (conflict resolver, todo editor, contacts view)
 * to ensure the first `postMessage` doesn't arrive before the webview script has attached
 * its message listener.
 */
export function waitForWebviewReady(webview: vscode.Webview, timeoutMs = 1000): Promise<void> {
    return new Promise<void>((resolve) => {
        const listener = webview.onDidReceiveMessage((msg) => {
            if (msg?.type === "ready") {
                listener.dispose();
                resolve();
            }
        });
        setTimeout(() => { listener.dispose(); resolve(); }, timeoutMs);
    });
}
