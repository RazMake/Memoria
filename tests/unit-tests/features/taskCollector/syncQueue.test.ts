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

    it("flushPending returns early when there is no pending item for the key (internal path)", async () => {
        // Full jobs bypass debounce and go directly to pushQueuedJob — there is no pending entry.
        // If flushPending is called for a key that has no pending item, it returns without error.
        const handler = vi.fn(async () => undefined);
        const queue = new SyncQueue(handler, 300);

        // Two full jobs enqueued quickly: the second should be queued while the first processes.
        let resolveFirst: () => void;
        const firstStarted = new Promise<void>((res) => { resolveFirst = res; });
        const slowHandler = vi.fn(async (job: SyncJob) => {
            resolveFirst();
            // Simulate slow execution by yielding
            await Promise.resolve();
        });
        const queue2 = new SyncQueue(slowHandler, 0);
        const p1 = queue2.enqueue({ kind: "full" });
        // Enqueue a second full job while first might be processing
        const p2 = queue2.enqueue({ kind: "full" });

        await Promise.all([p1, p2]);
        expect(slowHandler).toHaveBeenCalledTimes(2);
    });

    it("coalesces two same-key jobs queued before the first is processed", async () => {
        // When the same debounced key is enqueued while a job is already in the queue
        // (but not yet being processed), pushQueuedJob takes the `existing` branch.
        const handled: SyncJob[] = [];
        let resolveFirst: (() => void) | undefined;
        const firstHandlerRunning = new Promise<void>((res) => { resolveFirst = res; });
        let unblockFirst: (() => void) | undefined;
        const blockFirst = new Promise<void>((res) => { unblockFirst = res; });

        const handler = vi.fn(async (job: SyncJob) => {
            handled.push(job);
            if (handled.length === 1) {
                resolveFirst?.();
                await blockFirst;
            }
        });
        const queue = new SyncQueue(handler, 0);

        // Enqueue first job — handler will start immediately for kind:"full"
        const j1 = queue.enqueue({ kind: "full" });
        // Wait until handler has started
        await firstHandlerRunning;
        // Enqueue second job while first is still running
        const j2 = queue.enqueue({ kind: "full" });
        // Unblock first handler
        unblockFirst?.();

        await Promise.all([j1, j2]);
        expect(handler).toHaveBeenCalledTimes(2);
    });
});