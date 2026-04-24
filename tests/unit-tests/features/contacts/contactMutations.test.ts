import { beforeEach, describe, expect, it, vi } from "vitest";

const encoder = new TextEncoder();

interface MockUri {
    path: string;
}

const mockWriteFile = vi.fn<(uri: MockUri, bytes: Uint8Array) => Promise<void>>();
const mockCreateDirectory = vi.fn<(uri: MockUri) => Promise<void>>();

vi.mock("vscode", () => ({
    FileType: {
        File: 1,
        Directory: 2,
    },
    Uri: {
        joinPath: (base: MockUri, ...segments: string[]) => ({
            path: [base.path, ...segments].join("/"),
        }),
    },
    workspace: {
        fs: {
            writeFile: (...args: [MockUri, Uint8Array]) => mockWriteFile(...args),
            createDirectory: (...args: [MockUri]) => mockCreateDirectory(...args),
        },
    },
}));

import {
    assertUniqueContactId,
    findContactLocation,
    prepareContactForWrite,
    requireContact,
    requireGroup,
    toCustomGroupFileName,
    writeGroupDocument,
    writeTextFile,
} from "../../../../src/features/contacts/contactMutations";
import type { LoadedGroupState } from "../../../../src/features/contacts/contactFileLoader";
import type {
    ColleagueContact,
    Contact,
    ContactGroupDocument,
    ContactsReferenceData,
    ReportContact,
} from "../../../../src/features/contacts/types";

const decoder = new TextDecoder();

const fakeFs = {
    writeFile: mockWriteFile,
    createDirectory: mockCreateDirectory,
} as unknown as typeof import("vscode").workspace.fs;

function uri(path: string): MockUri {
    return { path };
}

function makeColleague(overrides: Partial<ColleagueContact> = {}): ColleagueContact {
    return {
        kind: "colleague",
        id: "alice",
        nickname: "Alice",
        fullName: "Alice Anderson",
        title: "Program Manager",
        careerPathKey: "pm",
        pronounsKey: "she/her",
        extraFields: {},
        droppedFields: {},
        ...overrides,
    };
}

function makeReport(overrides: Partial<ReportContact> = {}): ReportContact {
    return {
        kind: "report",
        id: "bob",
        nickname: "Bob",
        fullName: "Bob Baker",
        title: "Software Engineer 2",
        careerPathKey: "sde",
        pronounsKey: "he/him",
        levelId: "l3",
        levelStartDate: "2025-06-01",
        extraFields: {},
        droppedFields: {},
        ...overrides,
    };
}

function makeGroup(file: string, kind: "report" | "colleague", contacts: Contact[]): LoadedGroupState {
    return {
        file,
        name: file.replace(/\.md$/i, ""),
        type: kind,
        isCustom: false,
        uri: uri(`/people/${file}`) as any,
        document: { kind, contacts },
    };
}

function makeReferenceData(overrides: Partial<ContactsReferenceData> = {}): ContactsReferenceData {
    return {
        pronouns: [
            { key: "she/her", subject: "she", object: "her", possessiveAdjective: "her", possessive: "hers", reflexive: "herself", extraFields: {} },
            { key: "he/him", subject: "he", object: "him", possessiveAdjective: "his", possessive: "his", reflexive: "himself", extraFields: {} },
        ],
        careerLevels: [
            { key: "l3", id: 63, interviewType: "technical", titlePattern: "{careerPath} 2", extraFields: {} },
        ],
        careerPaths: [
            { key: "sde", name: "Software Development Engineer", short: "SDE", minimumCareerLevel: 59, extraFields: {} },
            { key: "pm", name: "Program Manager", short: "PM", minimumCareerLevel: 59, extraFields: {} },
        ],
        interviewTypes: [
            { key: "technical", name: "Technical Interview", extraFields: {} },
        ],
        ...overrides,
    };
}

describe("contactMutations", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe("writeTextFile", () => {
        it("should encode and write text content", async () => {
            mockWriteFile.mockResolvedValue(undefined);

            await writeTextFile(fakeFs, uri("/test.md") as any, "hello world");

            expect(mockWriteFile).toHaveBeenCalledOnce();
            const [writtenUri, writtenBytes] = mockWriteFile.mock.calls[0];
            expect(writtenUri.path).toBe("/test.md");
            expect(decoder.decode(writtenBytes)).toBe("hello world");
        });
    });

    describe("writeGroupDocument", () => {
        it("should serialize and write group document", async () => {
            mockWriteFile.mockResolvedValue(undefined);
            const doc: ContactGroupDocument = {
                kind: "colleague",
                contacts: [makeColleague()],
            };

            await writeGroupDocument(fakeFs, uri("/people") as any, "Colleagues.md", doc);

            expect(mockWriteFile).toHaveBeenCalledOnce();
            const [, writtenBytes] = mockWriteFile.mock.calls[0];
            const text = decoder.decode(writtenBytes);
            expect(text).toContain("# alice");
            expect(text).toContain("- Nickname: Alice");
        });

        it("should create parent directories for nested group files", async () => {
            mockWriteFile.mockResolvedValue(undefined);
            mockCreateDirectory.mockResolvedValue(undefined);
            const doc: ContactGroupDocument = { kind: "colleague", contacts: [] };

            await writeGroupDocument(fakeFs, uri("/people") as any, "sub/Nested.md", doc);

            expect(mockCreateDirectory).toHaveBeenCalledOnce();
        });
    });

    describe("findContactLocation", () => {
        it("should find contact across groups", () => {
            const groups = [
                makeGroup("Team.md", "report", [makeReport()]),
                makeGroup("Colleagues.md", "colleague", [makeColleague()]),
            ];

            const location = findContactLocation(groups, "alice");

            expect(location).not.toBeNull();
            expect(location!.group.file).toBe("Colleagues.md");
            expect(location!.contact.id).toBe("alice");
        });

        it("should return null when contact is not found", () => {
            const groups = [makeGroup("Team.md", "report", [makeReport()])];

            const location = findContactLocation(groups, "nonexistent");

            expect(location).toBeNull();
        });
    });

    describe("requireContact", () => {
        it("should return contact when found", () => {
            const groups = [makeGroup("Colleagues.md", "colleague", [makeColleague()])];

            const location = requireContact(groups, "alice");

            expect(location.contact.id).toBe("alice");
            expect(location.group.file).toBe("Colleagues.md");
        });

        it("should throw when not found", () => {
            const groups = [makeGroup("Team.md", "report", [makeReport()])];

            expect(() => requireContact(groups, "unknown")).toThrow('Contact "unknown" was not found.');
        });
    });

    describe("requireGroup", () => {
        it("should return group when found", () => {
            const groups = [makeGroup("Team.md", "report", [makeReport()])];

            const group = requireGroup(groups, "Team.md");

            expect(group.file).toBe("Team.md");
        });

        it("should throw when not found", () => {
            const groups = [makeGroup("Team.md", "report", [])];

            expect(() => requireGroup(groups, "Missing.md")).toThrow('Contact group "Missing.md" was not found.');
        });
    });

    describe("assertUniqueContactId", () => {
        it("should throw when ID already exists", () => {
            const groups = [makeGroup("Team.md", "report", [makeReport({ id: "dup" })])];

            expect(() => assertUniqueContactId(groups, "dup")).toThrow('A contact with id "dup" already exists.');
        });

        it("should not throw when ID is unique", () => {
            const groups = [makeGroup("Team.md", "report", [makeReport()])];

            expect(() => assertUniqueContactId(groups, "unique-id")).not.toThrow();
        });

        it("should skip excluded contact when checking uniqueness", () => {
            const groups = [makeGroup("Team.md", "report", [makeReport({ id: "bob" })])];

            expect(() =>
                assertUniqueContactId(groups, "bob", { groupFile: "Team.md", contactId: "bob" }),
            ).not.toThrow();
        });
    });

    describe("prepareContactForWrite", () => {
        it("should validate required fields and return contact", () => {
            const refData = makeReferenceData();
            const contact = makeReport();

            const result = prepareContactForWrite(contact, "report", refData);

            expect(result.id).toBe("bob");
            expect(result.fullName).toBe("Bob Baker");
        });

        it("should throw when fullName is missing", () => {
            const refData = makeReferenceData();
            const contact = makeReport({ fullName: "  " });

            expect(() => prepareContactForWrite(contact, "report", refData)).toThrow("Full name is required.");
        });

        it("should throw when kind does not match expected kind", () => {
            const refData = makeReferenceData();
            const contact = makeColleague();

            expect(() => prepareContactForWrite(contact, "report", refData)).toThrow(
                "Expected a report contact for this group.",
            );
        });

        it("should throw when nickname is missing", () => {
            const refData = makeReferenceData();
            const contact = makeReport({ nickname: "" });

            expect(() => prepareContactForWrite(contact, "report", refData)).toThrow("Nickname is required.");
        });

        it("should throw when pronounsKey is missing", () => {
            const refData = makeReferenceData();
            const contact = makeReport({ pronounsKey: "" });

            expect(() => prepareContactForWrite(contact, "report", refData)).toThrow("Pronouns are required.");
        });

        it("should generate title for report contacts when title is empty", () => {
            const refData = makeReferenceData();
            const contact = makeReport({ title: "" });

            const result = prepareContactForWrite(contact, "report", refData);

            expect(result.title).not.toBe("");
        });

        it("should throw when title is missing for colleague contacts", () => {
            const refData = makeReferenceData();
            const contact = makeColleague({ title: "" });

            expect(() => prepareContactForWrite(contact, "colleague", refData)).toThrow(
                "Title is required for colleague contacts.",
            );
        });
    });

    describe("toCustomGroupFileName", () => {
        it("should sanitize group name for filename", () => {
            expect(toCustomGroupFileName("Partners")).toBe("Partners.md");
        });

        it("should not double-add .md extension", () => {
            expect(toCustomGroupFileName("Partners.md")).toBe("Partners.md");
        });

        it("should throw when name is empty", () => {
            expect(() => toCustomGroupFileName("  ")).toThrow("Group name is required.");
        });

        it("should throw when name is a dot directory", () => {
            expect(() => toCustomGroupFileName("..")).toThrow("Group name is invalid.");
        });

        it("should throw when name contains invalid characters", () => {
            expect(() => toCustomGroupFileName("a*b")).toThrow("Group name contains invalid filename characters.");
        });
    });
});
