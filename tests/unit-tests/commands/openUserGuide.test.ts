import { describe, it, expect, vi, beforeEach } from "vitest";
import { createOpenUserGuideCommand } from "../../../src/commands/openUserGuide";

const mockShowQuickPick = vi.fn();
const mockExecuteCommand = vi.fn();
const mockJoinPath = vi.fn((base: any, ...segments: string[]) => ({
    ...base,
    path: [base.path, ...segments].join("/"),
}));

vi.mock("vscode", () => ({
    window: {
        showQuickPick: (...args: any[]) => mockShowQuickPick(...args),
    },
    commands: {
        executeCommand: (...args: any[]) => mockExecuteCommand(...args),
    },
    Uri: {
        joinPath: (...args: any[]) => mockJoinPath(...args),
    },
}));

const extensionUri = { path: "/extension" } as any;

describe("createOpenUserGuideCommand", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockExecuteCommand.mockResolvedValue(undefined);
    });

    it("should return a function", () => {
        const handler = createOpenUserGuideCommand(extensionUri);
        expect(typeof handler).toBe("function");
    });

    describe("when sectionFile is provided", () => {
        it("should open the matched section without showing a quick-pick", async () => {
            const handler = createOpenUserGuideCommand(extensionUri);
            await handler("getting-started.md");
            expect(mockShowQuickPick).not.toHaveBeenCalled();
            expect(mockExecuteCommand).toHaveBeenCalledWith(
                "markdown.showPreview",
                expect.objectContaining({ path: "/extension/resources/docs/getting-started.md" })
            );
        });

        it("should open commands/index.md when that section is requested", async () => {
            const handler = createOpenUserGuideCommand(extensionUri);
            await handler("commands/index.md");
            expect(mockExecuteCommand).toHaveBeenCalledWith(
                "markdown.showPreview",
                expect.objectContaining({ path: "/extension/resources/docs/commands/index.md" })
            );
        });

        it("should fall back to the first item when sectionFile does not match any known section", async () => {
            const handler = createOpenUserGuideCommand(extensionUri);
            await handler("nonexistent.md");
            // Falls back to the first item: getting-started.md
            expect(mockExecuteCommand).toHaveBeenCalledWith(
                "markdown.showPreview",
                expect.objectContaining({ path: "/extension/resources/docs/getting-started.md" })
            );
        });
    });

    describe("when sectionFile is not provided", () => {
        it("should show a quick-pick with all documentation sections", async () => {
            mockShowQuickPick.mockResolvedValue(undefined); // user cancels
            const handler = createOpenUserGuideCommand(extensionUri);
            await handler();
            expect(mockShowQuickPick).toHaveBeenCalledWith(
                expect.arrayContaining([
                    expect.objectContaining({ label: "Getting Started" }),
                    expect.objectContaining({ label: "All Commands" }),
                    expect.objectContaining({ label: "FAQ & Troubleshooting" }),
                ]),
                expect.objectContaining({ title: "Memoria: User Guide" })
            );
        });

        it("should open the selected section when user picks one", async () => {
            mockShowQuickPick.mockResolvedValue({ label: "FAQ & Troubleshooting", file: "faq.md" });
            const handler = createOpenUserGuideCommand(extensionUri);
            await handler();
            expect(mockExecuteCommand).toHaveBeenCalledWith(
                "markdown.showPreview",
                expect.objectContaining({ path: "/extension/resources/docs/faq.md" })
            );
        });

        it("should return without opening anything when user dismisses the quick-pick", async () => {
            mockShowQuickPick.mockResolvedValue(undefined);
            const handler = createOpenUserGuideCommand(extensionUri);
            await handler();
            expect(mockExecuteCommand).not.toHaveBeenCalled();
        });
    });
});
