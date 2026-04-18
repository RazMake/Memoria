import { createHash } from "crypto";

/**
 * Computes SHA-256 of the given bytes. Returns "sha256:<lowercase hex>".
 *
 * SHA-256 is used to detect whether a user modified a blueprint file since last init —
 * not for cryptographic security. The "sha256:" prefix makes the algorithm explicit so
 * stored manifests can be migrated to a different hash without ambiguity.
 */
export function computeFileHash(content: Uint8Array): string {
    const hash = createHash("sha256").update(content).digest("hex");
    return `sha256:${hash}`;
}
