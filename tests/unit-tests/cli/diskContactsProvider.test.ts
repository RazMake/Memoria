import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock fs module
const existsSyncMock = vi.fn();
const readFileSyncMock = vi.fn();
const readdirSyncMock = vi.fn();

vi.mock("fs", () => ({
    existsSync: (...a: any[]) => existsSyncMock(...a),
    readFileSync: (...a: any[]) => readFileSyncMock(...a),
    readdirSync: (...a: any[]) => readdirSyncMock(...a),
}));

import { DiskContactsProvider } from "../../../src/cli/diskContactsProvider";

const WORKSPACE = "/workspace";
const PEOPLE_FOLDER = "People";

function makeProvider(groups: Array<{ file: string; type: "report" | "colleague" | "custom" }> = []) {
    return new DiskContactsProvider(WORKSPACE, PEOPLE_FOLDER, groups);
}

describe("DiskContactsProvider", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        existsSyncMock.mockReturnValue(false);
        readFileSyncMock.mockReturnValue("");
    });

    describe("load()", () => {
        it("sets available=true on successful load with no groups", async () => {
            const provider = makeProvider([]);
            await provider.load();
            expect(provider.isAvailable()).toBe(true);
        });

        it("sets available=false when an error occurs during load", async () => {
            existsSyncMock.mockReturnValue(true);
            readFileSyncMock.mockImplementation(() => {
                throw new Error("IO error");
            });

            const provider = makeProvider([{ file: "Team.md", type: "report" }]);
            await provider.load();
            expect(provider.isAvailable()).toBe(false);
        });

        it("skips group file when it does not exist", async () => {
            existsSyncMock.mockReturnValue(false);
            const provider = makeProvider([{ file: "Team.md", type: "report" }]);
            await provider.load();
            expect(provider.listGroups()).toEqual([]);
            expect(provider.isAvailable()).toBe(true);
        });

        it("loads a group file when it exists", async () => {
            existsSyncMock.mockImplementation((p: string) => {
                return p.includes("Team.md") || p.endsWith("DataTypes");
            });
            readFileSyncMock.mockReturnValue(`
## Team

- FullName: Alice
  Nickname: Alice
  Title: Engineer
  CareerPath: SWE
  Pronouns: they/them
`);

            const provider = makeProvider([{ file: "Team.md", type: "report" }]);
            await provider.load();
            expect(provider.listGroups()).toContain("Team");
        });

        it("loads Me.md when it exists", async () => {
            existsSyncMock.mockImplementation((p: string) => p.includes("Me.md"));
            readFileSyncMock.mockImplementation((p: string) => {
                if (p.includes("Me.md")) {
                    return "- FullName: Alice Manager\n- TeamName: Engineering\n";
                }
                return "";
            });

            const provider = makeProvider([]);
            await provider.load();
            const me = provider.getMe();
            expect(me).not.toBeNull();
            expect(me?.["FullName"]).toBe("Alice Manager");
        });

        it("leaves Me profile null when Me.md does not exist", async () => {
            existsSyncMock.mockReturnValue(false);
            const provider = makeProvider([]);
            await provider.load();
            expect(provider.getMe()).toBeNull();
        });
    });

    describe("listGroups()", () => {
        it("returns empty array before load", () => {
            const provider = makeProvider();
            expect(provider.listGroups()).toEqual([]);
        });

        it("returns loaded group names after load", async () => {
            existsSyncMock.mockImplementation((p: string) => p.includes("Team.md") || p.includes("Staff.md"));
            readFileSyncMock.mockReturnValue("## Group\n");

            const provider = makeProvider([
                { file: "Team.md", type: "report" },
                { file: "Staff.md", type: "colleague" },
            ]);
            await provider.load();
            const groups = provider.listGroups();
            expect(groups).toContain("Team");
            expect(groups).toContain("Staff");
        });
    });

    describe("getGroupContacts()", () => {
        it("returns empty array for unknown group", async () => {
            const provider = makeProvider();
            await provider.load();
            expect(provider.getGroupContacts("Unknown")).toEqual([]);
        });
    });

    describe("isAvailable()", () => {
        it("returns false before load", () => {
            expect(makeProvider().isAvailable()).toBe(false);
        });
    });

    describe("loadReferenceData()", () => {
        it("returns empty reference data when DataTypes directory does not exist", async () => {
            existsSyncMock.mockReturnValue(false);
            const provider = makeProvider([{ file: "Team.md", type: "report" }]);
            // Team.md also doesn't exist so no contacts loaded, but load should succeed
            await provider.load();
            expect(provider.isAvailable()).toBe(true);
        });

        it("handles parse errors in DataTypes files gracefully", async () => {
            existsSyncMock.mockImplementation((p: string) => p.includes("Pronouns.md"));
            readFileSyncMock.mockImplementation((p: string) => {
                if (p.includes("Pronouns.md")) {
                    throw new Error("parse error");
                }
                return "";
            });

            const provider = makeProvider([]);
            await provider.load();
            expect(provider.isAvailable()).toBe(true);
        });

        it("loads reference data files when they exist", async () => {
            existsSyncMock.mockImplementation((p: string) =>
                p.includes("Pronouns.md") ||
                p.includes("CareerLevels.md") ||
                p.includes("CareerPaths.md")
            );
            readFileSyncMock.mockImplementation((p: string) => {
                if (p.includes("Pronouns.md")) return "## Pronouns\n\n- they/them:\n  Subject: they\n  Object: them\n";
                if (p.includes("CareerLevels.md")) return "## Levels\n";
                if (p.includes("CareerPaths.md")) return "## Paths\n";
                return "";
            });

            const provider = makeProvider([]);
            await provider.load();
            expect(provider.isAvailable()).toBe(true);
        });
    });

    describe("fromBlueprintManifest()", () => {
        it("returns null when blueprint.json does not exist", () => {
            existsSyncMock.mockReturnValue(false);
            const result = DiskContactsProvider.fromBlueprintManifest(WORKSPACE);
            expect(result).toBeNull();
        });

        it("returns null when contacts.peopleFolder is missing", () => {
            existsSyncMock.mockReturnValue(true);
            readFileSyncMock.mockReturnValue(JSON.stringify({ contacts: {} }));
            const result = DiskContactsProvider.fromBlueprintManifest(WORKSPACE);
            expect(result).toBeNull();
        });

        it("returns null when contacts config is missing", () => {
            existsSyncMock.mockReturnValue(true);
            readFileSyncMock.mockReturnValue(JSON.stringify({ snippets: {} }));
            const result = DiskContactsProvider.fromBlueprintManifest(WORKSPACE);
            expect(result).toBeNull();
        });

        it("returns a DiskContactsProvider when config is valid", () => {
            existsSyncMock.mockReturnValue(true);
            readFileSyncMock.mockReturnValue(JSON.stringify({
                contacts: {
                    peopleFolder: "People",
                    groups: [{ file: "Team.md", type: "report" }],
                },
            }));
            const result = DiskContactsProvider.fromBlueprintManifest(WORKSPACE);
            expect(result).toBeInstanceOf(DiskContactsProvider);
        });

        it("returns a provider with empty groups when groups array is absent", () => {
            existsSyncMock.mockReturnValue(true);
            readFileSyncMock.mockReturnValue(JSON.stringify({
                contacts: {
                    peopleFolder: "People",
                },
            }));
            const result = DiskContactsProvider.fromBlueprintManifest(WORKSPACE);
            expect(result).toBeInstanceOf(DiskContactsProvider);
        });

        it("returns null on JSON parse error", () => {
            existsSyncMock.mockReturnValue(true);
            readFileSyncMock.mockReturnValue("not valid json{{{");
            const result = DiskContactsProvider.fromBlueprintManifest(WORKSPACE);
            expect(result).toBeNull();
        });
    });
});
