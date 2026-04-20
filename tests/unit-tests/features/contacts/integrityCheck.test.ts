import { describe, expect, it } from "vitest";
import {
    applyCareerLevelIntegrityCorrections,
    applyContactIntegrityCorrections,
    findCareerLevelIntegrityCorrections,
    findContactIntegrityCorrections,
} from "../../../../src/features/contacts/integrityCheck";
import { UNKNOWN_REFERENCE_KEY } from "../../../../src/features/contacts/referenceDefaults";
import type {
    CareerLevelReference,
    ContactGroupDocument,
    ContactsReferenceData,
} from "../../../../src/features/contacts/types";

function makeReferenceData(): ContactsReferenceData {
    return {
        pronouns: [
            {
                key: "they/them",
                subject: "they",
                object: "them",
                possessiveAdjective: "their",
                possessive: "theirs",
                reflexive: "themselves",
                extraFields: {},
            },
        ],
        careerPaths: [
            {
                key: "sde",
                name: "Software Engineer",
                short: "SDE",
                minimumCareerLevel: 0,
                extraFields: {},
            },
        ],
        careerLevels: [
            {
                key: "l3",
                id: 3,
                interviewType: "junior",
                titlePattern: "{CareerPath} 2",
                extraFields: {},
            },
        ],
        interviewTypes: [
            {
                key: "junior",
                name: "Junior",
                extraFields: {},
            },
        ],
    };
}

describe("integrityCheck", () => {
    it("should return no contact corrections when all references are valid", () => {
        const document: ContactGroupDocument = {
            kind: "report",
            contacts: [
                {
                    kind: "report",
                    id: "alias1",
                    nickname: "Alice",
                    fullName: "Alice Anderson",
                    title: "Software Engineer 2",
                    careerPathKey: "sde",
                    levelId: "l3",
                    levelStartDate: "2025-06-01",
                    pronounsKey: "they/them",
                    extraFields: {},
                    droppedFields: {},
                },
            ],
        };

        expect(findContactIntegrityCorrections(document, makeReferenceData())).toEqual([]);
    });

    it("should return corrections for missing contact references and apply them to the document", () => {
        const document: ContactGroupDocument = {
            kind: "report",
            contacts: [
                {
                    kind: "report",
                    id: "alias1",
                    nickname: "Alice",
                    fullName: "Alice Anderson",
                    title: "Software Engineer 2",
                    careerPathKey: "sde",
                    levelId: "l3",
                    levelStartDate: "2025-06-01",
                    pronounsKey: "xe/xem",
                    extraFields: {},
                    droppedFields: {},
                },
                {
                    kind: "report",
                    id: "alias2",
                    nickname: "Bob",
                    fullName: "Bob Baker",
                    title: "Program Manager",
                    careerPathKey: "unknown-path",
                    levelId: "l99",
                    levelStartDate: "2025-06-01",
                    pronounsKey: "they/them",
                    extraFields: {},
                    droppedFields: {},
                },
            ],
        };

        const corrections = findContactIntegrityCorrections(document, makeReferenceData());
        const updatedDocument = applyContactIntegrityCorrections(document, corrections);

        expect(corrections).toEqual([
            {
                entityType: "contact",
                contactId: "alias1",
                field: "pronounsKey",
                oldValue: "xe/xem",
                newValue: "unknown",
            },
            {
                entityType: "contact",
                contactId: "alias2",
                field: "careerPathKey",
                oldValue: "unknown-path",
                newValue: "unknown",
            },
            {
                entityType: "contact",
                contactId: "alias2",
                field: "levelId",
                oldValue: "l99",
                newValue: "unknown",
            },
        ]);
        expect(updatedDocument.contacts[0].pronounsKey).toBe(UNKNOWN_REFERENCE_KEY);
        expect(updatedDocument.contacts[1].careerPathKey).toBe(UNKNOWN_REFERENCE_KEY);
        expect(updatedDocument.contacts[1].kind).toBe("report");
        if (updatedDocument.contacts[1].kind === "report") {
            expect(updatedDocument.contacts[1].levelId).toBe(UNKNOWN_REFERENCE_KEY);
        }
    });

    it("should skip level checks for colleague records", () => {
        const document: ContactGroupDocument = {
            kind: "colleague",
            contacts: [
                {
                    kind: "colleague",
                    id: "alias3",
                    nickname: "Carol",
                    fullName: "Carol Chen",
                    title: "Software Engineer",
                    careerPathKey: "sde",
                    pronounsKey: "they/them",
                    extraFields: {
                        LevelId: "l99",
                    },
                    droppedFields: {},
                },
            ],
        };

        expect(findContactIntegrityCorrections(document, makeReferenceData())).toEqual([]);
    });

    it("should return and apply corrections for missing interview types", () => {
        const careerLevels: CareerLevelReference[] = [
            {
                key: "l5",
                id: 5,
                interviewType: "staff",
                titlePattern: "Senior {CareerPath}",
                extraFields: {},
            },
        ];

        const corrections = findCareerLevelIntegrityCorrections(careerLevels, makeReferenceData().interviewTypes);
        const updatedCareerLevels = applyCareerLevelIntegrityCorrections(careerLevels, corrections);

        expect(corrections).toEqual([
            {
                entityType: "careerLevel",
                levelKey: "l5",
                field: "interviewType",
                oldValue: "staff",
                newValue: "unknown",
            },
        ]);
        expect(updatedCareerLevels[0].interviewType).toBe(UNKNOWN_REFERENCE_KEY);
    });
});