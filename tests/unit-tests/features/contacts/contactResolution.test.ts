import { describe, it, expect } from "vitest";
import {
    buildResolvedContact,
    buildResolvedReferenceData,
    buildShortTitleLookup,
    type ContactGroupInfo,
} from "../../../../src/features/contacts/contactResolution";
import type { ContactsReferenceData } from "../../../../src/features/contacts/types";

const emptyRef: ContactsReferenceData = {
    pronouns: [
        {
            key: "she/her",
            subject: "she",
            object: "her",
            possessiveAdjective: "her",
            possessive: "hers",
            reflexive: "herself",
            extraFields: {},
        },
    ],
    careerLevels: [],
    careerPaths: [
        {
            key: "SWE",
            name: "Software Engineering",
            short: "SWE",
            minimumCareerLevel: 1,
            extraFields: {},
        },
    ],
    interviewTypes: [],
};

const emptyRefNoData: ContactsReferenceData = {
    pronouns: [],
    careerLevels: [],
    careerPaths: [],
    interviewTypes: [],
};

const groupInfo: ContactGroupInfo = {
    file: "Team.md",
    name: "Team",
    type: "report",
    isCustom: false,
};

describe("contactResolution", () => {
    describe("buildResolvedContact", () => {
        it("builds a resolved colleague contact", () => {
            const contact = {
                kind: "colleague" as const,
                id: "alice",
                nickname: "Alice",
                fullName: "Alice Smith",
                title: "Engineer",
                careerPathKey: "SWE",
                pronounsKey: "she/her",
                extraFields: { CustomField: "custom" },
                droppedFields: {},
            };

            const shortTitleLookup = new Map<string, string>();
            const group: ContactGroupInfo = { ...groupInfo, type: "colleague" };

            const resolved = buildResolvedContact(contact, group, emptyRef, shortTitleLookup);

            expect(resolved.id).toBe("alice");
            expect(resolved.fullName).toBe("Alice Smith");
            expect(resolved.groupName).toBe("Team");
            expect(resolved.groupFile).toBe("Team.md");
            expect(resolved.resolvedPronouns.subject).toBe("she");
            expect(resolved.resolvedCareerLevel).toBeNull();
            expect(resolved.resolvedInterviewType).toBeNull();
        });

        it("builds a resolved report contact", () => {
            const contact = {
                kind: "report" as const,
                id: "bob",
                nickname: "Bob",
                fullName: "Bob Jones",
                title: "Senior Engineer",
                careerPathKey: "SWE",
                pronounsKey: "unknown",
                levelId: "L5",
                levelStartDate: "2024-01-01",
                employeeId: "12345",
                bandRank: "senior",
                overallRank: "5",
                extraFields: {},
                droppedFields: {},
            };

            const shortTitleLookup = new Map<string, string>([["Senior Engineer", "Sr Eng"]]);
            const resolved = buildResolvedContact(contact, groupInfo, emptyRef, shortTitleLookup);

            expect(resolved.id).toBe("bob");
            expect(resolved.shortTitle).toBe("Sr Eng");
            expect(resolved.groupType).toBe("report");
            expect(resolved.isCustomGroup).toBe(false);
        });

        it("uses contact title as shortTitle when no lookup match", () => {
            const contact = {
                kind: "colleague" as const,
                id: "carol",
                nickname: "Carol",
                fullName: "Carol White",
                title: "Manager",
                careerPathKey: "MGR",
                pronounsKey: "unknown",
                extraFields: {},
                droppedFields: {},
            };

            const shortTitleLookup = new Map<string, string>();
            const group: ContactGroupInfo = { ...groupInfo, type: "colleague" };
            const resolved = buildResolvedContact(contact, group, emptyRefNoData, shortTitleLookup);

            expect(resolved.shortTitle).toBe("Manager");
        });
    });

    describe("buildResolvedReferenceData", () => {
        it("builds resolved reference data", () => {
            const result = buildResolvedReferenceData(emptyRef);
            expect(result.pronouns).toHaveLength(1);
            expect(result.careerPaths).toHaveLength(1);
            expect(result.careerLevels).toHaveLength(0);
        });

        it("returns empty arrays for empty reference data", () => {
            const result = buildResolvedReferenceData(emptyRefNoData);
            expect(result.pronouns).toHaveLength(0);
            expect(result.careerPaths).toHaveLength(0);
            expect(result.careerLevels).toHaveLength(0);
            // canonicalTitles may include built-in defaults even with empty input
            expect(Array.isArray(result.canonicalTitles)).toBe(true);
        });
    });

    describe("buildShortTitleLookup", () => {
        it("returns a Map for empty reference data", () => {
            const map = buildShortTitleLookup(emptyRefNoData);
            expect(map instanceof Map).toBe(true);
        });

        it("returns a map for reference data with career paths/levels", () => {
            const map = buildShortTitleLookup(emptyRef);
            // With no careerLevels, the result is empty
            expect(map instanceof Map).toBe(true);
        });
    });
});
