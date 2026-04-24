import { describe, expect, it, vi } from "vitest";
import { escapeAttribute, getHtmlForWebview, getNonce } from "../../../../src/features/contacts/contactsViewHtml";

describe("contactsViewHtml", () => {
    describe("getNonce", () => {
        it("should return a non-empty string", () => {
            const nonce = getNonce();

            expect(nonce).toBeTruthy();
            expect(typeof nonce).toBe("string");
        });

        it("should return unique nonces on successive calls", () => {
            const nonce1 = getNonce();
            const nonce2 = getNonce();

            expect(nonce1).not.toBe(nonce2);
        });
    });

    describe("getHtmlForWebview", () => {
        function createMockWebview() {
            return {
                cspSource: "https://mock.csp.source",
                asWebviewUri: vi.fn((uri: { toString: () => string }) => uri),
            } as any;
        }

        it("should include CSP with nonce", () => {
            const webview = createMockWebview();
            const nonce = "test-nonce-123";
            const scriptUri = { toString: () => "https://mock/dist/contacts-webview.js" } as any;

            const html = getHtmlForWebview(webview, nonce, scriptUri);

            expect(html).toContain("Content-Security-Policy");
            expect(html).toContain(`'nonce-${nonce}'`);
            expect(html).toContain(webview.cspSource);
        });

        it("should include webview bundle reference", () => {
            const webview = createMockWebview();
            const nonce = "test-nonce-456";
            const scriptUri = { toString: () => "https://mock/dist/contacts-webview.js" } as any;

            const html = getHtmlForWebview(webview, nonce, scriptUri);

            expect(html).toContain("contacts-webview.js");
            expect(html).toContain(`nonce="${nonce}"`);
        });

        it("should contain root div element", () => {
            const webview = createMockWebview();
            const nonce = "abc";
            const scriptUri = { toString: () => "https://mock/script.js" } as any;

            const html = getHtmlForWebview(webview, nonce, scriptUri);

            expect(html).toContain('<div id="root"');
            expect(html).toContain(`data-nonce="${nonce}"`);
        });

        it("should escape special characters in nonce", () => {
            const webview = createMockWebview();
            const nonce = 'nonce"with<special>&chars';
            const scriptUri = { toString: () => "https://mock/script.js" } as any;

            const html = getHtmlForWebview(webview, nonce, scriptUri);

            expect(html).not.toContain('nonce"with');
            expect(html).toContain("nonce&quot;with&lt;special&gt;&amp;chars");
        });
    });

    describe("escapeAttribute", () => {
        it("should escape ampersands", () => {
            expect(escapeAttribute("a&b")).toBe("a&amp;b");
        });

        it("should escape double quotes", () => {
            expect(escapeAttribute('a"b')).toBe("a&quot;b");
        });

        it("should escape angle brackets", () => {
            expect(escapeAttribute("a<b>c")).toBe("a&lt;b&gt;c");
        });

        it("should return unchanged string when no special chars present", () => {
            expect(escapeAttribute("hello")).toBe("hello");
        });
    });
});
