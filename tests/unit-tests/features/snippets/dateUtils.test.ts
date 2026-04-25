import { describe, it, expect } from "vitest";
import {
    elapsedSince,
    formatElapsed,
    formatDate,
    formatTime,
    formatISODate,
    ageInDays,
    formatDueIn,
    formatDueBy,
} from "../../../../src/features/snippets/dateUtils";

describe("elapsedSince", () => {
    it("should return zero for same month", () => {
        const result = elapsedSince("2025-03-15", new Date("2025-03-20"));
        expect(result).toEqual({ years: 0, months: 0, totalMonths: 0 });
    });

    it("should count months within same year", () => {
        const result = elapsedSince("2025-01-01", new Date("2025-07-01"));
        expect(result).toEqual({ years: 0, months: 6, totalMonths: 6 });
    });

    it("should count full years", () => {
        const result = elapsedSince("2023-04-10", new Date("2025-04-10"));
        expect(result).toEqual({ years: 2, months: 0, totalMonths: 24 });
    });

    it("should split years and months", () => {
        const result = elapsedSince("2024-01-15", new Date("2026-04-22"));
        expect(result).toEqual({ years: 2, months: 3, totalMonths: 27 });
    });

    it("should handle exactly 12 months as 1 year", () => {
        const result = elapsedSince("2024-04-01", new Date("2025-04-01"));
        expect(result).toEqual({ years: 1, months: 0, totalMonths: 12 });
    });

    it("should default to current date when now is omitted", () => {
        const result = elapsedSince("2020-01-01");
        expect(result.totalMonths).toBeGreaterThan(0);
    });
});

describe("formatElapsed", () => {
    it("should format zero months", () => {
        expect(formatElapsed({ years: 0, months: 0, totalMonths: 0 })).toBe("0 months");
    });

    it("should format months only (singular)", () => {
        expect(formatElapsed({ years: 0, months: 1, totalMonths: 1 })).toBe("1 month");
    });

    it("should format months only (plural)", () => {
        expect(formatElapsed({ years: 0, months: 5, totalMonths: 5 })).toBe("5 months");
    });

    it("should format years only (singular)", () => {
        expect(formatElapsed({ years: 1, months: 0, totalMonths: 12 })).toBe("1 year");
    });

    it("should format years only (plural)", () => {
        expect(formatElapsed({ years: 3, months: 0, totalMonths: 36 })).toBe("3 years");
    });

    it("should format years and months combined", () => {
        expect(formatElapsed({ years: 2, months: 3, totalMonths: 27 })).toBe("2 years, 3 months");
    });

    it("should format 1 year 1 month singular", () => {
        expect(formatElapsed({ years: 1, months: 1, totalMonths: 13 })).toBe("1 year, 1 month");
    });
});

describe("formatDate", () => {
    const date = new Date(2026, 3, 22, 14, 5, 9); // April 22, 2026 (Wednesday)

    it("should format YYYY-MM-dd", () => {
        expect(formatDate(date, "YYYY-MM-dd")).toBe("2026-04-22");
    });

    it("should format MM/dd/YYYY", () => {
        expect(formatDate(date, "MM/dd/YYYY")).toBe("04/22/2026");
    });

    it("should format dddd, MMM dd, YYYY", () => {
        expect(formatDate(date, "dddd, MMM dd, YYYY")).toBe("Wednesday, April 22, 2026");
    });

    it("should default to YYYY-MM-dd for unknown format", () => {
        expect(formatDate(date, "unknown")).toBe("2026-04-22");
    });

    it("should pad single-digit months and days", () => {
        const jan = new Date(2026, 0, 5);
        expect(formatDate(jan, "YYYY-MM-dd")).toBe("2026-01-05");
    });
});

describe("formatTime", () => {
    it("should format HH:mm (24-hour, no seconds)", () => {
        const date = new Date(2026, 0, 1, 14, 5, 9);
        expect(formatTime(date, "HH:mm")).toBe("14:05");
    });

    it("should format HH:mm:ss (24-hour with seconds)", () => {
        const date = new Date(2026, 0, 1, 14, 5, 9);
        expect(formatTime(date, "HH:mm:ss")).toBe("14:05:09");
    });

    it("should format hh:mm AM/PM (12-hour) for PM", () => {
        const date = new Date(2026, 0, 1, 14, 5, 9);
        expect(formatTime(date, "hh:mm AM/PM")).toBe("02:05 PM");
    });

    it("should format hh:mm AM/PM (12-hour) for AM", () => {
        const date = new Date(2026, 0, 1, 9, 30, 0);
        expect(formatTime(date, "hh:mm AM/PM")).toBe("09:30 AM");
    });

    it("should handle midnight as 12 in 12-hour format", () => {
        const date = new Date(2026, 0, 1, 0, 0, 0);
        expect(formatTime(date, "hh:mm AM/PM")).toBe("12:00 AM");
    });

    it("should format hh:mm:ss AM/PM (12-hour with seconds)", () => {
        const date = new Date(2026, 0, 1, 14, 5, 9);
        expect(formatTime(date, "hh:mm:ss AM/PM")).toBe("02:05:09 PM");
    });

    it("should default to HH:mm for unknown format", () => {
        const date = new Date(2026, 0, 1, 14, 5, 9);
        expect(formatTime(date, "unknown")).toBe("14:05");
    });
});

describe("formatISODate", () => {
    it("should return an ISO date string in YYYY-MM-DD format", () => {
        expect(formatISODate(new Date("2026-04-16T15:30:00.000Z"))).toBe("2026-04-16");
    });

    it("should use UTC date regardless of time component", () => {
        expect(formatISODate(new Date("2026-04-16T23:59:59.999Z"))).toBe("2026-04-16");
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

describe("formatDueIn", () => {
    // Wednesday, April 22, 2026
    const now = new Date(2026, 3, 22);

    it("should format 1 day", () => {
        expect(formatDueIn(1, now)).toBe("in 1 day (by Thursday, April 23, 2026)");
    });

    it("should format 3 days", () => {
        expect(formatDueIn(3, now)).toBe("in 3 days (by Saturday, April 25, 2026)");
    });

    it("should format 7 days as 1 week", () => {
        expect(formatDueIn(7, now)).toBe("in 1 week (by Wednesday, April 29, 2026)");
    });

    it("should format 14 days as 2 weeks", () => {
        expect(formatDueIn(14, now)).toBe("in 2 weeks (by Wednesday, May 06, 2026)");
    });

    it("should format 10 days as 1 week and 3 days", () => {
        expect(formatDueIn(10, now)).toBe("in 1 week and 3 days (by Saturday, May 02, 2026)");
    });

    it("should format 21 days as 3 weeks", () => {
        expect(formatDueIn(21, now)).toBe("in 3 weeks (by Wednesday, May 13, 2026)");
    });

    it("should format 15 days as 2 weeks and 1 day", () => {
        expect(formatDueIn(15, now)).toBe("in 2 weeks and 1 day (by Thursday, May 07, 2026)");
    });
});

describe("formatDueBy", () => {
    // Wednesday, April 22, 2026
    const now = new Date(2026, 3, 22);

    it("should format 1 day", () => {
        expect(formatDueBy(1, now)).toBe("by Thursday, April 23, 2026");
    });

    it("should format 7 days", () => {
        expect(formatDueBy(7, now)).toBe("by Wednesday, April 29, 2026");
    });

    it("should format 21 days", () => {
        expect(formatDueBy(21, now)).toBe("by Wednesday, May 13, 2026");
    });
});
