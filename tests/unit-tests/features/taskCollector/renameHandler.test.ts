import { describe, expect, it } from "vitest";
import { applySourceRenames } from "../../../../src/features/taskCollector/renameHandler";
import { computeTaskFingerprint } from "../../../../src/features/taskCollector/taskAlignment";
import type { StoredTaskIndex, TaskIndexEntry } from "../../../../src/features/taskCollector/types";

describe("renameHandler", () => {
    describe("applySourceRenames", () => {
        it("should return false when the rename list is empty", () => {
            const index = makeIndex([makeEntry("a", "notes.md")]);
            expect(applySourceRenames(index, [])).toBe(false);
        });

        it("should update the source path and sourceOrders key for renamed files", () => {
            const index = makeIndex([makeEntry("a", "notes.md")]);
            index.sourceOrders["notes.md"] = ["a"];

            const changed = applySourceRenames(index, [{
                oldSource: "notes.md",
                oldSourceRoot: null,
                newSource: "renamed.md",
                newSourceRoot: null,
            }]);

            expect(changed).toBe(true);
            expect(index.tasks.a.source).toBe("renamed.md");
            expect(index.sourceOrders["renamed.md"]).toEqual(["a"]);
            expect(index.sourceOrders["notes.md"]).toBeUndefined();
        });

        it("should update multiple tasks that share the same source file", () => {
            const index = makeIndex([
                makeEntry("a", "notes.md"),
                makeEntry("b", "notes.md"),
            ]);

            applySourceRenames(index, [{
                oldSource: "notes.md",
                oldSourceRoot: null,
                newSource: "renamed.md",
                newSourceRoot: null,
            }]);

            expect(index.tasks.a.source).toBe("renamed.md");
            expect(index.tasks.b.source).toBe("renamed.md");
        });

        it("should leave tasks from other files unchanged", () => {
            const index = makeIndex([
                makeEntry("a", "notes.md"),
                makeEntry("b", "other.md"),
            ]);

            applySourceRenames(index, [{
                oldSource: "notes.md",
                oldSourceRoot: null,
                newSource: "renamed.md",
                newSourceRoot: null,
            }]);

            expect(index.tasks.b.source).toBe("other.md");
        });

        it("should handle renames with source roots", () => {
            const entry = makeEntry("a", "notes.md");
            entry.sourceRoot = "rootA";
            const index = makeIndex([entry]);
            index.sourceOrders["rootA:notes.md"] = ["a"];

            applySourceRenames(index, [{
                oldSource: "notes.md",
                oldSourceRoot: "rootA",
                newSource: "moved.md",
                newSourceRoot: "rootA",
            }]);

            expect(index.tasks.a.source).toBe("moved.md");
            expect(index.sourceOrders["rootA:moved.md"]).toEqual(["a"]);
            expect(index.sourceOrders["rootA:notes.md"]).toBeUndefined();
        });

        it("should apply multiple renames in sequence", () => {
            const index = makeIndex([
                makeEntry("a", "a.md"),
                makeEntry("b", "b.md"),
            ]);
            index.sourceOrders["a.md"] = ["a"];
            index.sourceOrders["b.md"] = ["b"];

            applySourceRenames(index, [
                { oldSource: "a.md", oldSourceRoot: null, newSource: "x.md", newSourceRoot: null },
                { oldSource: "b.md", oldSourceRoot: null, newSource: "y.md", newSourceRoot: null },
            ]);

            expect(index.tasks.a.source).toBe("x.md");
            expect(index.tasks.b.source).toBe("y.md");
            expect(index.sourceOrders["x.md"]).toEqual(["a"]);
            expect(index.sourceOrders["y.md"]).toEqual(["b"]);
        });
    });
});

function makeEntry(id: string, source: string): TaskIndexEntry {
    return {
        id,
        source,
        sourceRoot: null,
        sourceOrder: 0,
        fingerprint: computeTaskFingerprint(`task ${id}`),
        body: `task ${id}`,
        firstSeenAt: "2026-04-16T00:00:00.000Z",
        completed: false,
        doneDate: null,
        collectorOwned: false,
    };
}

function makeIndex(entries: TaskIndexEntry[]): StoredTaskIndex {
    const tasks: Record<string, TaskIndexEntry> = {};
    for (const entry of entries) {
        tasks[entry.id] = entry;
    }
    return {
        version: 1,
        collectorPath: "00-Tasks/All-Tasks.md",
        collectorOrder: { active: [], completed: [] },
        sourceOrders: {},
        tasks,
    };
}
