import { describe, it, expect, vi } from "vitest";

vi.mock("vscode", () => ({}));

import { getNonce, getHtmlForWebview } from "../../../../src/features/todoEditor/todoEditorHtml";

describe("todoEditorHtml", () => {
    describe("getNonce", () => {
        it("should return a string of expected length", () => {
            const nonce = getNonce();
            // 24 random bytes → base64url = 32 chars
            expect(nonce).toHaveLength(32);
        });

        it("should return different values on consecutive calls", () => {
            const a = getNonce();
            const b = getNonce();
            expect(a).not.toBe(b);
        });
    });

    describe("getHtmlForWebview", () => {
        const nonce = "test-nonce-123";
        const scriptUri = { toString: () => "https://file+.vscode-resource.vscode-cdn.net/script.js" } as any;
        const cssUri = { toString: () => "https://file+.vscode-resource.vscode-cdn.net/style.css" } as any;
        const webview = {
            cspSource: "https://file+.vscode-resource.vscode-cdn.net",
        } as any;

        it("should include CSP meta tag with nonce", () => {
            const html = getHtmlForWebview(webview, nonce, scriptUri, cssUri);
            expect(html).toContain(`Content-Security-Policy`);
            expect(html).toContain(`'nonce-${nonce}'`);
        });

        it("should include script reference with nonce", () => {
            const html = getHtmlForWebview(webview, nonce, scriptUri, cssUri);
            expect(html).toContain(`<script nonce="${nonce}" src="${scriptUri}"></script>`);
        });

        it("should include stylesheet reference", () => {
            const html = getHtmlForWebview(webview, nonce, scriptUri, cssUri);
            expect(html).toContain(`<link rel="stylesheet" href="${cssUri}">`);
        });

        it("should include the webview cspSource in the CSP header", () => {
            const html = getHtmlForWebview(webview, nonce, scriptUri, cssUri);
            expect(html).toContain(webview.cspSource);
        });
    });
});
