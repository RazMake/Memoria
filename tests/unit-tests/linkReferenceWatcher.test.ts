import { describe, it, expect, vi, beforeEach } from "vitest";
import * as vscode from "vscode";

vi.mock("vscode", () => ({
    workspace: {
        onDidRenameFiles: vi.fn(() => ({ dispose: vi.fn() })),
        findFiles: vi.fn().mockResolvedValue([]),
        fs: {
            stat: vi.fn(),
            readFile: vi.fn(),
            writeFile: vi.fn(),
        },
    },
    Uri: {
        joinPath: vi.fn((_base: any, ...parts: string[]) => ({
            toString: () => "file:///" + parts.join("/"),
            path: "/" + parts.join("/"),
        })),
    },
    FileType: { File: 1, Directory: 2 },
}));

import { registerLinkReferenceWatcher } from "../../src/linkReferenceWatcher";

describe("registerLinkReferenceWatcher", () => {
    let context: { subscriptions: { dispose: () => void }[] };
    let telemetry: { logUsage: ReturnType<typeof vi.fn>; logError: ReturnType<typeof vi.fn> };

    beforeEach(() => {
        vi.clearAllMocks();
        context = { subscriptions: [] };
        telemetry = { logUsage: vi.fn(), logError: vi.fn() };
    });

    it("should subscribe to onDidRenameFiles", () => {
        registerLinkReferenceWatcher(
            context as unknown as vscode.ExtensionContext,
            telemetry,
        );
        expect(vscode.workspace.onDidRenameFiles).toHaveBeenCalled();
    });

    it("should push a disposable to context.subscriptions", () => {
        registerLinkReferenceWatcher(
            context as unknown as vscode.ExtensionContext,
            telemetry,
        );
        expect(context.subscriptions).toHaveLength(1);
        expect(context.subscriptions[0]).toHaveProperty("dispose");
    });
});
