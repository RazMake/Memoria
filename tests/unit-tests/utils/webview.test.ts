import { describe, it, expect } from "vitest";
import { getNonce, escapeAttribute } from "../../../src/utils/webview";

describe("getNonce", () => {
    it("should return a non-empty string", () => {
        expect(getNonce()).toBeTruthy();
    });

    it("should return different values on consecutive calls", () => {
        expect(getNonce()).not.toBe(getNonce());
    });

    it("should return base64url-safe characters only", () => {
        const nonce = getNonce();
        expect(nonce).toMatch(/^[A-Za-z0-9_-]+$/);
    });
});

describe("escapeAttribute", () => {
    it("should escape ampersands", () => {
        expect(escapeAttribute("a&b")).toBe("a&amp;b");
    });

    it("should escape quotes", () => {
        expect(escapeAttribute('a"b')).toBe("a&quot;b");
    });

    it("should escape angle brackets", () => {
        expect(escapeAttribute("<script>")).toBe("&lt;script&gt;");
    });

    it("should pass through safe strings unchanged", () => {
        expect(escapeAttribute("hello world")).toBe("hello world");
    });
});
