import { describe, expect, it } from "vitest";
import {
    UNKNOWN_CAREER_LEVEL,
    UNKNOWN_CAREER_PATH,
    UNKNOWN_INTERVIEW_TYPE,
    UNKNOWN_PRONOUNS,
    UNKNOWN_REFERENCE_KEY,
    isUnknownReferenceKey,
    resolveCareerLevel,
    resolveCareerPath,
    resolveInterviewType,
    resolvePronouns,
} from "../../../../src/features/contacts/referenceDefaults";

describe("referenceDefaults", () => {
    it("should expose code-only defaults under the reserved unknown key", () => {
        expect(UNKNOWN_REFERENCE_KEY).toBe("unknown");
        expect(UNKNOWN_PRONOUNS.key).toBe("unknown");
        expect(UNKNOWN_CAREER_LEVEL.key).toBe("unknown");
        expect(UNKNOWN_CAREER_PATH.key).toBe("unknown");
        expect(UNKNOWN_INTERVIEW_TYPE.key).toBe("unknown");
        expect(isUnknownReferenceKey("unknown")).toBe(true);
    });

    it("should resolve known entries from the loaded reference data", () => {
        expect(resolvePronouns("she/her", [{
            key: "she/her",
            subject: "she",
            object: "her",
            possessiveAdjective: "her",
            possessive: "hers",
            reflexive: "herself",
            extraFields: {},
        }]).subject).toBe("she");

        expect(resolveCareerLevel("l5", [{
            key: "l5",
            id: 5,
            interviewType: "senior",
            titlePattern: "Senior {CareerPath}",
            extraFields: {},
        }]).id).toBe(5);

        expect(resolveCareerPath("sde", [{
            key: "sde",
            name: "Software Engineer",
            short: "SDE",
            minimumCareerLevel: 0,
            extraFields: {},
        }]).short).toBe("SDE");

        expect(resolveInterviewType("senior", [{
            key: "senior",
            name: "Senior",
            extraFields: {},
        }]).name).toBe("Senior");
    });

    it("should resolve missing and explicit unknown keys to the code-only defaults", () => {
        expect(resolvePronouns("xe/xem", []).subject).toBe("they");
        expect(resolvePronouns("unknown", []).reflexive).toBe("themselves");
        expect(resolveCareerLevel(undefined, []).titlePattern).toBe("{CareerPath}");
        expect(resolveCareerPath("unknown", []).short).toBe("?");
        expect(resolveInterviewType("staff", []).name).toBe("Unknown");
    });
});