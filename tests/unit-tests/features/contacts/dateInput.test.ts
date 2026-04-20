import { describe, expect, it } from "vitest";
import { formatIsoDateForDisplay, moveDateSelectionByTab, parseDisplayDateToIso, sanitizeDateDisplayInput } from "../../../../src/features/contacts/webview/dateInput";

describe("dateInput helpers", () => {
    it("formats ISO dates for display", () => {
        expect(formatIsoDateForDisplay("2026-04-19")).toBe("04/19/2026");
    });

    it("leaves non-ISO values unchanged", () => {
        expect(formatIsoDateForDisplay("04/19/2026")).toBe("04/19/2026");
    });

    it("parses display dates to ISO", () => {
        expect(parseDisplayDateToIso("4/9/2026")).toBe("2026-04-09");
        expect(parseDisplayDateToIso("04/19/2026")).toBe("2026-04-19");
    });

    it("rejects invalid display dates", () => {
        expect(parseDisplayDateToIso("13/19/2026")).toBeNull();
        expect(parseDisplayDateToIso("02/30/2026")).toBeNull();
        expect(parseDisplayDateToIso("04/19/26")).toBeNull();
    });

    it("sanitizes text input to digits and section separators", () => {
        expect(sanitizeDateDisplayInput("04/19/2026")).toBe("04/19/2026");
        expect(sanitizeDateDisplayInput("4/9/2026abc")).toBe("4/9/2026");
        expect(sanitizeDateDisplayInput("123/45/67890")).toBe("12/3/4567");
        expect(sanitizeDateDisplayInput("//04//19//2026")).toBe("04/19/2026");
        expect(sanitizeDateDisplayInput("04192026")).toBe("04/19/2026");
        expect(sanitizeDateDisplayInput("04")).toBe("04/");
        expect(sanitizeDateDisplayInput("0419")).toBe("04/19/");
    });

    it("moves tab focus from month to day and inserts the first separator when needed", () => {
        expect(moveDateSelectionByTab("04", 1, 1)).toEqual({
            value: "04/",
            selectionStart: 3,
            selectionEnd: 3,
        });
    });

    it("moves tab focus from day to year and inserts the second separator when needed", () => {
        expect(moveDateSelectionByTab("04/9", 4, 1)).toEqual({
            value: "04/9/",
            selectionStart: 5,
            selectionEnd: 5,
        });
    });

    it("lets tab leave the field from the year section", () => {
        expect(moveDateSelectionByTab("04/19/2026", 8, 1)).toBeNull();
    });

    it("moves shift-tab backward between sections", () => {
        expect(moveDateSelectionByTab("04/19/2026", 7, -1)).toEqual({
            value: "04/19/2026",
            selectionStart: 3,
            selectionEnd: 5,
        });
    });

    it("skips indistinguishable empty sections when tabbing", () => {
        expect(moveDateSelectionByTab("04/", 3, 1)).toEqual({
            value: "04/",
            selectionStart: 0,
            selectionEnd: 2,
        });
    });

    it("lets shift-tab leave the field from the month section", () => {
        expect(moveDateSelectionByTab("04/19/2026", 1, -1)).toBeNull();
    });
});