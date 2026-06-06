import { describe, it, expect } from "vitest";
import { nextOccurrence, mostRecentOccurrence } from "../../../../src/features/backup/backupScheduler";
import type { BackupSchedule } from "../../../../src/features/backup/types";

describe("nextOccurrence", () => {
    it("returns the same day when time has not yet passed", () => {
        const schedule: BackupSchedule = { time: "18:00", days: ["mon"] };
        // Monday 2026-06-01 08:00
        const from = new Date(2026, 5, 1, 8, 0, 0);
        const next = nextOccurrence(schedule, from);
        expect(next).not.toBeNull();
        expect(next!.getDate()).toBe(1);
        expect(next!.getHours()).toBe(18);
        expect(next!.getMinutes()).toBe(0);
    });

    it("advances to next matching day when today's time has passed", () => {
        const schedule: BackupSchedule = { time: "18:00", days: ["mon"] };
        // Monday 2026-06-01 20:00 — time has passed
        const from = new Date(2026, 5, 1, 20, 0, 0);
        const next = nextOccurrence(schedule, from);
        expect(next).not.toBeNull();
        // Should be the next Monday, 2026-06-08
        expect(next!.getDate()).toBe(8);
        expect(next!.getHours()).toBe(18);
    });

    it("wraps across week boundary to next matching day", () => {
        const schedule: BackupSchedule = { time: "09:00", days: ["sun"] };
        // Friday 2026-06-05 10:00
        const from = new Date(2026, 5, 5, 10, 0, 0); // Friday
        const next = nextOccurrence(schedule, from);
        expect(next).not.toBeNull();
        // Next Sunday 2026-06-07
        expect(next!.getDay()).toBe(0); // Sunday
        expect(next!.getDate()).toBe(7);
    });

    it("returns null when days array is empty", () => {
        const schedule: BackupSchedule = { time: "18:00", days: [] };
        const from = new Date(2026, 5, 1);
        const result = nextOccurrence(schedule, from);
        expect(result).toBeNull();
    });

    it("picks the soonest matching day from multiple days", () => {
        const schedule: BackupSchedule = { time: "12:00", days: ["wed", "fri"] };
        // Monday 2026-06-01 08:00
        const from = new Date(2026, 5, 1, 8, 0, 0); // Monday
        const next = nextOccurrence(schedule, from);
        expect(next).not.toBeNull();
        // Next match is Wednesday 2026-06-03
        expect(next!.getDay()).toBe(3); // Wednesday
        expect(next!.getDate()).toBe(3);
    });

    it("schedules for same day exact time plus one minute into the future", () => {
        const schedule: BackupSchedule = { time: "18:00", days: ["mon"] };
        // Monday 2026-06-01 17:59 — time has not passed yet
        const from = new Date(2026, 5, 1, 17, 59, 0);
        const next = nextOccurrence(schedule, from);
        expect(next).not.toBeNull();
        expect(next!.getDate()).toBe(1);
        expect(next!.getHours()).toBe(18);
    });

    it("does not trigger at exactly the same second", () => {
        const schedule: BackupSchedule = { time: "18:00", days: ["mon"] };
        // Monday 2026-06-01 exactly 18:00:00 — schedule should advance to next week
        const from = new Date(2026, 5, 1, 18, 0, 0);
        const next = nextOccurrence(schedule, from);
        expect(next).not.toBeNull();
        // Should be next Monday
        expect(next!.getDate()).toBe(8);
    });
});

describe("mostRecentOccurrence", () => {
    it("returns today if scheduled time has passed today", () => {
        const schedule: BackupSchedule = { time: "09:00", days: ["fri"] };
        // Friday 2026-06-05 20:00
        const now = new Date(2026, 5, 5, 20, 0, 0); // Friday
        const result = mostRecentOccurrence(schedule, now);
        expect(result).not.toBeNull();
        expect(result!.getDate()).toBe(5);
        expect(result!.getHours()).toBe(9);
    });

    it("returns the previous week when today is the right day but time hasn't passed", () => {
        const schedule: BackupSchedule = { time: "18:00", days: ["fri"] };
        // Friday 2026-06-05 08:00 — today's run hasn't happened yet
        const now = new Date(2026, 5, 5, 8, 0, 0); // Friday morning
        const result = mostRecentOccurrence(schedule, now);
        expect(result).not.toBeNull();
        // Should be last Friday 2026-05-29
        expect(result!.getDate()).toBe(29);
    });

    it("returns null when days array is empty", () => {
        const schedule: BackupSchedule = { time: "18:00", days: [] };
        const now = new Date(2026, 5, 5);
        expect(mostRecentOccurrence(schedule, now)).toBeNull();
    });
});
