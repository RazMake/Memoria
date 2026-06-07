import { describe, it, expect, vi, beforeEach } from "vitest";

const activeTextEditorRef: { current: any } = { current: undefined };
const showInformationMessage = vi.fn();
const showWarningMessage = vi.fn();
const asRelativePath = vi.fn();
const writeFile = vi.fn().mockResolvedValue(undefined);

vi.mock("vscode", () => ({
    get window() {
        return {
            get activeTextEditor() {
                return activeTextEditorRef.current;
            },
            showInformationMessage: (...a: any[]) => showInformationMessage(...a),
            showWarningMessage: (...a: any[]) => showWarningMessage(...a),
        };
    },
    workspace: {
        asRelativePath: (...a: any[]) => asRelativePath(...a),
        fs: { writeFile: (...a: any[]) => writeFile(...a) },
    },
    Range: class {
        constructor(public start: any, public end: any) {}
    },
    Position: class {
        constructor(public line: number, public character: number) {}
    },
}));

vi.mock("../../../src/commands/commandHelpers", () => ({
    findInitializedRootSilently: vi.fn(),
}));

import {
    createExpandSnippetCommand,
    createResetSnippetCommand,
} from "../../../src/commands/snippetCommands";
import { findInitializedRootSilently } from "../../../src/commands/commandHelpers";

const ROOT = { path: "/ws", toString: () => "file:///ws" } as any;

function makeEditor(opts: {
    uri: string;
    cursorLine?: number;
    cursorChar?: number;
    lineText?: string;
    selectionEmpty?: boolean;
    selectedText?: string;
}) {
    const cursor = { line: opts.cursorLine ?? 0, character: opts.cursorChar ?? 0 };
    return {
        document: {
            uri: { toString: () => opts.uri },
            lineAt: vi.fn(() => ({ text: opts.lineText ?? "" })),
            getText: vi.fn(() => opts.selectedText ?? ""),
        },
        selection: {
            active: cursor,
            isEmpty: opts.selectionEmpty ?? true,
        },
        edit: vi.fn(async (cb: any) => {
            cb({ insert: vi.fn(), replace: vi.fn() });
            return true;
        }),
    };
}

beforeEach(() => {
    vi.clearAllMocks();
    activeTextEditorRef.current = undefined;
    writeFile.mockResolvedValue(undefined);
});

describe("createExpandSnippetCommand", () => {
    function makeSnippetsFeature(snippets: Array<{ trigger: string }>, expanded = "RESULT") {
        return {
            getAllSnippets: vi.fn().mockReturnValue(snippets),
            expandSnippet: vi.fn().mockResolvedValue(expanded),
        } as any;
    }

    it("does nothing when there is no active editor", async () => {
        const feature = makeSnippetsFeature([{ trigger: "now" }]);
        await createExpandSnippetCommand(feature)("now", "file:///doc");
        expect(feature.expandSnippet).not.toHaveBeenCalled();
    });

    it("does nothing when the active editor is a different document", async () => {
        activeTextEditorRef.current = makeEditor({ uri: "file:///other" });
        const feature = makeSnippetsFeature([{ trigger: "now" }]);
        await createExpandSnippetCommand(feature)("now", "file:///doc");
        expect(feature.expandSnippet).not.toHaveBeenCalled();
    });

    it("does nothing when the trigger has no matching snippet", async () => {
        activeTextEditorRef.current = makeEditor({ uri: "file:///doc" });
        const feature = makeSnippetsFeature([{ trigger: "other" }]);
        await createExpandSnippetCommand(feature)("now", "file:///doc");
        expect(feature.expandSnippet).not.toHaveBeenCalled();
    });

    it("inserts the expansion at the cursor when there is no stray brace", async () => {
        const editor = makeEditor({
            uri: "file:///doc",
            cursorLine: 0,
            cursorChar: 3,
            lineText: "abc",
        });
        activeTextEditorRef.current = editor;
        const feature = makeSnippetsFeature([{ trigger: "now" }], "2026-06-07");
        await createExpandSnippetCommand(feature)("now", "file:///doc");
        expect(feature.expandSnippet).toHaveBeenCalled();
        expect(editor.edit).toHaveBeenCalled();
    });

    it("replaces a stray closing brace when present at the cursor", async () => {
        const editor = makeEditor({
            uri: "file:///doc",
            cursorLine: 0,
            cursorChar: 0,
            lineText: "}rest",
        });
        activeTextEditorRef.current = editor;
        const feature = makeSnippetsFeature([{ trigger: "now" }]);
        await createExpandSnippetCommand(feature)("now", "file:///doc");
        expect(editor.edit).toHaveBeenCalled();
    });

    it("passes the selected text when the selection is non-empty", async () => {
        const editor = makeEditor({
            uri: "file:///doc",
            selectionEmpty: false,
            selectedText: "picked",
        });
        activeTextEditorRef.current = editor;
        const feature = makeSnippetsFeature([{ trigger: "wrap" }]);
        await createExpandSnippetCommand(feature)("wrap", "file:///doc");
        expect(feature.expandSnippet).toHaveBeenCalledWith(
            expect.anything(),
            editor.document,
            editor.selection.active,
            "picked",
        );
    });
});

describe("createResetSnippetCommand", () => {
    function makeManifest(data: any) {
        return { readManifest: vi.fn().mockResolvedValue(data) } as any;
    }
    function makeRegistry(content: Uint8Array | null) {
        return { getSeedFileContent: vi.fn().mockResolvedValue(content) } as any;
    }

    it("informs the user when no file is provided", async () => {
        const cmd = createResetSnippetCommand(makeManifest(null), makeRegistry(null));
        await cmd(undefined as any);
        expect(showInformationMessage).toHaveBeenCalledWith("Memoria: No file selected.");
    });

    it("returns silently when no initialized root is found", async () => {
        (findInitializedRootSilently as any).mockResolvedValue(null);
        const manifest = makeManifest(null);
        const cmd = createResetSnippetCommand(manifest, makeRegistry(null));
        await cmd({ path: "/ws/snip.md" } as any);
        expect(manifest.readManifest).not.toHaveBeenCalled();
    });

    it("returns when the manifest has no snippets", async () => {
        (findInitializedRootSilently as any).mockResolvedValue(ROOT);
        const cmd = createResetSnippetCommand(makeManifest({ snippets: undefined }), makeRegistry(null));
        await cmd({ path: "/ws/snip.md" } as any);
        expect(showInformationMessage).not.toHaveBeenCalled();
    });

    it("informs when the snippet was not shipped with the blueprint", async () => {
        (findInitializedRootSilently as any).mockResolvedValue(ROOT);
        asRelativePath.mockReturnValue("custom/snip.md");
        const manifest = makeManifest({
            snippets: {},
            fileManifest: { "other/file.md": "hash" },
            blueprintId: "bp",
        });
        const cmd = createResetSnippetCommand(manifest, makeRegistry(null));
        await cmd({ path: "/ws/custom/snip.md" } as any);
        expect(showInformationMessage).toHaveBeenCalledWith(
            expect.stringContaining("cannot be reset"),
        );
    });

    it("restores the original content for a blueprint-shipped snippet", async () => {
        (findInitializedRootSilently as any).mockResolvedValue(ROOT);
        asRelativePath.mockReturnValue("snippets/now.ts");
        const manifest = makeManifest({
            snippets: {},
            fileManifest: { "snippets/now.ts": "hash" },
            blueprintId: "bp",
        });
        const original = new TextEncoder().encode("export const now = 1;");
        const cmd = createResetSnippetCommand(manifest, makeRegistry(original));
        const uri = { path: "/ws/snippets/now.ts" } as any;
        await cmd(uri);
        expect(writeFile).toHaveBeenCalledWith(uri, original);
        expect(showInformationMessage).toHaveBeenCalledWith(
            expect.stringContaining("reset to default"),
        );
    });

    it("warns when the original seed content cannot be found", async () => {
        (findInitializedRootSilently as any).mockResolvedValue(ROOT);
        asRelativePath.mockReturnValue("snippets/now.ts");
        const manifest = makeManifest({
            snippets: {},
            fileManifest: { "snippets/now.ts": "hash" },
            blueprintId: "bp",
        });
        const cmd = createResetSnippetCommand(manifest, makeRegistry(null));
        await cmd({ path: "/ws/snippets/now.ts" } as any);
        expect(showWarningMessage).toHaveBeenCalledWith(
            expect.stringContaining("Could not reset snippet"),
        );
    });
});
