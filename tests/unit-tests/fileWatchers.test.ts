import { describe, it, expect, vi, beforeEach } from "vitest";

interface RecordedHandler {
    glob: string;
    kind: "create" | "change" | "delete";
    cb: () => void;
}

const recorded: RecordedHandler[] = [];
let deleteFilesCb: ((e: any) => void) | undefined;
const executeCommand = vi.fn().mockResolvedValue(undefined);

function makeWatcher(glob: string) {
    return {
        onDidCreate: (cb: () => void) => recorded.push({ glob, kind: "create", cb }),
        onDidChange: (cb: () => void) => recorded.push({ glob, kind: "change", cb }),
        onDidDelete: (cb: () => void) => recorded.push({ glob, kind: "delete", cb }),
        dispose: vi.fn(),
    };
}

vi.mock("vscode", () => ({
    commands: { executeCommand: (...a: any[]) => executeCommand(...a) },
    workspace: {
        createFileSystemWatcher: (pattern: any) => makeWatcher(pattern.pattern),
        onDidDeleteFiles: (cb: any) => {
            deleteFilesCb = cb;
            return { dispose: vi.fn() };
        },
    },
    RelativePattern: class {
        constructor(public base: any, public pattern: string) {}
    },
}));

vi.mock("../../src/blueprintUpdateCheck", () => ({
    updateWorkspaceInitializedContext: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../src/defaultFileContext", () => ({
    updateDefaultFileContext: vi.fn().mockResolvedValue(undefined),
    registerDefaultFileWatcher: vi.fn().mockResolvedValue(undefined),
}));

import { registerFileWatchers, refreshWorkspaceState } from "../../src/fileWatchers";
import { updateWorkspaceInitializedContext } from "../../src/blueprintUpdateCheck";
import { updateDefaultFileContext } from "../../src/defaultFileContext";

function flush(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 0));
}

const ROOT = { toString: () => "file:///ws" } as any;

function makeContext() {
    return { subscriptions: [] as any[] } as any;
}

describe("refreshWorkspaceState", () => {
    beforeEach(() => vi.clearAllMocks());

    it("updates context, features, and default file context together", async () => {
        const featureManager = { refresh: vi.fn().mockResolvedValue(undefined) } as any;
        const manifest = {} as any;
        await refreshWorkspaceState(ROOT, [ROOT], manifest, featureManager);
        expect(updateWorkspaceInitializedContext).toHaveBeenCalledWith(ROOT);
        expect(featureManager.refresh).toHaveBeenCalledWith(ROOT);
        expect(updateDefaultFileContext).toHaveBeenCalledWith(ROOT, [ROOT], manifest);
    });
});

describe("registerFileWatchers", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        recorded.length = 0;
        deleteFilesCb = undefined;
    });

    function handlersFor(glob: string, kind: RecordedHandler["kind"]) {
        return recorded.filter((r) => r.glob === glob && r.kind === kind);
    }

    it("registers watchers for blueprint.json, decorations.json, and file deletions", () => {
        const featureManager = { refresh: vi.fn().mockResolvedValue(undefined) } as any;
        const manifest = { findInitializedRoot: vi.fn().mockResolvedValue(null) } as any;
        const ctx = makeContext();

        registerFileWatchers(ctx, [ROOT], manifest, featureManager, null, {} as any);

        expect(handlersFor(".memoria/blueprint.json", "create")).toHaveLength(1);
        expect(handlersFor(".memoria/blueprint.json", "delete")).toHaveLength(1);
        expect(handlersFor(".memoria/decorations.json", "change")).toHaveLength(1);
        expect(deleteFilesCb).toBeTypeOf("function");
        // Two watchers + one onDidDeleteFiles disposable.
        expect(ctx.subscriptions.length).toBe(3);
    });

    it("refreshes when the initialized root changes and short-circuits when unchanged", async () => {
        const featureManager = { refresh: vi.fn().mockResolvedValue(undefined) } as any;
        const newRoot = { toString: () => "file:///ws" } as any;
        const manifest = { findInitializedRoot: vi.fn().mockResolvedValue(newRoot) } as any;

        registerFileWatchers(makeContext(), [ROOT], manifest, featureManager, null, {} as any);
        const recheck = handlersFor(".memoria/blueprint.json", "create")[0]!.cb;

        recheck();
        await flush();
        expect(updateWorkspaceInitializedContext).toHaveBeenCalledWith(newRoot);
        const callsAfterFirst = featureManager.refresh.mock.calls.length;

        // Second invocation: root unchanged → short-circuit, no extra refresh.
        recheck();
        await flush();
        expect(featureManager.refresh.mock.calls.length).toBe(callsAfterFirst);
    });

    it("refreshes features when decorations.json changes without changing the root", async () => {
        const featureManager = { refresh: vi.fn().mockResolvedValue(undefined) } as any;
        const manifest = { findInitializedRoot: vi.fn().mockResolvedValue(ROOT) } as any;

        registerFileWatchers(makeContext(), [ROOT], manifest, featureManager, ROOT, {} as any);
        const onDecChange = handlersFor(".memoria/decorations.json", "change")[0]!.cb;

        onDecChange();
        await flush();
        expect(featureManager.refresh).toHaveBeenCalledWith(ROOT);
    });

    it("rechecks initialization only when a deletion affects the .memoria folder", async () => {
        const featureManager = { refresh: vi.fn().mockResolvedValue(undefined) } as any;
        const changedRoot = { toString: () => "file:///ws-other" } as any;
        const manifest = { findInitializedRoot: vi.fn().mockResolvedValue(changedRoot) } as any;

        registerFileWatchers(makeContext(), [ROOT], manifest, featureManager, null, {} as any);

        // Unrelated deletion → ignored.
        deleteFilesCb!({ files: [{ path: "/ws/Notes/a.md" }] });
        await flush();
        expect(featureManager.refresh).not.toHaveBeenCalled();

        // .memoria deletion → triggers recheck.
        deleteFilesCb!({ files: [{ path: "/ws/.memoria/blueprint.json" }] });
        await flush();
        expect(featureManager.refresh).toHaveBeenCalledWith(changedRoot);
    });

    it("detects deletion of the .memoria directory itself", async () => {
        const featureManager = { refresh: vi.fn().mockResolvedValue(undefined) } as any;
        const changedRoot = { toString: () => "file:///ws-other" } as any;
        const manifest = { findInitializedRoot: vi.fn().mockResolvedValue(changedRoot) } as any;

        registerFileWatchers(makeContext(), [ROOT], manifest, featureManager, null, {} as any);

        deleteFilesCb!({ files: [{ path: "/ws/.memoria" }] });
        await flush();
        expect(featureManager.refresh).toHaveBeenCalledWith(changedRoot);
    });
});
