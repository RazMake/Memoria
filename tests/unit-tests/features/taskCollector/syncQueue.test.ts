import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SyncQueue } from "../../../../src/features/taskCollector/syncQueue";
import type { SyncJob } from "../../../../src/features/taskCollector/types";

describe("SyncQueue", () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("should debounce duplicate source jobs and resolve all callers when the same source is queued repeatedly", async () => {
        const handled: SyncJob[] = [];
        const handler = vi.fn(async (job: SyncJob) => {
            handled.push(job);
        });
        const queue = new SyncQueue(handler, 300);

        const first = queue.enqueue({ kind: "source", uri: "file:///workspace/notes.md" });
        const second = queue.enqueue({ kind: "source", uri: "file:///workspace/notes.md" });

        await vi.advanceTimersByTimeAsync(299);
        expect(handler).not.toHaveBeenCalled();

        await vi.advanceTimersByTimeAsync(1);
        await Promise.all([first, second]);

        expect(handler).toHaveBeenCalledOnce();
        expect(handled).toEqual([{ kind: "source", uri: "file:///workspace/notes.md" }]);
    });

    it("should execute full jobs immediately without waiting for the debounce interval", async () => {
        const handled: SyncJob[] = [];
        const handler = vi.fn(async (job: SyncJob) => {
            handled.push(job);
        });
        const queue = new SyncQueue(handler, 300);

        await queue.enqueue({ kind: "full" });

        expect(handler).toHaveBeenCalledOnce();
        expect(handled).toEqual([{ kind: "full" }]);
    });

    it("should wait for pending debounced work and active handlers when drain is called", async () => {
        let resolveHandler: (() => void) | null = null;
        const handler = vi.fn(() => new Promise<void>((resolve) => {
            resolveHandler = resolve;
        }));
        const queue = new SyncQueue(handler, 300);

        const job = queue.enqueue({ kind: "collector", renderOnly: true });
        const drain = queue.drain();

        let drained = false;
        void drain.then(() => {
            drained = true;
        });

        await vi.advanceTimersByTimeAsync(300);
        await Promise.resolve();

        expect(handler).toHaveBeenCalledOnce();
        expect(drained).toBe(false);

        resolveHandler?.();
        await job;
        await drain;

        expect(drained).toBe(true);
    });

    it("should reject pending jobs when disposed before the debounce timer fires", async () => {
        const handler = vi.fn(async () => undefined);
        const queue = new SyncQueue(handler, 300);

        const pending = queue.enqueue({ kind: "source", uri: "file:///workspace/notes.md" });
        queue.dispose();

        await expect(pending).rejects.toThrow("SyncQueue has been disposed.");
        expect(handler).not.toHaveBeenCalled();
    });

    it("should process a collector render job enqueued by the handler during a source job", async () => {
        const handled: SyncJob[] = [];
        let queue: SyncQueue;
        const handler = vi.fn(async (job: SyncJob) => {
            handled.push(job);
            if (job.kind === "source") {
                void queue.enqueue({ kind: "collector", renderOnly: true }).catch(() => {});
            }
        });
        queue = new SyncQueue(handler, 300);

        const sourceJob = queue.enqueue({ kind: "source", uri: "file:///workspace/notes.md" });
        await vi.advanceTimersByTimeAsync(300);
        await sourceJob;

        expect(handled).toHaveLength(1);
        expect(handled[0]).toEqual({ kind: "source", uri: "file:///workspace/notes.md" });

        await vi.advanceTimersByTimeAsync(300);
        await vi.runAllTimersAsync();

        expect(handled).toHaveLength(2);
        expect(handled[1]).toEqual({ kind: "collector", renderOnly: true });
    });
});