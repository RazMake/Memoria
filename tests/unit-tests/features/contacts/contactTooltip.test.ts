import { describe, it, expect } from "vitest";
import type { ResolvedContact } from "../../../../src/features/contacts/contactUtils";
import { buildContactTooltipMarkdown } from "../../../../src/features/contacts/contactTooltip";

function makeContact(overrides: Partial<ResolvedContact> = {}): ResolvedContact {
    return {
        kind: "report",
        id: "johnsmith",
        nickname: "John",
        fullName: "John Smith",
        title: "Software Engineer",
        careerPathKey: "sde",
        pronounsKey: "he",
        extraFields: {},
        droppedFields: {},
        levelId: "l2",
        levelStartDate: "2025-07-20",
        groupFile: "Reports.md",
        groupName: "Reports",
        groupType: "report",
        isCustomGroup: false,
        shortTitle: "SDE 2",
        resolvedPronouns: { key: "he", subject: "he", object: "him", possessiveAdjective: "his", possessive: "his", reflexive: "himself", extraFields: {} },
        resolvedCareerPath: { key: "sde", name: "Software Development Engineer", short: "SDE", minimumCareerLevel: 1, extraFields: {} },
        resolvedCareerLevel: { key: "l2", id: 2, interviewType: "coding", titlePattern: "SDE {level}", extraFields: {} },
        resolvedInterviewType: { key: "coding", name: "Coding Interview", extraFields: {} },
        ...overrides,
    } as ResolvedContact;
}

describe("buildContactTooltipMarkdown", () => {
    it("includes id, fullName, title, career path, and group in brief mode", () => {
        const contact = makeContact();
        const md = buildContactTooltipMarkdown(contact, false);

        expect(md).toContain("**Id**: johnsmith");
        expect(md).toContain("### John Smith");
        expect(md).toContain("**Title**: Software Engineer");
        expect(md).toContain("Career Path: SDE");
        expect(md).toContain("Group: _Reports_");
    });

    it("does not include level details in brief mode for report contacts", () => {
        const contact = makeContact();
        const md = buildContactTooltipMarkdown(contact, false);

        expect(md).not.toContain("Level:");
        expect(md).not.toContain("Level Start:");
        expect(md).not.toContain("Time in level:");
    });

    it("includes level details in detailed mode for report contacts", () => {
        const contact = makeContact();
        const md = buildContactTooltipMarkdown(contact, true);

        expect(md).toContain("Level: _**L2**_");
        expect(md).toContain("Level Start: _**2025-07-20**_");
        expect(md).toContain("Time in level:");
    });

    it("does not include level details in detailed mode for colleague contacts", () => {
        const contact = makeContact({ kind: "colleague" });
        const md = buildContactTooltipMarkdown(contact, true);

        expect(md).not.toContain("Level:");
        expect(md).not.toContain("Level Start:");
    });

    it("shows Unknown when resolvedCareerLevel is null", () => {
        const contact = makeContact({ resolvedCareerLevel: null });
        const md = buildContactTooltipMarkdown(contact, true);

        expect(md).toContain("Level: _**Unknown**_");
    });
});
