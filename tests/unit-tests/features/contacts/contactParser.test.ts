import { describe, expect, it } from "vitest";
import {
    addContact,
    findDuplicateContactIds,
    parseCareerLevelsDocument,
    parseCareerPathsDocument,
    parseContactGroupDocument,
    parseInterviewTypesDocument,
    parsePronounsDocument,
    removeContactById,
    serializeCareerLevelsDocument,
    serializeCareerPathsDocument,
    serializeContactGroupDocument,
    serializeInterviewTypesDocument,
    serializePronounsDocument,
    upsertContact,
} from "../../../../src/features/contacts/contactParser";
import type {
    CareerLevelReference,
    CareerPathReference,
    ColleagueContact,
    ContactGroupDocument,
    InterviewTypeReference,
    PronounsReference,
    ReportContact,
} from "../../../../src/features/contacts/types";

describe("contactParser", () => {
    describe("parseContactGroupDocument", () => {
        it("should parse and serialize report records using the canonical field order", () => {
            const text = [
                "# alias1",
                "- Nickname: Alice",
                "- FullName: Alice Anderson",
                "- Title: Software Engineer 2",
                "- CareerPathKey: sde",
                "- LevelId: l3",
                "- LevelStartDate: 2025-06-01",
                "- PronounsKey: she/her",
            ].join("\n");

            const document = parseContactGroupDocument(text, "report");

            expect(document.contacts).toEqual<ReportContact[]>([
                {
                    kind: "report",
                    id: "alias1",
                    nickname: "Alice",
                    fullName: "Alice Anderson",
                    title: "Software Engineer 2",
                    careerPathKey: "sde",
                    levelId: "l3",
                    levelStartDate: "2025-06-01",
                    pronounsKey: "she/her",
                    extraFields: {},
                    droppedFields: {},
                },
            ]);
            expect(serializeContactGroupDocument(document)).toBe(text);
        });

        it("should preserve _droppedFields blocks when parsing and serializing colleague records", () => {
            const text = [
                "# alias1",
                "- Nickname: Alice",
                "- FullName: Alice Anderson",
                "- Title: Software Engineer 2",
                "- CareerPathKey: sde",
                "- PronounsKey: she/her",
                "- _droppedFields:",
                "  - LevelId: l3",
                "  - LevelStartDate: 2025-06-01",
            ].join("\n");

            const document = parseContactGroupDocument(text, "colleague");

            expect(document.contacts).toEqual<ColleagueContact[]>([
                {
                    kind: "colleague",
                    id: "alias1",
                    nickname: "Alice",
                    fullName: "Alice Anderson",
                    title: "Software Engineer 2",
                    careerPathKey: "sde",
                    pronounsKey: "she/her",
                    extraFields: {},
                    droppedFields: {
                        LevelId: "l3",
                        LevelStartDate: "2025-06-01",
                    },
                },
            ]);
            expect(serializeContactGroupDocument(document)).toBe(text);
        });

        it("should handle missing fields, extra whitespace, and unknown fields gracefully", () => {
            const text = [
                "  # alias2  ",
                "- Nickname:  Bea  ",
                "- Title: Staff Engineer",
                "- CareerPathKey: sde",
                "- PronounsKey: they/them",
                "- FavoriteColor: blue",
                "this line should be ignored",
            ].join("\n");

            const document = parseContactGroupDocument(text, "colleague");

            expect(document.contacts[0]).toEqual<ColleagueContact>({
                kind: "colleague",
                id: "alias2",
                nickname: "Bea",
                fullName: "",
                title: "Staff Engineer",
                careerPathKey: "sde",
                pronounsKey: "they/them",
                extraFields: {
                    FavoriteColor: "blue",
                },
                droppedFields: {},
            });
            expect(serializeContactGroupDocument(document)).toBe([
                "# alias2",
                "- Nickname: Bea",
                "- FullName: ",
                "- Title: Staff Engineer",
                "- CareerPathKey: sde",
                "- PronounsKey: they/them",
                "- FavoriteColor: blue",
            ].join("\n"));
        });

        it("should return an empty document for an empty contact file", () => {
            expect(parseContactGroupDocument("", "colleague")).toEqual<ContactGroupDocument>({
                kind: "colleague",
                contacts: [],
            });
        });
    });

    describe("contact group mutations", () => {
        it("should add, update, and remove contacts without mutating the original document", () => {
            const original = parseContactGroupDocument([
                "# alias1",
                "- Nickname: Alice",
                "- FullName: Alice Anderson",
                "- Title: Software Engineer 2",
                "- CareerPathKey: sde",
                "- PronounsKey: she/her",
            ].join("\n"), "colleague");

            const added = addContact(original, {
                kind: "colleague",
                id: "alias2",
                nickname: "Bob",
                fullName: "Bob Baker",
                title: "Program Manager",
                careerPathKey: "pm",
                pronounsKey: "he/him",
                extraFields: {},
                droppedFields: {},
            });
            const updated = upsertContact(added, {
                ...added.contacts[1],
                title: "Senior Program Manager",
            });
            const removed = removeContactById(updated, "alias1");

            expect(original.contacts).toHaveLength(1);
            expect(added.contacts.map((contact) => contact.id)).toEqual(["alias1", "alias2"]);
            expect(updated.contacts[1].title).toBe("Senior Program Manager");
            expect(removed.contacts.map((contact) => contact.id)).toEqual(["alias2"]);
        });

        it("should detect duplicate contact ids across group documents", () => {
            const team = parseContactGroupDocument([
                "# alias1",
                "- Nickname: Alice",
                "- FullName: Alice Anderson",
                "- Title: Software Engineer 2",
                "- CareerPathKey: sde",
                "- LevelId: l3",
                "- LevelStartDate: 2025-06-01",
                "- PronounsKey: she/her",
            ].join("\n"), "report");
            const colleagues = parseContactGroupDocument([
                "# alias1",
                "- Nickname: Alice",
                "- FullName: Alice Anderson",
                "- Title: Software Engineer 2",
                "- CareerPathKey: sde",
                "- PronounsKey: she/her",
            ].join("\n"), "colleague");

            expect(findDuplicateContactIds([team, colleagues])).toEqual(["alias1"]);
        });
    });

    describe("reference documents", () => {
        it("should parse and serialize pronouns, career levels, career paths, and interview types", () => {
            const pronounsText = [
                "# they/them",
                "- Subject: they",
                "- Object: them",
                "- PossessiveAdjective: their",
                "- Possessive: theirs",
                "- Reflexive: themselves",
            ].join("\n");
            const careerLevelsText = [
                "# l5",
                "- Id: 5",
                "- InterviewType: senior",
                "- TitlePattern: Senior {CareerPath}",
            ].join("\n");
            const careerPathsText = [
                "# sde",
                "- Name: Software Engineer",
                "- Short: SDE",
                "- MinimumCareerLevel: 0",
            ].join("\n");
            const interviewTypesText = [
                "# senior",
                "- Name: Senior",
            ].join("\n");

            expect(parsePronounsDocument(pronounsText)).toEqual<PronounsReference[]>([
                {
                    key: "they/them",
                    subject: "they",
                    object: "them",
                    possessiveAdjective: "their",
                    possessive: "theirs",
                    reflexive: "themselves",
                    extraFields: {},
                },
            ]);
            expect(parseCareerLevelsDocument(careerLevelsText)).toEqual<CareerLevelReference[]>([
                {
                    key: "l5",
                    id: 5,
                    interviewType: "senior",
                    titlePattern: "Senior {CareerPath}",
                    extraFields: {},
                },
            ]);
            expect(parseCareerPathsDocument(careerPathsText)).toEqual<CareerPathReference[]>([
                {
                    key: "sde",
                    name: "Software Engineer",
                    short: "SDE",
                    minimumCareerLevel: 0,
                    extraFields: {},
                },
            ]);
            expect(parseInterviewTypesDocument(interviewTypesText)).toEqual<InterviewTypeReference[]>([
                {
                    key: "senior",
                    name: "Senior",
                    extraFields: {},
                },
            ]);

            expect(serializePronounsDocument(parsePronounsDocument(pronounsText))).toBe(pronounsText);
            expect(serializeCareerLevelsDocument(parseCareerLevelsDocument(careerLevelsText))).toBe(careerLevelsText);
            expect(serializeCareerPathsDocument(parseCareerPathsDocument(careerPathsText))).toBe(careerPathsText);
            expect(serializeInterviewTypesDocument(parseInterviewTypesDocument(interviewTypesText))).toBe(interviewTypesText);
        });

        it("should return empty arrays for empty reference files", () => {
            expect(parsePronounsDocument("")).toEqual([]);
            expect(parseCareerLevelsDocument("")).toEqual([]);
            expect(parseCareerPathsDocument("")).toEqual([]);
            expect(parseInterviewTypesDocument("")).toEqual([]);
        });
    });
});