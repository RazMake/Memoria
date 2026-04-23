import { describe, it, expect } from "vitest";
import { generateContactSnippets } from "../../../../src/features/snippets/contactSnippets";
import type { ResolvedContact } from "../../../../src/features/contacts/contactUtils";

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

describe("generateContactSnippets", () => {
    it("should generate a snippet for each contact", () => {
        const contacts = [makeContact(), makeContact({ id: "janeroe", fullName: "Jane Roe", nickname: "Jane" })];
        const result = generateContactSnippets(contacts);

        expect(result).toHaveLength(2);
        expect(result[0].trigger).toBe("@johnsmith");
        expect(result[1].trigger).toBe("@janeroe");
    });

    it("should include level options for report contacts", () => {
        const contacts = [makeContact()];
        const result = generateContactSnippets(contacts);

        expect(result[0].parameters).toHaveLength(1);
        expect(result[0].parameters![0].options).toContain("level");
        expect(result[0].parameters![0].options).toContain("level full");
    });

    it("should not include level options for colleague contacts", () => {
        const contacts = [makeContact({ kind: "colleague" } as any)];
        const result = generateContactSnippets(contacts);

        expect(result[0].parameters![0].options).not.toContain("level");
        expect(result[0].parameters![0].options).not.toContain("level full");
    });

    it("should expand nickname format correctly", () => {
        const contacts = [makeContact()];
        const result = generateContactSnippets(contacts);

        const expanded = result[0].expand!({
            document: null,
            position: null,
            params: { format: "nickname" },
            contacts: [],
        });

        expect(expanded).toBe("John");
    });

    it("should expand full format correctly", () => {
        const contacts = [makeContact()];
        const result = generateContactSnippets(contacts);

        const expanded = result[0].expand!({
            document: null,
            position: null,
            params: { format: "full" },
            contacts: [],
        });

        expect(expanded).toBe("John Smith");
    });

    it("should expand title format correctly", () => {
        const contacts = [makeContact()];
        const result = generateContactSnippets(contacts);

        const expanded = result[0].expand!({
            document: null,
            position: null,
            params: { format: "title" },
            contacts: [],
        });

        expect(expanded).toBe("John Smith (SDE 2)");
    });

    it("should expand level format for report contacts", () => {
        const contacts = [makeContact()];
        const result = generateContactSnippets(contacts);

        const expanded = result[0].expand!({
            document: null,
            position: null,
            params: { format: "level" },
            contacts: [],
        });

        expect(expanded).toBe("John Smith (L2)");
    });

    it("should fall back to fullName for level format on colleague contacts", () => {
        const contacts = [makeContact({ kind: "colleague" } as any)];
        const result = generateContactSnippets(contacts);

        const expanded = result[0].expand!({
            document: null,
            position: null,
            params: { format: "level" },
            contacts: [],
        });

        expect(expanded).toBe("John Smith");
    });

    it("should set glob to match all files", () => {
        const contacts = [makeContact()];
        const result = generateContactSnippets(contacts);

        expect(result[0].glob).toBe("**/*");
    });

    it("should include alias option for all contacts", () => {
        const contacts = [makeContact()];
        const result = generateContactSnippets(contacts);

        expect(result[0].parameters![0].options).toContain("alias");
    });

    it("should expand alias format to contact id", () => {
        const contacts = [makeContact()];
        const result = generateContactSnippets(contacts);

        const expanded = result[0].expand!({
            document: null,
            position: null,
            params: { format: "alias" },
            contacts: [],
        });

        expect(expanded).toBe("johnsmith");
    });

    it("should use contact shortTitle in description", () => {
        const contacts = [makeContact()];
        const result = generateContactSnippets(contacts);

        expect(result[0].description).toContain("SDE 2");
        expect(result[0].label).toContain("johnsmith");
    });
});
