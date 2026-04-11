import { describe, it, expect, vi, beforeEach } from "vitest";
import {
    BlueprintDecorationProvider,
    matchesFilter,
} from "../../../../src/features/decorations/blueprintDecorationProvider";

// ────────────────────────────────────────────────────────────────────────────
// VS Code mock
// ────────────────────────────────────────────────────────────────────────────

const mockReadDecorations = vi.fn<any, any>();

vi.mock("vscode", () => ({
    EventEmitter: class {
        fire = vi.fn();
        event = vi.fn();
        dispose = vi.fn();
    },
    FileDecoration: class {
        constructor(
            public badge: string | undefined,
            public tooltip: string | undefined,
            public color: any
        ) {}
    },
    ThemeColor: class {
        constructor(public id: string) {}
    },
}));

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

const makeUri = (path: string) => ({ path } as any);

const makeManifest = () =>
    ({
        readDecorations: mockReadDecorations,
    }) as any;

const workspaceRoot = makeUri("/workspace");

const defaultRules = [
    { filter: "00-ToDo/", color: "charts.yellow", badge: "TD" },
    { filter: "04-Archive/", color: "charts.grey" },
    { filter: "*.todo", color: "charts.blue", badge: "TK" },
    { filter: "Notes/ReadMe.md" },
];

// ────────────────────────────────────────────────────────────────────────────
// matchesFilter (pure function — no mocks needed)
// ────────────────────────────────────────────────────────────────────────────

describe("matchesFilter", () => {
    describe("folder filters (ending with /)", () => {
        it("should match when the last path segment equals the folder name", () => {
            expect(matchesFilter("00-ToDo/", "00-ToDo")).toBe(true);
        });

        it("should match when the item is nested and the last segment equals the folder name", () => {
            expect(matchesFilter("00-ToDo/", "Parent/00-ToDo")).toBe(true);
        });

        it("should not match when the last segment differs", () => {
            expect(matchesFilter("00-ToDo/", "01-People")).toBe(false);
        });

        it("should not match a file whose name starts with the folder name", () => {
            expect(matchesFilter("00-ToDo/", "00-ToDo.md")).toBe(false);
        });
    });

    describe("wildcard extension filters (*.ext)", () => {
        it("should match a file with the specified extension", () => {
            expect(matchesFilter("*.todo", "00-ToDo/Main.todo")).toBe(true);
        });

        it("should match a file at the root with the specified extension", () => {
            expect(matchesFilter("*.todo", "Readme.todo")).toBe(true);
        });

        it("should not match a file with a different extension", () => {
            expect(matchesFilter("*.todo", "Readme.md")).toBe(false);
        });

        it("should not match when the extension appears in the middle of the filename", () => {
            expect(matchesFilter("*.todo", "todo.backup")).toBe(false);
        });
    });

    describe("exact path filters", () => {
        it("should match an exact workspace-relative path", () => {
            expect(matchesFilter("Notes/ReadMe.md", "Notes/ReadMe.md")).toBe(true);
        });

        it("should not match a different path", () => {
            expect(matchesFilter("Notes/ReadMe.md", "Notes/Other.md")).toBe(false);
        });
    });

    describe("propagate (folder filters only)", () => {
        it("should match the folder itself when propagate is true", () => {
            expect(matchesFilter("00-ToDo/", "00-ToDo", true)).toBe(true);
        });

        it("should match a direct child when propagate is true", () => {
            expect(matchesFilter("00-ToDo/", "00-ToDo/Main.todo", true)).toBe(true);
        });

        it("should match a deeply nested descendant when propagate is true", () => {
            expect(matchesFilter("00-ToDo/", "00-ToDo/Sub/Deep.md", true)).toBe(true);
        });

        it("should not match an unrelated path when propagate is true", () => {
            expect(matchesFilter("00-ToDo/", "01-People/Note.md", true)).toBe(false);
        });

        it("should not match children when propagate is false", () => {
            expect(matchesFilter("00-ToDo/", "00-ToDo/Main.todo", false)).toBe(false);
        });

        it("should not match children when propagate is omitted (default false)", () => {
            expect(matchesFilter("00-ToDo/", "00-ToDo/Main.todo")).toBe(false);
        });
    });
});

// ────────────────────────────────────────────────────────────────────────────
// BlueprintDecorationProvider
// ────────────────────────────────────────────────────────────────────────────

describe("BlueprintDecorationProvider", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    // ── refresh ──────────────────────────────────────────────────────────────

    describe("refresh", () => {
        it("should load decoration rules when enabled is true", async () => {
            mockReadDecorations.mockResolvedValue({ rules: defaultRules });

            const provider = new BlueprintDecorationProvider(makeManifest());
            await provider.refresh(workspaceRoot, true);

            expect(mockReadDecorations).toHaveBeenCalledWith(workspaceRoot);
        });

        it("should clear rules when root is null", async () => {
            const provider = new BlueprintDecorationProvider(makeManifest());
            await provider.refresh(null, false);

            expect(mockReadDecorations).not.toHaveBeenCalled();
            expect(provider.provideFileDecoration(makeUri("/workspace/00-ToDo"))).toBeUndefined();
        });

        it("should clear rules when enabled is false", async () => {
            mockReadDecorations.mockResolvedValue({ rules: defaultRules });

            const provider = new BlueprintDecorationProvider(makeManifest());
            // First load rules
            await provider.refresh(workspaceRoot, true);
            expect(provider.provideFileDecoration(makeUri("/workspace/00-ToDo"))).toBeDefined();

            // Then disable
            await provider.refresh(workspaceRoot, false);
            expect(provider.provideFileDecoration(makeUri("/workspace/00-ToDo"))).toBeUndefined();
        });

        it("should fire the change event after loading rules", async () => {
            mockReadDecorations.mockResolvedValue({ rules: defaultRules });

            const provider = new BlueprintDecorationProvider(makeManifest());
            await provider.refresh(workspaceRoot, true);

            const emitter = (provider as any)._onDidChangeFileDecorations;
            expect(emitter.fire).toHaveBeenCalledWith(undefined);
        });

        it("should fire the change event when disabling", async () => {
            const provider = new BlueprintDecorationProvider(makeManifest());
            await provider.refresh(workspaceRoot, false);

            const emitter = (provider as any)._onDidChangeFileDecorations;
            expect(emitter.fire).toHaveBeenCalledWith(undefined);
        });

        it("should treat missing decorations.json as empty rules", async () => {
            mockReadDecorations.mockResolvedValue(null);

            const provider = new BlueprintDecorationProvider(makeManifest());
            await provider.refresh(workspaceRoot, true);

            expect(provider.provideFileDecoration(makeUri("/workspace/00-ToDo"))).toBeUndefined();
        });
    });

    // ── provideFileDecoration ─────────────────────────────────────────────────

    describe("provideFileDecoration", () => {
        let provider: BlueprintDecorationProvider;

        beforeEach(async () => {
            mockReadDecorations.mockResolvedValue({ rules: defaultRules });

            provider = new BlueprintDecorationProvider(makeManifest());
            await provider.refresh(workspaceRoot, true);
        });

        it("should return undefined before refresh has been called", () => {
            const freshProvider = new BlueprintDecorationProvider(makeManifest());
            expect(freshProvider.provideFileDecoration(makeUri("/workspace/00-ToDo"))).toBeUndefined();
        });

        it("should return undefined for URIs outside the workspace root", () => {
            expect(provider.provideFileDecoration(makeUri("/other/00-ToDo"))).toBeUndefined();
        });

        it("should return undefined for the workspace root itself", () => {
            expect(provider.provideFileDecoration(makeUri("/workspace"))).toBeUndefined();
        });

        it("should apply a folder filter to a matching folder URI", () => {
            const decoration = provider.provideFileDecoration(makeUri("/workspace/00-ToDo"));
            expect(decoration).toBeDefined();
            expect(decoration?.badge).toBe("TD");
            expect((decoration?.color as any)?.id).toBe("charts.yellow");
        });

        it("should apply a folder filter with only color to a matching folder", () => {
            const decoration = provider.provideFileDecoration(makeUri("/workspace/04-Archive"));
            expect(decoration).toBeDefined();
            expect((decoration?.color as any)?.id).toBe("charts.grey");
            expect(decoration?.badge).toBeUndefined();
        });

        it("should apply a wildcard extension filter to a matching file", () => {
            const decoration = provider.provideFileDecoration(makeUri("/workspace/00-ToDo/Main.todo"));
            expect(decoration).toBeDefined();
            expect(decoration?.badge).toBe("TK");
            expect((decoration?.color as any)?.id).toBe("charts.blue");
        });

        it("should return undefined for items that match no rule", () => {
            expect(provider.provideFileDecoration(makeUri("/workspace/SomeOtherFolder"))).toBeUndefined();
        });

        it("should apply the first matching rule when multiple rules could match", async () => {
            // Re-initialize with a rule set where the folder rule comes first.
            mockReadDecorations.mockResolvedValue({
                rules: [
                    { filter: "Main.todo", color: "charts.red" },  // exact path — won't match full relative path
                    { filter: "*.todo", color: "charts.blue", badge: "TK" },
                ],
            });
            await provider.refresh(workspaceRoot, true);

            // The *.todo wildcard rule matches; the exact-path rule does not for a nested file.
            const decoration = provider.provideFileDecoration(makeUri("/workspace/00-ToDo/Main.todo"));
            expect((decoration?.color as any)?.id).toBe("charts.blue");
        });

        it("should return undefined when the rule has neither color, badge, nor tooltip", () => {
            // "Notes/ReadMe.md" rule has no color, badge, or tooltip.
            const decoration = provider.provideFileDecoration(makeUri("/workspace/Notes/ReadMe.md"));
            expect(decoration).toBeUndefined();
        });

        it("should match a nested folder by last segment name", () => {
            const decoration = provider.provideFileDecoration(makeUri("/workspace/03-MeetingNotes/00-ToDo"));
            expect(decoration).toBeDefined();
            expect(decoration?.badge).toBe("TD");
        });

        describe("tooltip", () => {
            it("should expose the tooltip on the returned decoration", async () => {
                mockReadDecorations.mockResolvedValue({
                    rules: [{ filter: "00-ToDo/", color: "charts.yellow", badge: "TD", tooltip: "Active tasks" }],
                });
                await provider.refresh(workspaceRoot, true);

                const decoration = provider.provideFileDecoration(makeUri("/workspace/00-ToDo"));
                expect(decoration?.tooltip).toBe("Active tasks");
            });

            it("should return a decoration for a tooltip-only rule (no color, no badge)", async () => {
                mockReadDecorations.mockResolvedValue({
                    rules: [{ filter: "00-ToDo/", tooltip: "Tasks folder" }],
                });
                await provider.refresh(workspaceRoot, true);

                const decoration = provider.provideFileDecoration(makeUri("/workspace/00-ToDo"));
                expect(decoration).toBeDefined();
                expect(decoration?.tooltip).toBe("Tasks folder");
                expect(decoration?.badge).toBeUndefined();
                expect(decoration?.color).toBeUndefined();
            });
        });

        describe("propagate", () => {
            it("should not decorate a child when propagate is omitted", async () => {
                mockReadDecorations.mockResolvedValue({
                    rules: [{ filter: "00-ToDo/", color: "charts.yellow", badge: "TD" }],
                });
                await provider.refresh(workspaceRoot, true);

                const decoration = provider.provideFileDecoration(makeUri("/workspace/00-ToDo/Main.todo"));
                expect(decoration).toBeUndefined();
            });

            it("should decorate the folder itself when propagate is true", async () => {
                mockReadDecorations.mockResolvedValue({
                    rules: [{ filter: "00-ToDo/", color: "charts.yellow", badge: "TD", propagate: true }],
                });
                await provider.refresh(workspaceRoot, true);

                const decoration = provider.provideFileDecoration(makeUri("/workspace/00-ToDo"));
                expect(decoration).toBeDefined();
                expect(decoration?.badge).toBe("TD");
            });

            it("should decorate a direct child when propagate is true", async () => {
                mockReadDecorations.mockResolvedValue({
                    rules: [{ filter: "00-ToDo/", color: "charts.yellow", badge: "TD", propagate: true }],
                });
                await provider.refresh(workspaceRoot, true);

                const decoration = provider.provideFileDecoration(makeUri("/workspace/00-ToDo/Main.todo"));
                expect(decoration).toBeDefined();
                expect(decoration?.badge).toBe("TD");
                expect((decoration?.color as any)?.id).toBe("charts.yellow");
            });

            it("should decorate a deeply nested descendant when propagate is true", async () => {
                mockReadDecorations.mockResolvedValue({
                    rules: [{ filter: "00-ToDo/", color: "charts.yellow", propagate: true }],
                });
                await provider.refresh(workspaceRoot, true);

                const decoration = provider.provideFileDecoration(makeUri("/workspace/00-ToDo/Sub/Deep.md"));
                expect(decoration).toBeDefined();
                expect((decoration?.color as any)?.id).toBe("charts.yellow");
            });

            it("should not decorate an unrelated item when propagate is true", async () => {
                mockReadDecorations.mockResolvedValue({
                    rules: [{ filter: "00-ToDo/", color: "charts.yellow", propagate: true }],
                });
                await provider.refresh(workspaceRoot, true);

                const decoration = provider.provideFileDecoration(makeUri("/workspace/01-People/Note.md"));
                expect(decoration).toBeUndefined();
            });
        });
    });

    // ── dispose ───────────────────────────────────────────────────────────────

    describe("dispose", () => {
        it("should dispose the internal EventEmitter", () => {
            const provider = new BlueprintDecorationProvider(makeManifest());
            provider.dispose();

            const emitter = (provider as any)._onDidChangeFileDecorations;
            expect(emitter.dispose).toHaveBeenCalled();
        });
    });
});
