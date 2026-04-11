import { createHash } from "crypto";

/** Computes SHA-256 of the given bytes. Returns "sha256:<lowercase hex>". */
export function computeFileHash(content: Uint8Array): string {
    const hash = createHash("sha256").update(content).digest("hex");
    return `sha256:${hash}`;
}
