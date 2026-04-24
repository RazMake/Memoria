import { describe, expect, it } from "vitest";
import {
    createEmptyTaskIndex,
    generateTaskId,
    getCollectorOrder,
    getSourceDisplayPath,
    getTasksForSource,
    hydrateTaskIndex,
    makeSourceKey,
    pruneOrderReferences,
    removeTask,
    upsertTask,
} from "../../../../src/features/taskCollector/taskIndex";
import type { StoredTaskIndex, TaskIndexEntry } from "../../../../src/features/taskCollector/types";

describe("taskIndex", () => {
    describe("createEmptyTaskIndex", () => {
        it("should create an index with the given collector path and empty collections", () => {
            const index = createEmptyTaskIndex("00-Tasks/All-Tasks.md");

            expect(index.version).toBe(1);
            expect(index.collectorPath).toBe("00-Tasks/All-Tasks.md");
            expect(index.tasks).toEqual({});
            expect(index.collectorOrder).toEqual({ active: [], completed: [] });
            expect(index.sourceOrders).toEqual({});
        });
    });

    describe("hydrateTaskIndex", () => {
        it("should create a fresh index when stored data is null", () => {
            const index = hydrateTaskIndex(null, "00-Tasks/All-Tasks.md");

            expect(index.version).toBe(1);
            expect(index.collectorPath).toBe("00-Tasks/All-Tasks.md");
            expect(index.tasks).toEqual({});
        });

        it("should restore tasks from stored data and update the collector path", () => {
            const stored: StoredTaskIndex = {
                version: 1,
                collectorPath: "old/path.md",
                tasks: { a: makeEntry("a", "notes.md") },
                collectorOrder: { active: ["a"], completed: [] },
                sourceOrders: { "notes.md": ["a"] },
            };

            const index = hydrateTaskIndex(stored, "new/path.md");

            expect(index.collectorPath).toBe("new/path.md");
            expect(index.tasks.a).toBeDefined();
        });

        it("should fall back to an empty index when the stored version is unsupported", () => {
            const stored = {
                version: 99,
                collectorPath: "path.md",
                tasks: { a: makeEntry("a", "notes.md") },
                collectorOrder: { active: ["a"], completed: [] },
                sourceOrders: {},
            } as unknown as StoredTaskIndex;

            const index = hydrateTaskIndex(stored, "path.md");

            expect(index.tasks).toEqual({});
        });
    });

    describe("generateTaskId", () => {
        it("should produce an id with the mem- prefix and six hex characters", () => {
            const index = createEmptyTaskIndex("path.md");
            const id = generateTaskId(index);

            expect(id).toMatch(/^mem-[0-9a-f]{6}$/);
        });

        it("should not collide with existing task ids", () => {
            const index = createEmptyTaskIndex("path.md");
            const first = generateTaskId(index);
            index.tasks[first] = makeEntry(first, "notes.md");
            const second = generateTaskId(index);

            expect(second).not.toBe(first);
        });
    });

    describe("makeSourceKey", () => {
        it("should return the path when source root is null", () => {
            expect(makeSourceKey("notes.md")).toBe("notes.md");
        });

        it("should prefix the path with the source root when provided", () => {
            expect(makeSourceKey("notes.md", "rootA")).toBe("rootA:notes.md");
        });
    });

    describe("getSourceDisplayPath", () => {
        it("should return null when source is null", () => {
            expect(getSourceDisplayPath({ source: null, sourceRoot: null })).toBeNull();
        });

        it("should return the source path when there is no source root", () => {
            expect(getSourceDisplayPath({ source: "notes.md", sourceRoot: null })).toBe("notes.md");
        });

        it("should prefix with source root using a slash separator", () => {
            expect(getSourceDisplayPath({ source: "notes.md", sourceRoot: "rootA" })).toBe("rootA/notes.md");
        });
    });

    describe("upsertTask / removeTask", () => {
        it("should add a task entry to the index", () => {
            const index = createEmptyTaskIndex("path.md");
            const entry = makeEntry("a", "notes.md");

            upsertTask(index, entry);

            expect(index.tasks.a).toBe(entry);
        });

        it("should overwrite an existing entry with the same id", () => {
            const index = createEmptyTaskIndex("path.md");
            upsertTask(index, makeEntry("a", "notes.md"));
            const updated = makeEntry("a", "moved.md");

            upsertTask(index, updated);

            expect(index.tasks.a.source).toBe("moved.md");
        });

        it("should remove the task from tasks, collectorOrder, and sourceOrders", () => {
            const index = createEmptyTaskIndex("path.md");
            upsertTask(index, makeEntry("a", "notes.md"));
            index.collectorOrder.active = ["a"];
            index.sourceOrders["notes.md"] = ["a"];

            removeTask(index, "a");

            expect(index.tasks.a).toBeUndefined();
            expect(index.collectorOrder.active).toEqual([]);
            expect(index.sourceOrders["notes.md"]).toBeUndefined();
        });

        it("should keep other tasks in sourceOrders when removing one", () => {
            const index = createEmptyTaskIndex("path.md");
            upsertTask(index, makeEntry("a", "notes.md"));
            upsertTask(index, makeEntry("b", "notes.md"));
            index.sourceOrders["notes.md"] = ["a", "b"];

            removeTask(index, "a");

            expect(index.sourceOrders["notes.md"]).toEqual(["b"]);
        });
    });

    describe("getTasksForSource", () => {
        it("should return tasks in the order specified by sourceOrders", () => {
            const index = createEmptyTaskIndex("path.md");
            upsertTask(index, makeEntry("a", "notes.md"));
            upsertTask(index, makeEntry("b", "notes.md"));
            index.sourceOrders["notes.md"] = ["b", "a"];

            const tasks = getTasksForSource(index, "notes.md");

            expect(tasks.map((t) => t.id)).toEqual(["b", "a"]);
        });

        it("should append unordered tasks after the ordered ones", () => {
            const index = createEmptyTaskIndex("path.md");
            upsertTask(index, makeEntry("a", "notes.md"));
            upsertTask(index, makeEntry("b", "notes.md"));
            index.sourceOrders["notes.md"] = ["a"];

            const tasks = getTasksForSource(index, "notes.md");

            expect(tasks.map((t) => t.id)).toEqual(["a", "b"]);
        });

        it("should return an empty array when no tasks match the source", () => {
            const index = createEmptyTaskIndex("path.md");
            upsertTask(index, makeEntry("a", "other.md"));

            expect(getTasksForSource(index, "notes.md")).toEqual([]);
        });

        it("should scope results by source root", () => {
            const index = createEmptyTaskIndex("path.md");
            const entryA = makeEntry("a", "notes.md");
            entryA.sourceRoot = "rootA";
            const entryB = makeEntry("b", "notes.md");
            entryB.sourceRoot = "rootB";
            upsertTask(index, entryA);
            upsertTask(index, entryB);

            const tasks = getTasksForSource(index, "notes.md", "rootA");

            expect(tasks.map((t) => t.id)).toEqual(["a"]);
        });
    });

    describe("getCollectorOrder", () => {
        it("should return active tasks in the configured order", () => {
            const index = createEmptyTaskIndex("path.md");
            upsertTask(index, { ...makeEntry("a", "notes.md"), completed: false });
            upsertTask(index, { ...makeEntry("b", "notes.md"), completed: false });
            index.collectorOrder.active = ["b", "a"];

            expect(getCollectorOrder(index, false)).toEqual(["b", "a"]);
        });

        it("should return completed tasks in the configured order", () => {
            const index = createEmptyTaskIndex("path.md");
            upsertTask(index, { ...makeEntry("a", "notes.md"), completed: true, doneDate: "2026-04-14" });
            index.collectorOrder.completed = ["a"];

            expect(getCollectorOrder(index, true)).toEqual(["a"]);
        });

        it("should prepend tasks not listed in the configured order", () => {
            const index = createEmptyTaskIndex("path.md");
            upsertTask(index, { ...makeEntry("a", "notes.md"), completed: false });
            upsertTask(index, { ...makeEntry("b", "notes.md"), completed: false });
            index.collectorOrder.active = ["a"];

            const order = getCollectorOrder(index, false);

            expect(order).toEqual(["b", "a"]);
        });

        it("should exclude ids whose completion status does not match the requested section", () => {
            const index = createEmptyTaskIndex("path.md");
            upsertTask(index, { ...makeEntry("a", "notes.md"), completed: true, doneDate: "2026-04-14" });
            index.collectorOrder.active = ["a"];

            expect(getCollectorOrder(index, false)).toEqual([]);
        });
    });

    describe("pruneOrderReferences", () => {
        it("should remove stale ids from collectorOrder", () => {
            const index = createEmptyTaskIndex("path.md");
            index.collectorOrder.active = ["removed", "a"];
            upsertTask(index, { ...makeEntry("a", "notes.md"), completed: false });

            pruneOrderReferences(index);

            expect(index.collectorOrder.active).toEqual(["a"]);
        });

        it("should move completed tasks from active to completed list", () => {
            const index = createEmptyTaskIndex("path.md");
            upsertTask(index, { ...makeEntry("a", "notes.md"), completed: true, doneDate: "2026-04-14" });
            index.collectorOrder.active = ["a"];

            pruneOrderReferences(index);

            expect(index.collectorOrder.active).toEqual([]);
            expect(index.collectorOrder.completed).toEqual([]);
        });

        it("should remove stale ids from sourceOrders", () => {
            const index = createEmptyTaskIndex("path.md");
            index.sourceOrders["notes.md"] = ["removed"];

            pruneOrderReferences(index);

            expect(index.sourceOrders["notes.md"]).toBeUndefined();
        });

        it("should deduplicate ids in collectorOrder and sourceOrders", () => {
            const index = createEmptyTaskIndex("path.md");
            upsertTask(index, { ...makeEntry("a", "notes.md"), completed: false });
            index.collectorOrder.active = ["a", "a", "a"];
            index.sourceOrders["notes.md"] = ["a", "a"];

            pruneOrderReferences(index);

            expect(index.collectorOrder.active).toEqual(["a"]);
            expect(index.sourceOrders["notes.md"]).toEqual(["a"]);
        });
    });
});

function makeEntry(id: string, source: string): TaskIndexEntry {
    return {
        id,
        source,
        sourceRoot: null,
        sourceOrder: 0,
        fingerprint: `sha256:${id}`,
        body: `task ${id}`,
        firstSeenAt: "2026-04-16T00:00:00.000Z",
        completed: false,
        doneDate: null,
        collectorOwned: false,
    };
}
