import { describe, expect, it, vi } from "vitest";
import {
    buildDroppedFields,
    buildWritableContact,
    cloneFieldMap,
    disposeAll,
    isToExtensionMessage,
    mapContact,
    mapFormRequest,
    mapSnapshot,
} from "../../../../src/features/contacts/contactsViewMapping";
import type { ContactsViewContact, ContactsViewColleagueContact, ContactsViewReportContact } from "../../../../src/features/contacts/types";
import type { ContactsSnapshot, ResolvedContact } from "../../../../src/features/contacts/contactsFeature";

function makeResolvedContact(overrides: Partial<ResolvedContact> = {}): ResolvedContact {
    return {
        kind: "report",
        id: "alice",
        nickname: "Alice",
        fullName: "Alice Anderson",
        title: "Software Engineer 2",
        shortTitle: "SDE 2",
        careerPathKey: "sde",
        pronounsKey: "she/her",
        extraFields: { Custom: "value" },
        droppedFields: {},
        levelId: "l3",
        levelStartDate: "2025-06-01",
        groupFile: "reports.md",
        groupName: "Reports",
        groupType: "report",
        isCustomGroup: false,
        resolvedPronouns: { key: "she/her", subject: "she", object: "her", possessiveAdjective: "her", possessive: "hers", reflexive: "herself", extraFields: {} },
        resolvedCareerPath: { key: "sde", name: "Software Development Engineer", short: "SDE", minimumCareerLevel: 1, extraFields: {} },
        resolvedCareerLevel: { key: "l3", id: 3, interviewType: "technical", titlePattern: "{path} {level}", extraFields: {} },
        resolvedInterviewType: { key: "technical", name: "Technical", extraFields: {} },
        ...overrides,
    } as ResolvedContact;
}

function makeSnapshot(overrides: Partial<ContactsSnapshot> = {}): ContactsSnapshot {
    return {
        active: true,
        multiGroup: false,
        groups: [{ file: "reports.md", name: "Reports", type: "report", isCustom: false, contactCount: 1 }],
        contacts: [makeResolvedContact()],
        referenceData: {
            pronouns: [{ key: "she/her", subject: "she", object: "her", possessiveAdjective: "her", possessive: "hers", reflexive: "herself", extraFields: {} }],
            careerLevels: [{ key: "l3", id: 3, interviewType: "technical", titlePattern: "{path} {level}", extraFields: {}, resolvedInterviewType: { key: "technical", name: "Technical", extraFields: {} } }],
            careerPaths: [{ key: "sde", name: "Software Development Engineer", short: "SDE", minimumCareerLevel: 1, extraFields: {} }],
            interviewTypes: [{ key: "technical", name: "Technical", extraFields: {} }],
            canonicalTitles: [{ normal: "Software Engineer", short: "SDE" }],
        },
        ...overrides,
    };
}

describe("contactsViewMapping", () => {
    describe("mapSnapshot", () => {
        it("should map a feature snapshot to a view snapshot", () => {
            const snapshot = makeSnapshot();

            const result = mapSnapshot(snapshot);

            expect(result.active).toBe(true);
            expect(result.multiGroup).toBe(false);
            expect(result.groups).toHaveLength(1);
            expect(result.groups[0].file).toBe("reports.md");
            expect(result.contacts).toHaveLength(1);
            expect(result.contacts[0].id).toBe("alice");
            expect(result.referenceData.pronouns).toHaveLength(1);
            expect(result.referenceData.careerLevels).toHaveLength(1);
            expect(result.referenceData.canonicalTitles).toHaveLength(1);
        });

        it("should deep-clone reference data extraFields so mutations are isolated", () => {
            const snapshot = makeSnapshot();

            const result = mapSnapshot(snapshot);
            result.referenceData.pronouns[0].extraFields.Injected = "yes";

            expect(snapshot.referenceData.pronouns[0].extraFields).not.toHaveProperty("Injected");
        });

        it("should handle empty contacts list", () => {
            const snapshot = makeSnapshot({ contacts: [], groups: [] });

            const result = mapSnapshot(snapshot);

            expect(result.contacts).toEqual([]);
            expect(result.groups).toEqual([]);
        });
    });

    describe("mapContact", () => {
        it("should map a report ResolvedContact to ContactsViewContact", () => {
            const contact = makeResolvedContact();

            const result = mapContact(contact);

            expect(result).toEqual<ContactsViewReportContact>({
                kind: "report",
                id: "alice",
                nickname: "Alice",
                fullName: "Alice Anderson",
                title: "Software Engineer 2",
                shortTitle: "SDE 2",
                careerPathKey: "sde",
                pronounsKey: "she/her",
                extraFields: { Custom: "value" },
                droppedFields: {},
                levelId: "l3",
                levelStartDate: "2025-06-01",
                groupFile: "reports.md",
                groupName: "Reports",
                isCustomGroup: false,
            });
        });

        it("should map a colleague ResolvedContact to ContactsViewContact", () => {
            const contact = makeResolvedContact({
                kind: "colleague",
                id: "bob",
                nickname: "Bob",
                fullName: "Bob Brown",
                groupFile: "colleagues.md",
                groupName: "Colleagues",
                groupType: "colleague",
            }) as ResolvedContact;

            const result = mapContact(contact);

            expect(result).toEqual<ContactsViewColleagueContact>({
                kind: "colleague",
                id: "bob",
                nickname: "Bob",
                fullName: "Bob Brown",
                title: "Software Engineer 2",
                shortTitle: "SDE 2",
                careerPathKey: "sde",
                pronounsKey: "she/her",
                extraFields: { Custom: "value" },
                droppedFields: {},
                groupFile: "colleagues.md",
                groupName: "Colleagues",
                isCustomGroup: false,
            });
        });

        it("should deep-clone extraFields so mutations are isolated", () => {
            const contact = makeResolvedContact();

            const result = mapContact(contact);
            result.extraFields.Injected = "yes";

            expect(contact.extraFields).not.toHaveProperty("Injected");
        });
    });

    describe("mapFormRequest", () => {
        it("should map form open requests correctly", () => {
            const request = { mode: "edit" as const, contactId: "alice" };

            const result = mapFormRequest(request);

            expect(result).toEqual({ mode: "edit", contactId: "alice" });
        });

        it("should shallow-clone so mutations are isolated", () => {
            const request = { mode: "add" as const, preferredGroupFile: "reports.md" };

            const result = mapFormRequest(request);
            result.preferredGroupFile = "other.md";

            expect(request.preferredGroupFile).toBe("reports.md");
        });
    });

    describe("buildWritableContact", () => {
        it("should build a report Contact from form field map and trim values", () => {
            const draft = {
                kind: "report" as const,
                id: " alice ",
                nickname: " Alice ",
                fullName: " Alice Anderson ",
                title: " SDE 2 ",
                careerPathKey: " sde ",
                levelId: " l3 ",
                levelStartDate: " 2025-06-01 ",
                pronounsKey: " she/her ",
                extraFields: { Custom: "val" },
                droppedFields: {},
            };

            const result = buildWritableContact(draft, null);

            expect(result.id).toBe("alice");
            expect(result.nickname).toBe("Alice");
            expect(result.fullName).toBe("Alice Anderson");
            expect(result.title).toBe("SDE 2");
            expect(result.kind).toBe("report");
            expect((result as any).levelId).toBe("l3");
            expect((result as any).levelStartDate).toBe("2025-06-01");
        });

        it("should build a colleague Contact and trim values", () => {
            const draft = {
                kind: "colleague" as const,
                id: " bob ",
                nickname: " Bob ",
                fullName: " Bob Brown ",
                title: " PM ",
                careerPathKey: " pm ",
                pronounsKey: " he/him ",
                extraFields: {},
                droppedFields: {},
            };

            const result = buildWritableContact(draft, null);

            expect(result.kind).toBe("colleague");
            expect(result.id).toBe("bob");
            expect(result.nickname).toBe("Bob");
        });

        it("should use sourceContact extraFields when sourceContact is provided", () => {
            const draft = {
                kind: "report" as const,
                id: "alice",
                nickname: "Alice",
                fullName: "Alice Anderson",
                title: "SDE 2",
                careerPathKey: "sde",
                levelId: "l3",
                levelStartDate: "2025-06-01",
                pronounsKey: "she/her",
                extraFields: { FromDraft: "draft" },
                droppedFields: {},
            };
            const sourceContact: ContactsViewReportContact = {
                kind: "report",
                id: "alice",
                nickname: "Alice",
                fullName: "Alice Anderson",
                title: "SDE 2",
                shortTitle: "SDE 2",
                careerPathKey: "sde",
                levelId: "l3",
                levelStartDate: "2025-06-01",
                pronounsKey: "she/her",
                extraFields: { FromSource: "source" },
                droppedFields: {},
                groupFile: "reports.md",
                groupName: "Reports",
                isCustomGroup: false,
            };

            const result = buildWritableContact(draft, sourceContact);

            expect(result.extraFields).toEqual({ FromSource: "source" });
        });
    });

    describe("buildDroppedFields", () => {
        it("should return cloned fallback when sourceContact is null", () => {
            const fallback = { LevelId: "l3", LevelStartDate: "2025-01-01" };

            const result = buildDroppedFields("report", null, fallback);

            expect(result).toEqual(fallback);
            expect(result).not.toBe(fallback);
        });

        it("should remove LevelId and LevelStartDate when changing colleague to report", () => {
            const sourceContact: ContactsViewColleagueContact = {
                kind: "colleague",
                id: "bob",
                nickname: "Bob",
                fullName: "Bob Brown",
                title: "PM",
                shortTitle: "PM",
                careerPathKey: "pm",
                pronounsKey: "he/him",
                extraFields: {},
                droppedFields: { LevelId: "l3", LevelStartDate: "2025-01-01", Custom: "val" },
                groupFile: "colleagues.md",
                groupName: "Colleagues",
                isCustomGroup: false,
            };

            const result = buildDroppedFields("report", sourceContact, {});

            expect(result).not.toHaveProperty("LevelId");
            expect(result).not.toHaveProperty("LevelStartDate");
            expect(result).toHaveProperty("Custom", "val");
        });

        it("should keep all droppedFields when kinds match", () => {
            const sourceContact: ContactsViewReportContact = {
                kind: "report",
                id: "alice",
                nickname: "Alice",
                fullName: "Alice Anderson",
                title: "SDE 2",
                shortTitle: "SDE 2",
                careerPathKey: "sde",
                levelId: "l3",
                levelStartDate: "2025-06-01",
                pronounsKey: "she/her",
                extraFields: {},
                droppedFields: { Custom: "kept" },
                groupFile: "reports.md",
                groupName: "Reports",
                isCustomGroup: false,
            };

            const result = buildDroppedFields("report", sourceContact, {});

            expect(result).toEqual({ Custom: "kept" });
        });
    });

    describe("cloneFieldMap", () => {
        it("should deep-clone a field map", () => {
            const original = { A: "1", B: "2" };

            const clone = cloneFieldMap(original);
            clone.A = "changed";

            expect(original.A).toBe("1");
        });
    });

    describe("disposeAll", () => {
        it("should call dispose on all items", () => {
            const disposable1 = { dispose: vi.fn() };
            const disposable2 = { dispose: vi.fn() };

            disposeAll([disposable1, disposable2]);

            expect(disposable1.dispose).toHaveBeenCalledOnce();
            expect(disposable2.dispose).toHaveBeenCalledOnce();
        });

        it("should handle empty array", () => {
            expect(() => disposeAll([])).not.toThrow();
        });
    });

    describe("isToExtensionMessage", () => {
        it("should validate ready message", () => {
            expect(isToExtensionMessage({ type: "ready" })).toBe(true);
        });

        it("should validate open message with mode add", () => {
            expect(isToExtensionMessage({ type: "open", mode: "add" })).toBe(true);
        });

        it("should validate open message with optional fields", () => {
            expect(isToExtensionMessage({
                type: "open",
                mode: "edit",
                contactId: "alice",
                targetGroupFile: "reports.md",
                preferredGroupFile: "colleagues.md",
            })).toBe(true);
        });

        it("should validate delete message", () => {
            expect(isToExtensionMessage({ type: "delete", contactId: "alice" })).toBe(true);
        });

        it("should validate move message", () => {
            expect(isToExtensionMessage({ type: "move", contactId: "alice" })).toBe(true);
        });

        it("should validate save message with contact", () => {
            expect(isToExtensionMessage({
                type: "save",
                mode: "add",
                contact: {
                    kind: "colleague",
                    id: "bob",
                    nickname: "Bob",
                    fullName: "Bob Brown",
                    title: "PM",
                    careerPathKey: "pm",
                    pronounsKey: "he/him",
                    extraFields: {},
                    droppedFields: {},
                },
            })).toBe(true);
        });

        it("should reject null", () => {
            expect(isToExtensionMessage(null)).toBe(false);
        });

        it("should reject non-object", () => {
            expect(isToExtensionMessage("ready")).toBe(false);
        });

        it("should reject object without type", () => {
            expect(isToExtensionMessage({ mode: "add" })).toBe(false);
        });

        it("should reject unknown type", () => {
            expect(isToExtensionMessage({ type: "unknown" })).toBe(false);
        });

        it("should reject delete message without contactId", () => {
            expect(isToExtensionMessage({ type: "delete" })).toBe(false);
        });

        it("should reject open message without mode", () => {
            expect(isToExtensionMessage({ type: "open" })).toBe(false);
        });
    });
});
