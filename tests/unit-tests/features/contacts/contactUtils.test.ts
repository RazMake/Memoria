import { describe, expect, it, vi } from "vitest";

vi.mock("vscode", () => ({
    Uri: {
        joinPath: (base: { path: string }, ...segments: string[]) => ({
            path: base.path + "/" + segments.join("/"),
        }),
    },
}));

import {
    buildAutoMovedContact,
    buildResolvedContact,
    buildResolvedReferenceData,
    buildShortTitleLookup,
    compareText,
    createEmptyReferenceData,
    disposeAll,
    fileName,
    joinRelativePath,
    mergeMovedContact,
    splitRelativePath,
    stripMarkdownExtension,
    type ContactGroupInfo,
} from "../../../../src/features/contacts/contactUtils";
import type {
    CareerLevelReference,
    CareerPathReference,
    ColleagueContact,
    ContactsReferenceData,
    InterviewTypeReference,
    PronounsReference,
    ReportContact,
} from "../../../../src/features/contacts/types";

const pronouns: PronounsReference[] = [
    { key: "she/her", subject: "she", object: "her", possessiveAdjective: "her", possessive: "hers", reflexive: "herself", extraFields: {} },
];
const careerLevels: CareerLevelReference[] = [
    { key: "l3", id: 3, interviewType: "junior", titlePattern: "{CareerPath}", extraFields: {} },
    { key: "l5", id: 5, interviewType: "senior", titlePattern: "Senior {CareerPath}", extraFields: {} },
];
const careerPaths: CareerPathReference[] = [
    { key: "sde", name: "Software Engineer", short: "SDE", minimumCareerLevel: 0, extraFields: {} },
];
const interviewTypes: InterviewTypeReference[] = [
    { key: "junior", name: "Junior Interview", extraFields: {} },
    { key: "senior", name: "Senior Interview", extraFields: {} },
];

function makeReferenceData(overrides?: Partial<ContactsReferenceData>): ContactsReferenceData {
    return { pronouns, careerLevels, careerPaths, interviewTypes, ...overrides };
}

function makeReport(overrides?: Partial<ReportContact>): ReportContact {
    return {
        kind: "report",
        id: "alice",
        nickname: "Alice",
        fullName: "Alice Anderson",
        title: "Software Engineer",
        careerPathKey: "sde",
        levelId: "l3",
        levelStartDate: "2025-06-01",
        pronounsKey: "she/her",
        extraFields: {},
        droppedFields: {},
        ...overrides,
    };
}

function makeColleague(overrides?: Partial<ColleagueContact>): ColleagueContact {
    return {
        kind: "colleague",
        id: "bob",
        nickname: "Bob",
        fullName: "Bob Baker",
        title: "Senior Software Engineer",
        careerPathKey: "sde",
        pronounsKey: "she/her",
        extraFields: {},
        droppedFields: {},
        ...overrides,
    };
}

function makeGroup(overrides?: Partial<ContactGroupInfo>): ContactGroupInfo {
    return { file: "reports.md", name: "Reports", type: "report", isCustom: false, ...overrides };
}

describe("contactUtils", () => {
    describe("createEmptyReferenceData", () => {
        it("should return reference data with all empty arrays", () => {
            const result = createEmptyReferenceData();

            expect(result).toEqual({
                pronouns: [],
                careerLevels: [],
                careerPaths: [],
                interviewTypes: [],
            });
        });
    });

    describe("buildResolvedReferenceData", () => {
        it("should resolve all reference data including canonical titles", () => {
            const ref = makeReferenceData();

            const result = buildResolvedReferenceData(ref);

            expect(result.pronouns).toEqual(pronouns);
            expect(result.careerPaths).toEqual(careerPaths);
            expect(result.interviewTypes).toEqual(interviewTypes);
            expect(result.careerLevels).toHaveLength(2);
            expect(result.careerLevels[0].resolvedInterviewType.key).toBe("junior");
            expect(result.careerLevels[1].resolvedInterviewType.key).toBe("senior");
            expect(result.canonicalTitles.length).toBeGreaterThan(0);
        });

        it("should return only CVP title pair when reference data is empty", () => {
            const ref = makeReferenceData({ pronouns: [], careerLevels: [], careerPaths: [], interviewTypes: [] });

            const result = buildResolvedReferenceData(ref);

            expect(result.canonicalTitles).toEqual([{ normal: "CVP", short: "CVP" }]);
            expect(result.careerLevels).toEqual([]);
        });
    });

    describe("buildResolvedContact", () => {
        it("should resolve a report contact with career level and interview type", () => {
            const contact = makeReport();
            const group = makeGroup();
            const ref = makeReferenceData();
            const lookup = new Map([["Software Engineer", "SDE"]]);

            const result = buildResolvedContact(contact, group, ref, lookup);

            expect(result.groupFile).toBe("reports.md");
            expect(result.groupName).toBe("Reports");
            expect(result.groupType).toBe("report");
            expect(result.isCustomGroup).toBe(false);
            expect(result.shortTitle).toBe("SDE");
            expect(result.resolvedCareerLevel).not.toBeNull();
            expect(result.resolvedCareerLevel!.key).toBe("l3");
            expect(result.resolvedInterviewType).not.toBeNull();
            expect(result.resolvedInterviewType!.key).toBe("junior");
            expect(result.resolvedPronouns.key).toBe("she/her");
            expect(result.resolvedCareerPath.key).toBe("sde");
        });

        it("should resolve a colleague contact with null career level and interview type", () => {
            const contact = makeColleague();
            const group = makeGroup({ type: "colleague", name: "Colleagues", file: "colleagues.md" });
            const ref = makeReferenceData();
            const lookup = new Map<string, string>();

            const result = buildResolvedContact(contact, group, ref, lookup);

            expect(result.resolvedCareerLevel).toBeNull();
            expect(result.resolvedInterviewType).toBeNull();
            expect(result.shortTitle).toBe("Senior Software Engineer");
        });

        it("should fall back to full title when short title is not in lookup", () => {
            const contact = makeReport({ title: "Custom Title" });
            const group = makeGroup();
            const ref = makeReferenceData();
            const lookup = new Map<string, string>();

            const result = buildResolvedContact(contact, group, ref, lookup);

            expect(result.shortTitle).toBe("Custom Title");
        });
    });

    describe("buildShortTitleLookup", () => {
        it("should build a map from normal titles to short titles", () => {
            const ref = makeReferenceData();

            const result = buildShortTitleLookup(ref);

            expect(result.get("Software Engineer")).toBe("SDE");
            expect(result.get("Senior Software Engineer")).toBe("Senior SDE");
        });

        it("should return empty map when reference data has no paths or levels", () => {
            const ref = makeReferenceData({ careerPaths: [], careerLevels: [] });

            const result = buildShortTitleLookup(ref);

            // CVP maps to itself
            expect(result.get("CVP")).toBe("CVP");
            expect(result.size).toBe(1);
        });
    });

    describe("buildAutoMovedContact", () => {
        it("should return a clone when source and target kind are the same", () => {
            const contact = makeReport();
            const ref = makeReferenceData();

            const result = buildAutoMovedContact(contact, "report", ref);

            expect(result).toEqual(contact);
            expect(result).not.toBe(contact);
        });

        it("should convert report to colleague and store level fields in droppedFields", () => {
            const contact = makeReport({ levelId: "l5", levelStartDate: "2024-01-15" });
            const ref = makeReferenceData();

            const result = buildAutoMovedContact(contact, "colleague", ref);

            expect(result.kind).toBe("colleague");
            expect(result.droppedFields.LevelId).toBe("l5");
            expect(result.droppedFields.LevelStartDate).toBe("2024-01-15");
            expect((result as ReportContact).levelId).toBeUndefined();
        });

        it("should convert colleague to report and restore level fields from droppedFields", () => {
            const contact = makeColleague({
                droppedFields: { LevelId: "l5", LevelStartDate: "2024-01-15" },
            });
            const ref = makeReferenceData();

            const result = buildAutoMovedContact(contact, "report", ref);

            expect(result.kind).toBe("report");
            const report = result as ReportContact;
            expect(report.levelId).toBe("l5");
            expect(report.levelStartDate).toBe("2024-01-15");
            expect(report.droppedFields.LevelId).toBeUndefined();
            expect(report.droppedFields.LevelStartDate).toBeUndefined();
        });

        it("should throw when converting colleague to report without required dropped fields", () => {
            const contact = makeColleague({ droppedFields: {} });
            const ref = makeReferenceData();

            expect(() => buildAutoMovedContact(contact, "report", ref)).toThrow(
                "Moving this contact to a reports group requires LevelId and LevelStartDate.",
            );
        });
    });

    describe("mergeMovedContact", () => {
        it("should merge report contacts preserving target overrides", () => {
            const auto = makeReport({ nickname: "Alice" });
            const target = makeReport({ nickname: "Ally", extraFields: { Team: "Alpha" } });

            const result = mergeMovedContact(auto, target);

            expect(result.nickname).toBe("Ally");
            expect(result.extraFields.Team).toBe("Alpha");
        });

        it("should merge colleague contacts combining extra and dropped fields", () => {
            const auto = makeColleague({ extraFields: { Org: "Eng" }, droppedFields: { LevelId: "l3" } });
            const target = makeColleague({ extraFields: { Team: "Beta" }, droppedFields: { LevelStartDate: "2024-01-01" } });

            const result = mergeMovedContact(auto, target);

            expect(result.extraFields).toEqual({ Org: "Eng", Team: "Beta" });
            expect(result.droppedFields).toEqual({ LevelId: "l3", LevelStartDate: "2024-01-01" });
        });

        it("should throw when contact kinds do not match", () => {
            const auto = makeReport();
            const target = makeColleague();

            expect(() => mergeMovedContact(auto, target)).toThrow(
                "Target contact kind does not match the destination group.",
            );
        });

        it("should throw when contact ids do not match", () => {
            const auto = makeReport({ id: "alice" });
            const target = makeReport({ id: "different" });

            expect(() => mergeMovedContact(auto, target)).toThrow(
                "Moving a contact cannot change its id.",
            );
        });
    });

    describe("splitRelativePath", () => {
        it("should split a forward-slash path into segments", () => {
            expect(splitRelativePath("a/b/c")).toEqual(["a", "b", "c"]);
        });

        it("should normalize backslashes and split into segments", () => {
            expect(splitRelativePath("a\\b\\c")).toEqual(["a", "b", "c"]);
        });

        it("should filter out empty segments from leading or trailing slashes", () => {
            expect(splitRelativePath("/a/b/")).toEqual(["a", "b"]);
        });

        it("should return empty array for empty string", () => {
            expect(splitRelativePath("")).toEqual([]);
        });
    });

    describe("joinRelativePath", () => {
        it("should join relative path segments onto base URI", () => {
            const base = { path: "/workspace" } as any;

            const result = joinRelativePath(base, "contacts/reports.md");

            expect(result.path).toContain("contacts");
            expect(result.path).toContain("reports.md");
        });

        it("should return base URI when relative path is empty", () => {
            const base = { path: "/workspace" } as any;

            const result = joinRelativePath(base, "");

            expect(result).toBe(base);
        });
    });

    describe("fileName", () => {
        it("should return the last segment of a path", () => {
            expect(fileName("a/b/file.md")).toBe("file.md");
        });

        it("should return the value itself when there are no separators", () => {
            expect(fileName("file.md")).toBe("file.md");
        });

        it("should handle backslash separators", () => {
            expect(fileName("a\\b\\file.md")).toBe("file.md");
        });

        it("should return the original value for empty string", () => {
            expect(fileName("")).toBe("");
        });
    });

    describe("stripMarkdownExtension", () => {
        it("should remove .md extension", () => {
            expect(stripMarkdownExtension("file.md")).toBe("file");
        });

        it("should remove .MD extension case-insensitively", () => {
            expect(stripMarkdownExtension("file.MD")).toBe("file");
        });

        it("should return value unchanged when no .md extension", () => {
            expect(stripMarkdownExtension("file.txt")).toBe("file.txt");
        });

        it("should only strip trailing .md extension", () => {
            expect(stripMarkdownExtension("file.md.bak")).toBe("file.md.bak");
        });
    });

    describe("compareText", () => {
        it("should return 0 for case-insensitive equal strings", () => {
            expect(compareText("abc", "ABC")).toBe(0);
        });

        it("should return negative when left precedes right", () => {
            expect(compareText("apple", "banana")).toBeLessThan(0);
        });

        it("should return positive when left follows right", () => {
            expect(compareText("banana", "apple")).toBeGreaterThan(0);
        });
    });

    describe("disposeAll", () => {
        it("should call dispose on every item in the array", () => {
            const d1 = { dispose: vi.fn() };
            const d2 = { dispose: vi.fn() };

            disposeAll([d1, d2]);

            expect(d1.dispose).toHaveBeenCalledOnce();
            expect(d2.dispose).toHaveBeenCalledOnce();
        });

        it("should handle an empty array without errors", () => {
            expect(() => disposeAll([])).not.toThrow();
        });
    });
});
