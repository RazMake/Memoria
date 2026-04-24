import { randomBytes } from "node:crypto";

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
