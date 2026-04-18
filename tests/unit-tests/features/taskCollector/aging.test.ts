import { describe, expect, it } from "vitest";
import { ageInDays, formatDate, isTaskExpired } from "../../../../src/features/taskCollector/aging";
import type { TaskIndexEntry } from "../../../../src/features/taskCollector/types";

describe("aging", () => {
    describe("formatDate", () => {
        it("should return an ISO date string in YYYY-MM-DD format", () => {
            expect(formatDate(new Date("2026-04-16T15:30:00.000Z"))).toBe("2026-04-16");
        });

        it("should use UTC date regardless of time component", () => {
            expect(formatDate(new Date("2026-04-16T23:59:59.999Z"))).toBe("2026-04-16");
        });
    });

    describe("ageInDays", () => {
        it("should return the number of days between the done date and now", () => {
            expect(ageInDays("2026-04-10", new Date("2026-04-17T12:00:00.000Z"))).toBe(7);
        });

        it("should return zero when done date equals the current date", () => {
            expect(ageInDays("2026-04-17", new Date("2026-04-17T23:59:59.999Z"))).toBe(0);
        });

        it("should return zero when the done date string is invalid", () => {
            expect(ageInDays("not-a-date", new Date("2026-04-17T00:00:00.000Z"))).toBe(0);
        });

        it("should return a positive value when done date is in the past", () => {
            expect(ageInDays("2026-04-01", new Date("2026-04-17T00:00:00.000Z"))).toBe(16);
        });
    });

    describe("isTaskExpired", () => {
        it("should return true when the completed task exceeds the retention period", () => {
            const entry = makeEntry({ completed: true, doneDate: "2026-04-01" });
            expect(isTaskExpired(entry, 7, new Date("2026-04-17T00:00:00.000Z"))).toBe(true);
        });

        it("should return false when the completed task is within the retention period", () => {
            const entry = makeEntry({ completed: true, doneDate: "2026-04-15" });
            expect(isTaskExpired(entry, 7, new Date("2026-04-17T00:00:00.000Z"))).toBe(false);
        });

        it("should return false when the task is not completed", () => {
            const entry = makeEntry({ completed: false, doneDate: null });
            expect(isTaskExpired(entry, 7, new Date("2026-04-17T00:00:00.000Z"))).toBe(false);
        });

        it("should return false when the completed task has no done date", () => {
            const entry = makeEntry({ completed: true, doneDate: null });
            expect(isTaskExpired(entry, 7, new Date("2026-04-17T00:00:00.000Z"))).toBe(false);
        });

        it("should return false when the age exactly equals the retention period", () => {
            const entry = makeEntry({ completed: true, doneDate: "2026-04-10" });
            expect(isTaskExpired(entry, 7, new Date("2026-04-17T00:00:00.000Z"))).toBe(false);
        });
    });
});

function makeEntry(overrides: Partial<TaskIndexEntry>): TaskIndexEntry {
    return {
        id: "mem-aaaaaa",
        source: "notes.md",
        sourceRoot: null,
        sourceOrder: 0,
        fingerprint: "sha256:test",
        body: "Test task",
        firstSeenAt: "2026-04-01T00:00:00.000Z",
        completed: false,
        doneDate: null,
        collectorOwned: false,
        ...overrides,
    };
}
