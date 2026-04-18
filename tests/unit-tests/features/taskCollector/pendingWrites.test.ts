import { describe, expect, it } from "vitest";
import { PendingWrites, computeTextHash } from "../../../../src/features/taskCollector/pendingWrites";

describe("PendingWrites", () => {
    it("should consume a matching write only once for the same uri and content", () => {
        const pendingWrites = new PendingWrites();
        const uri = "file:///workspace/notes.md";

        pendingWrites.register(uri, "alpha");

        expect(pendingWrites.consumeIfPresent(uri, "alpha")).toBe(true);
        expect(pendingWrites.consumeIfPresent(uri, "alpha")).toBe(false);
    });

    it("should keep writes isolated by uri and content hash", () => {
        const pendingWrites = new PendingWrites();

        pendingWrites.register("file:///workspace/a.md", "alpha");
        pendingWrites.register("file:///workspace/b.md", "beta");

        expect(pendingWrites.consumeIfPresent("file:///workspace/a.md", "beta")).toBe(false);
        expect(pendingWrites.consumeIfPresent("file:///workspace/b.md", "beta")).toBe(true);
        expect(pendingWrites.consumeIfPresent("file:///workspace/a.md", "alpha")).toBe(true);
    });

    it("should evict expired writes before attempting a consume", () => {
        let now = 1_000;
        const pendingWrites = new PendingWrites(50, () => now);
        const uri = "file:///workspace/notes.md";

        pendingWrites.register(uri, "alpha");
        now += 60;

        expect(pendingWrites.consumeIfPresent(uri, "alpha")).toBe(false);
    });

    it("should produce deterministic text hashes for identical content", () => {
        expect(computeTextHash("alpha")).toBe(computeTextHash("alpha"));
        expect(computeTextHash("alpha")).not.toBe(computeTextHash("beta"));
    });
});