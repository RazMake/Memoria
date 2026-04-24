import { beforeEach, describe, expect, it, vi } from "vitest";

const encoder = new TextEncoder();

interface MockUri {
    path: string;
}

const mockReadFile = vi.fn<(uri: MockUri) => Promise<Uint8Array>>();
const mockReadDirectory = vi.fn<(uri: MockUri) => Promise<readonly [string, number][]>>();

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
            readFile: (...args: [MockUri]) => mockReadFile(...args),
            readDirectory: (...args: [MockUri]) => mockReadDirectory(...args),
        },
    },
}));

import {
    loadGroups,
    loadReferenceData,
    readDirectorySafe,
    readTextFile,
} from "../../../../src/features/contacts/contactFileLoader";
import type { ContactGroup as BlueprintContactGroup } from "../../../../src/blueprints/types";

const fakeFs = {
    readFile: mockReadFile,
    readDirectory: mockReadDirectory,
} as unknown as typeof import("vscode").workspace.fs;

function uri(path: string): MockUri {
    return { path };
}

describe("contactFileLoader", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe("readTextFile", () => {
        it("should decode file content as UTF-8", async () => {
            const content = "Hello, world!";
            mockReadFile.mockResolvedValue(encoder.encode(content));

            const result = await readTextFile(fakeFs, uri("/test.md") as any);

            expect(result).toBe("Hello, world!");
        });

        it("should return empty string when file not found", async () => {
            mockReadFile.mockRejectedValue(new Error("not found"));

            const result = await readTextFile(fakeFs, uri("/missing.md") as any);

            expect(result).toBe("");
        });
    });

    describe("readDirectorySafe", () => {
        it("should list directory entries", async () => {
            const entries: [string, number][] = [
                ["file.md", 1],
                ["subfolder", 2],
            ];
            mockReadDirectory.mockResolvedValue(entries);

            const result = await readDirectorySafe(fakeFs, uri("/dir") as any);

            expect(result).toEqual(entries);
        });

        it("should return empty array on error", async () => {
            mockReadDirectory.mockRejectedValue(new Error("access denied"));

            const result = await readDirectorySafe(fakeFs, uri("/missing") as any);

            expect(result).toEqual([]);
        });
    });

    describe("loadReferenceData", () => {
        it("should parse pronouns, career paths, career levels, and interview types", async () => {
            const pronounsText = [
                "# she/her",
                "- Subject: she",
                "- Object: her",
                "- PossessiveAdjective: her",
                "- Possessive: hers",
                "- Reflexive: herself",
            ].join("\n");
            const careerLevelsText = [
                "# l3",
                "- Id: 63",
                "- InterviewType: technical",
                "- TitlePattern: {careerPath} 2",
            ].join("\n");
            const careerPathsText = [
                "# sde",
                "- Name: Software Development Engineer",
                "- Short: SDE",
                "- MinimumCareerLevel: 59",
            ].join("\n");
            const interviewTypesText = [
                "# technical",
                "- Name: Technical Interview",
            ].join("\n");

            mockReadFile.mockImplementation(async (fileUri: MockUri) => {
                if (fileUri.path.endsWith("Pronouns.md")) {
                    return encoder.encode(pronounsText);
                }
                if (fileUri.path.endsWith("CareerLevels.md")) {
                    return encoder.encode(careerLevelsText);
                }
                if (fileUri.path.endsWith("CareerPaths.md")) {
                    return encoder.encode(careerPathsText);
                }
                if (fileUri.path.endsWith("InterviewTypes.md")) {
                    return encoder.encode(interviewTypesText);
                }
                throw new Error("not found");
            });

            const result = await loadReferenceData(fakeFs, uri("/people") as any);

            expect(result.pronouns).toHaveLength(1);
            expect(result.pronouns[0].key).toBe("she/her");
            expect(result.pronouns[0].subject).toBe("she");
            expect(result.careerLevels).toHaveLength(1);
            expect(result.careerLevels[0].key).toBe("l3");
            expect(result.careerLevels[0].id).toBe(63);
            expect(result.careerPaths).toHaveLength(1);
            expect(result.careerPaths[0].key).toBe("sde");
            expect(result.careerPaths[0].name).toBe("Software Development Engineer");
            expect(result.interviewTypes).toHaveLength(1);
            expect(result.interviewTypes[0].key).toBe("technical");
        });

        it("should handle missing reference data files gracefully", async () => {
            mockReadFile.mockRejectedValue(new Error("not found"));

            const result = await loadReferenceData(fakeFs, uri("/people") as any);

            expect(result.pronouns).toEqual([]);
            expect(result.careerLevels).toEqual([]);
            expect(result.careerPaths).toEqual([]);
            expect(result.interviewTypes).toEqual([]);
        });
    });

    describe("loadGroups", () => {
        it("should load blueprint groups from disk", async () => {
            const blueprintGroups: BlueprintContactGroup[] = [
                { file: "Team.md", type: "report" },
            ];
            const teamText = [
                "# alice",
                "- Nickname: Alice",
                "- FullName: Alice Anderson",
                "- Title: SDE 2",
                "- CareerPathKey: sde",
                "- LevelId: l3",
                "- LevelStartDate: 2025-06-01",
                "- PronounsKey: she/her",
            ].join("\n");

            mockReadDirectory.mockResolvedValue([["Team.md", 1]]);
            mockReadFile.mockResolvedValue(encoder.encode(teamText));

            const groups = await loadGroups(fakeFs, uri("/people") as any, blueprintGroups);

            expect(groups).toHaveLength(1);
            expect(groups[0].file).toBe("Team.md");
            expect(groups[0].name).toBe("Team");
            expect(groups[0].type).toBe("report");
            expect(groups[0].isCustom).toBe(false);
            expect(groups[0].document.contacts).toHaveLength(1);
            expect(groups[0].document.contacts[0].id).toBe("alice");
        });

        it("should discover custom groups that are not in the blueprint", async () => {
            const blueprintGroups: BlueprintContactGroup[] = [
                { file: "Team.md", type: "report" },
            ];
            const customText = [
                "# bob",
                "- Nickname: Bob",
                "- FullName: Bob Baker",
                "- Title: PM",
                "- CareerPathKey: pm",
                "- PronounsKey: he/him",
            ].join("\n");

            mockReadDirectory.mockResolvedValue([
                ["Team.md", 1],
                ["Partners.md", 1],
            ]);
            mockReadFile.mockImplementation(async (fileUri: MockUri) => {
                if (fileUri.path.endsWith("Partners.md")) {
                    return encoder.encode(customText);
                }
                return encoder.encode("");
            });

            const groups = await loadGroups(fakeFs, uri("/people") as any, blueprintGroups);

            const customGroup = groups.find((g) => g.isCustom);
            expect(customGroup).toBeDefined();
            expect(customGroup!.file).toBe("Partners.md");
            expect(customGroup!.name).toBe("Partners");
            expect(customGroup!.type).toBe("colleague");
            expect(customGroup!.isCustom).toBe(true);
            expect(customGroup!.document.contacts).toHaveLength(1);
        });

        it("should ignore non-markdown files in the directory", async () => {
            mockReadDirectory.mockResolvedValue([
                ["notes.txt", 1],
                ["image.png", 1],
            ]);

            const groups = await loadGroups(fakeFs, uri("/people") as any, []);

            expect(groups).toHaveLength(0);
        });
    });
});
