import type { SyncJob } from "./types";

interface DeferredJob {
    resolve: () => void;
    reject: (error: unknown) => void;
}

interface QueuedJob {
    key: string;
    job: SyncJob;
    deferreds: DeferredJob[];
}

interface TimerLike {
    setTimeout(handler: () => void, delay: number): ReturnType<typeof setTimeout>;
    clearTimeout(handle: ReturnType<typeof setTimeout>): void;
}

export class SyncQueue {
    private readonly queue: QueuedJob[] = [];
    private readonly pending = new Map<string, { handle: ReturnType<typeof setTimeout>; jobs: DeferredJob[]; job: SyncJob }>();
    private readonly queuedKeys = new Set<string>();
    private idleResolvers: Array<() => void> = [];
    private processing = false;
    private disposed = false;

    constructor(
        private readonly handler: (job: SyncJob) => Promise<void>,
        private readonly debounceMs: number,
        private readonly timers: TimerLike = {
            setTimeout: (callback, delay) => setTimeout(callback, delay),
            clearTimeout: (handle) => clearTimeout(handle),
        },
    ) {}

    enqueue(job: SyncJob): Promise<void> {
        if (this.disposed) {
            return Promise.reject(new Error("SyncQueue has been disposed."));
        }

        return new Promise<void>((resolve, reject) => {
            const deferred: DeferredJob = { resolve, reject };
            const key = jobKey(job);
            const shouldDebounce = job.kind !== "full";

            if (!shouldDebounce) {
                this.pushQueuedJob(key, job, [deferred]);
                return;
            }

            const existing = this.pending.get(key);
            if (existing) {
                this.timers.clearTimeout(existing.handle);
                existing.jobs.push(deferred);
                existing.job = job;
                existing.handle = this.timers.setTimeout(() => this.flushPending(key), this.debounceMs);
                return;
            }

            this.pending.set(key, {
                handle: this.timers.setTimeout(() => this.flushPending(key), this.debounceMs),
                jobs: [deferred],
                job,
            });
        });
    }

    async drain(): Promise<void> {
        if (this.pending.size === 0 && this.queue.length === 0 && !this.processing) {
            return;
        }

        await new Promise<void>((resolve) => {
            this.idleResolvers.push(resolve);
        });
    }

    dispose(): void {
        this.disposed = true;

        for (const { handle, jobs } of this.pending.values()) {
            this.timers.clearTimeout(handle);
            for (const deferred of jobs) {
                deferred.reject(new Error("SyncQueue has been disposed."));
            }
        }

        this.pending.clear();
        this.queuedKeys.clear();

        while (this.queue.length > 0) {
            const queued = this.queue.shift()!;
            for (const deferred of queued.deferreds) {
                deferred.reject(new Error("SyncQueue has been disposed."));
            }
        }

        this.resolveIdleIfNeeded();
    }

    private flushPending(key: string): void {
        const pending = this.pending.get(key);
        if (!pending) {
            return;
        }

        this.pending.delete(key);
        this.pushQueuedJob(key, pending.job, pending.jobs);
    }

    private pushQueuedJob(key: string, job: SyncJob, deferreds: DeferredJob[]): void {
        const existing = this.queue.find((entry) => entry.key === key);
        if (existing) {
            existing.job = job;
            existing.deferreds.push(...deferreds);
            void this.processQueue();
            return;
        }

        if (!this.queuedKeys.has(key)) {
            this.queuedKeys.add(key);
        }
        this.queue.push({ key, job, deferreds: [...deferreds] });
        void this.processQueue();
    }

    private async processQueue(): Promise<void> {
        if (this.processing || this.disposed) {
            return;
        }

        this.processing = true;
        try {
            while (this.queue.length > 0 && !this.disposed) {
                const queued = this.queue.shift()!;
                try {
                    await this.handler(queued.job);
                    for (const deferred of queued.deferreds) {
                        deferred.resolve();
                    }
                } catch (error) {
                    for (const deferred of queued.deferreds) {
                        deferred.reject(error);
                    }
                } finally {
                    if (!this.queue.some((entry) => entry.key === queued.key)) {
                        this.queuedKeys.delete(queued.key);
                    }
                }
            }
        } finally {
            this.processing = false;
            this.resolveIdleIfNeeded();
        }
    }

    private resolveIdleIfNeeded(): void {
        if (this.pending.size > 0 || this.queue.length > 0 || this.processing) {
            return;
        }

        const resolvers = this.idleResolvers;
        this.idleResolvers = [];
        for (const resolve of resolvers) {
            resolve();
        }
    }
}

function jobKey(job: SyncJob): string {
    switch (job.kind) {
        case "source":
            return `source:${job.uri}`;
        case "collector":
            return `collector:${job.renderOnly ? "render" : "edit"}`;
        case "full":
            return "full";
    }
}