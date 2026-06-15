import { describe, it, expect, vi, beforeEach } from "vitest";
import * as pathPosix from "path";
import * as vscode from "vscode";

vi.mock("vscode", () => ({
    workspace: {
        onDidRenameFiles: vi.fn(() => ({ dispose: vi.fn() })),
        findFiles: vi.fn().mockResolvedValue([]),
        fs: {
            stat: vi.fn(),
            readFile: vi.fn(),
            writeFile: vi.fn().mockResolvedValue(undefined),
        },
    },
    Uri: {
        // Functional joinPath so parent-directory ("..") resolution works for mdDir computation.
        joinPath: (base: any, ...parts: string[]) => {
            const joined = pathPosix.posix.join(base.path, ...parts);
            return { path: joined, toString: () => `file://${joined}` };
        },
    },
    FileType: { File: 1, Directory: 2 },
}));

import { registerLinkReferenceWatcher } from "../../src/linkReferenceWatcher";

function uri(p: string): any {
    return { path: p, toString: () => `file://${p}` };
}

function flush(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("registerLinkReferenceWatcher", () => {
    let context: { subscriptions: { dispose: () => void }[] };
    let telemetry: { logUsage: ReturnType<typeof vi.fn>; logError: ReturnType<typeof vi.fn> };

    beforeEach(() => {
        vi.clearAllMocks();
        (vscode.workspace.fs.writeFile as any).mockResolvedValue(undefined);
        context = { subscriptions: [] };
        telemetry = { logUsage: vi.fn(), logError: vi.fn() };
    });

    function getHandler(): (event: any) => void {
        registerLinkReferenceWatcher(
            context as unknown as vscode.ExtensionContext,
            telemetry as any,
        );
        return (vscode.workspace.onDidRenameFiles as any).mock.calls[0][0];
    }

    it("subscribes to onDidRenameFiles and registers a disposable", () => {
        getHandler();
        expect(vscode.workspace.onDidRenameFiles).toHaveBeenCalled();
        expect(context.subscriptions).toHaveLength(1);
        expect(context.subscriptions[0]).toHaveProperty("dispose");
    });

    it("updates links in markdown files on a file rename and logs usage", async () => {
        const oldUri = uri("/ws/Notes/old.md");
        const newUri = uri("/ws/Notes/new.md");
        const indexMd = uri("/ws/index.md");

        (vscode.workspace.fs.stat as any).mockResolvedValue({ type: 1 }); // File
        (vscode.workspace.findFiles as any).mockResolvedValue([indexMd, newUri]);
        (vscode.workspace.fs.readFile as any).mockImplementation((u: any) => {
            if (u.path === "/ws/index.md") {
                return Promise.resolve(new TextEncoder().encode("See [old](Notes/old.md) here."));
            }
            return Promise.reject(new Error("unexpected read"));
        });

        const handler = getHandler();
        handler({ files: [{ oldUri, newUri }] });
        await flush();

        expect(vscode.workspace.fs.writeFile).toHaveBeenCalledTimes(1);
        const written = new TextDecoder().decode(
            (vscode.workspace.fs.writeFile as any).mock.calls[0][1],
        );
        expect(written).toBe("See [old](Notes/new.md) here.");
        expect(telemetry.logUsage).toHaveBeenCalledWith(
            "linkReference.renameUpdated",
            expect.objectContaining({ fileCount: 1, linkCount: 1 }),
        );
    });

    it("updates link prefixes on a folder rename", async () => {
        const oldUri = uri("/ws/Old");
        const newUri = uri("/ws/New");
        const indexMd = uri("/ws/index.md");

        (vscode.workspace.fs.stat as any).mockResolvedValue({ type: 2 }); // Directory
        (vscode.workspace.findFiles as any).mockResolvedValue([indexMd]);
        (vscode.workspace.fs.readFile as any).mockResolvedValue(
            new TextEncoder().encode("Link [a](Old/a.md) and [b](Old/sub/b.md)."),
        );

        const handler = getHandler();
        handler({ files: [{ oldUri, newUri }] });
        await flush();

        const written = new TextDecoder().decode(
            (vscode.workspace.fs.writeFile as any).mock.calls[0][1],
        );
        expect(written).toBe("Link [a](New/a.md) and [b](New/sub/b.md).");
        expect(telemetry.logUsage).toHaveBeenCalledWith(
            "linkReference.renameUpdated",
            expect.objectContaining({ fileCount: 1, linkCount: 2 }),
        );
    });

    it("does not write or log usage when no links match", async () => {
        const oldUri = uri("/ws/Notes/old.md");
        const newUri = uri("/ws/Notes/new.md");
        const indexMd = uri("/ws/index.md");

        (vscode.workspace.fs.stat as any).mockResolvedValue({ type: 1 });
        (vscode.workspace.findFiles as any).mockResolvedValue([indexMd]);
        (vscode.workspace.fs.readFile as any).mockResolvedValue(
            new TextEncoder().encode("No links here at all."),
        );

        const handler = getHandler();
        handler({ files: [{ oldUri, newUri }] });
        await flush();

        expect(vscode.workspace.fs.writeFile).not.toHaveBeenCalled();
        expect(telemetry.logUsage).not.toHaveBeenCalled();
    });

    it("logs an error when stat fails for a renamed entry", async () => {
        const oldUri = uri("/ws/Notes/old.md");
        const newUri = uri("/ws/Notes/new.md");

        (vscode.workspace.fs.stat as any).mockRejectedValue(new Error("ENOENT"));

        const handler = getHandler();
        handler({ files: [{ oldUri, newUri }] });
        await flush();

        expect(telemetry.logError).toHaveBeenCalledWith(
            "linkReference.renameFailed",
            expect.objectContaining({ message: "ENOENT" }),
        );
        expect(vscode.workspace.fs.writeFile).not.toHaveBeenCalled();
    });

    it("silently skips individual files whose read fails", async () => {
        const oldUri = uri("/ws/Notes/old.md");
        const newUri = uri("/ws/Notes/new.md");
        const goodMd = uri("/ws/good.md");
        const badMd = uri("/ws/bad.md");

        (vscode.workspace.fs.stat as any).mockResolvedValue({ type: 1 });
        (vscode.workspace.findFiles as any).mockResolvedValue([badMd, goodMd]);
        (vscode.workspace.fs.readFile as any).mockImplementation((u: any) => {
            if (u.path === "/ws/bad.md") return Promise.reject(new Error("read fail"));
            return Promise.resolve(new TextEncoder().encode("[x](Notes/old.md)"));
        });

        const handler = getHandler();
        handler({ files: [{ oldUri, newUri }] });
        await flush();

        // Only the good file is written; the bad read is swallowed.
        expect(vscode.workspace.fs.writeFile).toHaveBeenCalledTimes(1);
    });

    it("logs non-Error thrown value as string in error handler", async () => {
        // This covers the `String(err)` branch when err is not an Error instance
        const oldUri = uri("/ws/Notes/old.md");
        const newUri = uri("/ws/Notes/new.md");

        // Throw a plain string (not an Error instance)
        (vscode.workspace.fs.stat as any).mockRejectedValue("stat failed with string");

        const handler = getHandler();
        handler({ files: [{ oldUri, newUri }] });
        await flush();

        expect(telemetry.logError).toHaveBeenCalledWith(
            "linkReference.renameFailed",
            expect.objectContaining({ message: "stat failed with string" }),
        );
    });

    it("does not write when folder rename has no matching links", async () => {
        // This covers the false branch of `if (updated !== null)` in handleFolderRename
        const oldUri = uri("/ws/OldFolder");
        const newUri = uri("/ws/NewFolder");
        const indexMd = uri("/ws/index.md");

        (vscode.workspace.fs.stat as any).mockResolvedValue({ type: 2 }); // Directory
        (vscode.workspace.findFiles as any).mockResolvedValue([indexMd]);
        // File has no links with OldFolder prefix
        (vscode.workspace.fs.readFile as any).mockResolvedValue(
            new TextEncoder().encode("No matching links in this file."),
        );

        const handler = getHandler();
        handler({ files: [{ oldUri, newUri }] });
        await flush();

        expect(vscode.workspace.fs.writeFile).not.toHaveBeenCalled();
    });
});
