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
        expect(result[0].parameters![0].options).toContain("Full Name (level)");
        expect(result[0].parameters![0].options).toContain("Nickname (level)");
    });

    it("should not include level options for colleague contacts", () => {
        const contacts = [makeContact({ kind: "colleague" } as any)];
        const result = generateContactSnippets(contacts);

        expect(result[0].parameters![0].options).not.toContain("Full Name (level)");
        expect(result[0].parameters![0].options).not.toContain("Nickname (level)");
    });

    it("should expand nickname format correctly", () => {
        const contacts = [makeContact()];
        const result = generateContactSnippets(contacts);

        const expanded = result[0].expand!({
            document: null,
            position: null,
            params: { format: "Nickname" },
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
            params: { format: "Full Name" },
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
            params: { format: "Full Name (title)" },
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
            params: { format: "Full Name (level)" },
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
            params: { format: "Full Name (level)" },
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

        expect(result[0].parameters![0].options).toContain("Id");
    });

    it("should expand alias format to contact id", () => {
        const contacts = [makeContact()];
        const result = generateContactSnippets(contacts);

        const expanded = result[0].expand!({
            document: null,
            position: null,
            params: { format: "Id" },
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

    function expand(contact: ResolvedContact, format: string): string {
        return generateContactSnippets([contact])[0].expand!({
            document: null,
            position: null,
            params: { format },
            contacts: [],
        } as any);
    }

    it("should expand nickname (title) format", () => {
        expect(expand(makeContact(), "Nickname (title)")).toBe("John (SDE 2)");
    });

    it("should expand nickname (id) format", () => {
        expect(expand(makeContact(), "Nickname (id)")).toBe("John (johnsmith)");
    });

    it("should expand full name (id) format", () => {
        expect(expand(makeContact(), "Full Name (id)")).toBe("John Smith (johnsmith)");
    });

    it("should expand nickname (level) format for report contacts", () => {
        expect(expand(makeContact(), "Nickname (level)")).toBe("John (L2)");
    });

    it("should fall back to fullName for nickname (level) on colleague contacts", () => {
        expect(expand(makeContact({ kind: "colleague" } as any), "Nickname (level)")).toBe("John Smith");
    });

    it("should use '?' when a report has no resolved career level", () => {
        expect(expand(makeContact({ resolvedCareerLevel: undefined } as any), "Full Name (level)")).toBe(
            "John Smith (?)",
        );
    });

    it("should expand the level-tenure format with elapsed time for report contacts", () => {
        const expanded = expand(makeContact(), "Full Name (level, for X months - since MM-dd-YYYY)");
        expect(expanded).toContain("John Smith (L2");
        expect(expanded).toContain("from: 2025-07-20");
    });

    it("should fall back to fullName for the level-tenure format on colleague contacts", () => {
        expect(
            expand(
                makeContact({ kind: "colleague" } as any),
                "Full Name (level, for X months - since MM-dd-YYYY)",
            ),
        ).toBe("John Smith");
    });

    it("should fall back to fullName for an unknown format", () => {
        expect(expand(makeContact(), "Totally Unknown Format")).toBe("John Smith");
    });
});
