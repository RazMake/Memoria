import { computeFileHash } from "../../blueprints/hashUtils";

const encoder = new TextEncoder();

interface PendingWriteRecord {
    hash: string;
    expiresAt: number;
}

export class PendingWrites {
    private readonly writes = new Map<string, PendingWriteRecord[]>();

    constructor(
        private readonly ttlMs = 5000,
        private readonly now: () => number = () => Date.now(),
    ) {}

    register(uri: string, content: string): string {
        const hash = computeTextHash(content);
        const records = this.writes.get(uri) ?? [];
        records.push({ hash, expiresAt: this.now() + this.ttlMs });
        this.writes.set(uri, records);
        return hash;
    }

    consumeIfPresent(uri: string, content: string): boolean {
        this.sweepExpired();
        const hash = computeTextHash(content);
        const records = this.writes.get(uri);
        if (!records || records.length === 0) {
            return false;
        }

        const index = records.findIndex((record) => record.hash === hash);
        if (index === -1) {
            return false;
        }

        records.splice(index, 1);
        if (records.length === 0) {
            this.writes.delete(uri);
        }
        return true;
    }

    sweepExpired(): void {
        const now = this.now();
        for (const [uri, records] of this.writes.entries()) {
            const remaining = records.filter((record) => record.expiresAt > now);
            if (remaining.length === 0) {
                this.writes.delete(uri);
            } else {
                this.writes.set(uri, remaining);
            }
        }
    }
}

export function computeTextHash(content: string): string {
    return computeFileHash(encoder.encode(normalizeLineEndings(content)));
}

function normalizeLineEndings(value: string): string {
    return value.replace(/\r\n/g, "\n");
}