import { describe, expect, it } from "vitest";
import { renderCollector } from "../../../../src/features/taskCollector/collectorFormatter";
import { computeTaskFingerprint } from "../../../../src/features/taskCollector/taskAlignment";
import type { StoredTaskIndex } from "../../../../src/features/taskCollector/types";

describe("collectorFormatter", () => {
    it("should render active and completed sections using collector order", () => {
        const index: StoredTaskIndex = {
            version: 1,
            collectorPath: "00-Tasks/All-Tasks.md",
            collectorOrder: {
                active: ["b", "a"],
                completed: ["c"],
            },
            sourceOrders: {},
            tasks: {
                a: {
                    id: "a",
                    source: "docs/notes.md",
                    sourceRoot: null,
                    sourceOrder: 0,
                    body: "First task",
                    fingerprint: computeTaskFingerprint("First task"),
                    firstSeenAt: "2026-04-16T00:00:00.000Z",
                    completed: false,
                    doneDate: null,
                    collectorOwned: false,
                },
                b: {
                    id: "b",
                    source: null,
                    sourceRoot: null,
                    sourceOrder: null,
                    body: "Manual task",
                    fingerprint: computeTaskFingerprint("Manual task"),
                    firstSeenAt: "2026-04-15T00:00:00.000Z",
                    completed: false,
                    doneDate: null,
                    collectorOwned: true,
                },
                c: {
                    id: "c",
                    source: "docs/ship.md",
                    sourceRoot: null,
                    sourceOrder: 0,
                    body: "Shipped build",
                    fingerprint: computeTaskFingerprint("Shipped build"),
                    firstSeenAt: "2026-04-14T00:00:00.000Z",
                    completed: true,
                    doneDate: "2026-04-14",
                    collectorOwned: false,
                },
            },
        };

        const rendered = renderCollector(index);

        expect(rendered.content).toBe([
            "# To do",
            "",
            "- [ ] Manual task",
            "- [ ] First task",
            "",
            "# Completed",
            "",
            "- [x] Shipped build",
            "      _Source: docs/ship.md · Completed 2026-04-14_",
            "",
        ].join("\n"));
        expect(rendered.activeOrder).toEqual(index.collectorOrder.active);
        expect(rendered.completedOrder).toEqual(index.collectorOrder.completed);
    });

    it("should produce a single blank line between headings when both sections are empty", () => {
        const index: StoredTaskIndex = {
            version: 1,
            collectorPath: "00-Tasks/All-Tasks.md",
            collectorOrder: { active: [], completed: [] },
            sourceOrders: {},
            tasks: {},
        };

        const rendered = renderCollector(index);

        expect(rendered.content).toBe("# To do\n\n# Completed\n");
    });

    it("should rewrite source-relative paths when rendering collector bodies", () => {
        const index: StoredTaskIndex = {
            version: 1,
            collectorPath: "00-Tasks/All-Tasks.md",
            collectorOrder: { active: ["a"], completed: [] },
            sourceOrders: {},
            tasks: {
                a: {
                    id: "a",
                    source: "docs/deep/notes.md",
                    sourceRoot: null,
                    sourceOrder: 0,
                    body: "Review\n      ![arch](./img/arch.png)",
                    fingerprint: computeTaskFingerprint("Review\n      ![arch](./img/arch.png)"),
                    firstSeenAt: "2026-04-16T00:00:00.000Z",
                    completed: false,
                    doneDate: null,
                    collectorOwned: false,
                },
            },
        };

        const rendered = renderCollector(index);

        expect(rendered.content).toContain("      ![arch](../docs/deep/img/arch.png)");
    });
});