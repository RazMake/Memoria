import { describe, expect, it } from "vitest";
import {
    UNKNOWN_CAREER_LEVEL,
    UNKNOWN_CAREER_PATH,
} from "../../../../src/features/contacts/referenceDefaults";
import {
    CVP_TITLE_PAIR,
    generateCanonicalTitlePairs,
    generateTitle,
} from "../../../../src/features/contacts/titleGenerator";
import type { CareerLevelReference, CareerPathReference } from "../../../../src/features/contacts/types";

describe("titleGenerator", () => {
    it("should generate the filtered cartesian product of normal and short titles", () => {
        const careerPaths: CareerPathReference[] = [
            { key: "sde", name: "Software Engineer", short: "SDE", minimumCareerLevel: 0, extraFields: {} },
            { key: "em", name: "Engineering Manager", short: "EM", minimumCareerLevel: 5, extraFields: {} },
        ];
        const careerLevels: CareerLevelReference[] = [
            { key: "l1", id: 1, interviewType: "junior", titlePattern: "{CareerPath}", extraFields: {} },
            { key: "l5", id: 5, interviewType: "senior", titlePattern: "Senior {CareerPath}", extraFields: {} },
            { key: "l7", id: 7, interviewType: "senior", titlePattern: "Principal {CareerPath}", extraFields: {} },
        ];

        expect(generateCanonicalTitlePairs(careerPaths, careerLevels)).toEqual([
            { normal: "Software Engineer", short: "SDE" },
            { normal: "Senior Software Engineer", short: "Senior SDE" },
            { normal: "Principal Software Engineer", short: "Principal SDE" },
            { normal: "Senior Engineering Manager", short: "Senior EM" },
            { normal: "Principal Engineering Manager", short: "Principal EM" },
            CVP_TITLE_PAIR,
        ]);
    });

    it("should deduplicate by normal title and keep CVP as the final option", () => {
        const careerPaths: CareerPathReference[] = [
            { key: "sde", name: "Software Engineer", short: "SDE", minimumCareerLevel: 0, extraFields: {} },
            { key: "alias", name: "Software Engineer", short: "Engineer", minimumCareerLevel: 0, extraFields: {} },
        ];
        const careerLevels: CareerLevelReference[] = [
            { key: "l5", id: 5, interviewType: "senior", titlePattern: "Senior {CareerPath}", extraFields: {} },
        ];

        expect(generateCanonicalTitlePairs(careerPaths, careerLevels)).toEqual([
            { normal: "Senior Software Engineer", short: "Senior SDE" },
            CVP_TITLE_PAIR,
        ]);
    });

    it("should return only CVP when no reference data is available", () => {
        expect(generateCanonicalTitlePairs([], [])).toEqual([CVP_TITLE_PAIR]);
    });

    it("should generate a single title pair using the path short label for the short variant", () => {
        expect(generateTitle(
            { key: "pm", name: "Program Manager", short: "PM", minimumCareerLevel: 0, extraFields: {} },
            { key: "l5", id: 5, interviewType: "senior", titlePattern: "Senior {CareerPath}", extraFields: {} },
        )).toEqual({
            normal: "Senior Program Manager",
            short: "Senior PM",
        });
    });

    it("should generate the unknown title pair from the code-only defaults", () => {
        expect(generateTitle(UNKNOWN_CAREER_PATH, UNKNOWN_CAREER_LEVEL)).toEqual({
            normal: "Unknown",
            short: "?",
        });
    });
});