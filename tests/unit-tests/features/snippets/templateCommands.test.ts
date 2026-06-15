import { describe, it, expect, vi, beforeEach } from "vitest";

const showInformationMessage = vi.fn();
const showWarningMessage = vi.fn();
const showQuickPick = vi.fn();
const showInputBox = vi.fn();
const openTextDocument = vi.fn();
const showTextDocument = vi.fn();
const clipboardWriteText = vi.fn();
const activeTextEditorRef: { current: any } = { current: undefined };
const editSpy = vi.fn();

vi.mock("vscode", () => ({
    window: {
        get activeTextEditor() {
            return activeTextEditorRef.current;
        },
        showInformationMessage: (...a: any[]) => showInformationMessage(...a),
        showWarningMessage: (...a: any[]) => showWarningMessage(...a),
        showQuickPick: (...a: any[]) => showQuickPick(...a),
        showInputBox: (...a: any[]) => showInputBox(...a),
        showTextDocument: (...a: any[]) => showTextDocument(...a),
    },
    workspace: {
        openTextDocument: (...a: any[]) => openTextDocument(...a),
    },
    env: {
        clipboard: {
            writeText: (...a: any[]) => clipboardWriteText(...a),
        },
    },
    Position: class {
        constructor(public line: number, public character: number) {}
    },
    Range: class {
        constructor(public start: any, public end: any) {}
    },
}));

import {
    createExpandTemplateCommand,
    createInsertTemplateCommand,
    createRenderTemplateToFileCommand,
    createRenderTemplateToClipboardCommand,
} from "../../../../src/features/snippets/templateCommands";
import type { TemplateProvider } from "../../../../src/features/snippets/templateCommands";

// Mock renderTemplate to avoid running the template engine
vi.mock("../../../../src/features/snippets/templates/templateEngine", () => ({
    renderTemplate: vi.fn(),
}));

// Mock VsCodeInputResolver
vi.mock("../../../../src/features/snippets/vscodeInputResolver", () => ({
    VsCodeInputResolver: class {
        resolve() { return Promise.resolve(undefined); }
    },
}));

import { renderTemplate } from "../../../../src/features/snippets/templates/templateEngine";

const renderTemplateMock = renderTemplate as ReturnType<typeof vi.fn>;

function makeProvider(overrides: Partial<TemplateProvider> = {}): TemplateProvider {
    return {
        listTemplates: () => [
            { relativePath: "my-template.md", title: "My Template" },
        ],
        readTemplate: vi.fn().mockResolvedValue("template body"),
        getFunctions: () => [],
        ...overrides,
    };
}

function makeEditor(overrides: any = {}): any {
    const applyFn = vi.fn().mockResolvedValue(true);
    const editFnArg = vi.fn().mockImplementation((cb: (b: any) => void) => {
        const editBuilder = { replace: vi.fn(), insert: vi.fn() };
        editSpy.mockImplementation(() => editBuilder);
        cb(editBuilder);
        return Promise.resolve(true);
    });
    return {
        selection: { active: { line: 1, character: 5 } },
        edit: editFnArg,
        apply: applyFn,
        ...overrides,
    };
}

beforeEach(() => {
    vi.clearAllMocks();
    activeTextEditorRef.current = undefined;
    showQuickPick.mockResolvedValue(undefined);
    showInputBox.mockResolvedValue(undefined);
    openTextDocument.mockResolvedValue({ getText: () => "" });
    showTextDocument.mockResolvedValue(undefined);
    clipboardWriteText.mockResolvedValue(undefined);
    showInformationMessage.mockResolvedValue(undefined);
    showWarningMessage.mockResolvedValue(undefined);
    renderTemplateMock.mockResolvedValue({ text: "rendered text", scope: {}, diagnostics: [] });
});

describe("templateCommands", () => {
    describe("pickTemplate", () => {
        it("shows info message when no templates found and returns undefined", async () => {
            const provider = makeProvider({ listTemplates: () => [] });
            const cmd = createInsertTemplateCommand(provider);
            await cmd();
            expect(showInformationMessage).toHaveBeenCalledWith(expect.stringContaining("No templates found"));
        });

        it("returns undefined when QuickPick is cancelled", async () => {
            const provider = makeProvider();
            showQuickPick.mockResolvedValue(undefined);
            const cmd = createRenderTemplateToClipboardCommand(provider);
            await cmd();
            expect(clipboardWriteText).not.toHaveBeenCalled();
        });

        it("includes relative path as description when title exists", async () => {
            const provider = makeProvider({
                listTemplates: () => [
                    { relativePath: "folder/tpl.md", title: "My Title" },
                ],
            });
            showQuickPick.mockResolvedValue({ label: "My Title", relativePath: "folder/tpl.md" });
            showInputBox.mockResolvedValue("user input");
            renderTemplateMock.mockResolvedValue({ text: "result", scope: {}, diagnostics: [] });

            const cmd = createRenderTemplateToClipboardCommand(provider);
            await cmd();

            expect(showQuickPick).toHaveBeenCalledWith(
                expect.arrayContaining([
                    expect.objectContaining({
                        label: "My Title",
                        description: "folder/tpl.md",
                        relativePath: "folder/tpl.md",
                    }),
                ]),
                expect.any(Object)
            );
        });

        it("uses relative path as label when no title", async () => {
            const provider = makeProvider({
                listTemplates: () => [
                    { relativePath: "folder/tpl.md", title: null },
                ],
            });
            showQuickPick.mockResolvedValue({ label: "folder/tpl.md", relativePath: "folder/tpl.md" });
            renderTemplateMock.mockResolvedValue({ text: "result", scope: {}, diagnostics: [] });

            const cmd = createRenderTemplateToClipboardCommand(provider);
            await cmd();

            expect(showQuickPick).toHaveBeenCalledWith(
                expect.arrayContaining([
                    expect.objectContaining({
                        label: "folder/tpl.md",
                        description: undefined,
                    }),
                ]),
                expect.any(Object)
            );
        });
    });

    describe("resolveAndRender", () => {
        it("shows warning when diagnostics are present", async () => {
            const provider = makeProvider();
            showQuickPick.mockResolvedValue({ label: "My Template", relativePath: "my-template.md" });
            renderTemplateMock.mockResolvedValue({
                text: "rendered ⚠️",
                scope: {},
                diagnostics: ["unknown {{foo}}"],
            });

            const cmd = createRenderTemplateToClipboardCommand(provider);
            await cmd();

            expect(showWarningMessage).toHaveBeenCalledWith(
                expect.stringContaining("diagnostics")
            );
        });

        it("shows warning on render error", async () => {
            const provider = makeProvider();
            showQuickPick.mockResolvedValue({ label: "My Template", relativePath: "my-template.md" });
            renderTemplateMock.mockRejectedValue(new Error("Template error"));

            const cmd = createRenderTemplateToClipboardCommand(provider);
            await cmd();

            expect(showWarningMessage).toHaveBeenCalledWith(
                expect.stringContaining("Template error")
            );
            expect(clipboardWriteText).not.toHaveBeenCalled();
        });

        it("shows warning on render error with no message property", async () => {
            const provider = makeProvider();
            showQuickPick.mockResolvedValue({ label: "My Template", relativePath: "my-template.md" });
            renderTemplateMock.mockRejectedValue({ message: null });

            const cmd = createRenderTemplateToClipboardCommand(provider);
            await cmd();

            expect(showWarningMessage).toHaveBeenCalledWith(
                expect.stringContaining("Template error")
            );
        });
    });

    describe("createExpandTemplateCommand", () => {
        it("returns early when template picker is cancelled", async () => {
            const provider = makeProvider();
            showQuickPick.mockResolvedValue(undefined);
            const cmd = createExpandTemplateCommand(provider);
            await cmd("file:///test.md", 0, 0);
            expect(renderTemplateMock).not.toHaveBeenCalled();
        });

        it("copies to clipboard when no active editor", async () => {
            const provider = makeProvider();
            showQuickPick.mockResolvedValue({ label: "My Template", relativePath: "my-template.md" });
            activeTextEditorRef.current = undefined;

            const cmd = createExpandTemplateCommand(provider);
            await cmd("file:///test.md", 0, 0);

            expect(clipboardWriteText).toHaveBeenCalledWith("rendered text");
            expect(showInformationMessage).toHaveBeenCalledWith(expect.stringContaining("clipboard"));
        });

        it("replaces trigger range in active editor", async () => {
            const provider = makeProvider();
            showQuickPick.mockResolvedValue({ label: "My Template", relativePath: "my-template.md" });

            const replaceMock = vi.fn();
            const editor = {
                selection: { active: { line: 2, character: 10 } },
                edit: vi.fn().mockImplementation((cb: (b: any) => void) => {
                    cb({ replace: replaceMock, insert: vi.fn() });
                    return Promise.resolve(true);
                }),
            };
            activeTextEditorRef.current = editor;

            const cmd = createExpandTemplateCommand(provider);
            await cmd("file:///test.md", 1, 0);

            expect(editor.edit).toHaveBeenCalled();
            expect(replaceMock).toHaveBeenCalledWith(
                expect.anything(),
                "rendered text"
            );
        });

        it("returns early when render returns undefined", async () => {
            const provider = makeProvider();
            showQuickPick.mockResolvedValue({ label: "My Template", relativePath: "my-template.md" });
            renderTemplateMock.mockRejectedValue(new Error("fail"));

            const editor = makeEditor();
            activeTextEditorRef.current = editor;

            const cmd = createExpandTemplateCommand(provider);
            await cmd("file:///test.md", 0, 0);

            expect(editor.edit).not.toHaveBeenCalled();
        });
    });

    describe("createInsertTemplateCommand", () => {
        it("returns early when template picker is cancelled", async () => {
            const provider = makeProvider();
            showQuickPick.mockResolvedValue(undefined);
            const cmd = createInsertTemplateCommand(provider);
            await cmd();
            expect(renderTemplateMock).not.toHaveBeenCalled();
        });

        it("copies to clipboard when no active editor", async () => {
            const provider = makeProvider();
            showQuickPick.mockResolvedValue({ label: "My Template", relativePath: "my-template.md" });
            activeTextEditorRef.current = undefined;

            const cmd = createInsertTemplateCommand(provider);
            await cmd();

            expect(clipboardWriteText).toHaveBeenCalledWith("rendered text");
            expect(showInformationMessage).toHaveBeenCalledWith(expect.stringContaining("clipboard"));
        });

        it("inserts at cursor in active editor", async () => {
            const provider = makeProvider();
            showQuickPick.mockResolvedValue({ label: "My Template", relativePath: "my-template.md" });

            const insertMock = vi.fn();
            const editor = {
                selection: { active: { line: 0, character: 0 } },
                edit: vi.fn().mockImplementation((cb: (b: any) => void) => {
                    cb({ replace: vi.fn(), insert: insertMock });
                    return Promise.resolve(true);
                }),
            };
            activeTextEditorRef.current = editor;

            const cmd = createInsertTemplateCommand(provider);
            await cmd();

            expect(editor.edit).toHaveBeenCalled();
            expect(insertMock).toHaveBeenCalledWith(
                editor.selection.active,
                "rendered text"
            );
        });

        it("returns early when render fails", async () => {
            const provider = makeProvider();
            showQuickPick.mockResolvedValue({ label: "My Template", relativePath: "my-template.md" });
            renderTemplateMock.mockRejectedValue(new Error("fail"));

            const cmd = createInsertTemplateCommand(provider);
            await cmd();

            expect(clipboardWriteText).not.toHaveBeenCalled();
        });
    });

    describe("createRenderTemplateToFileCommand", () => {
        it("returns early when template picker is cancelled", async () => {
            const provider = makeProvider();
            showQuickPick.mockResolvedValue(undefined);
            const cmd = createRenderTemplateToFileCommand(provider);
            await cmd();
            expect(openTextDocument).not.toHaveBeenCalled();
        });

        it("opens a new markdown document with rendered text", async () => {
            const provider = makeProvider();
            showQuickPick.mockResolvedValue({ label: "My Template", relativePath: "my-template.md" });
            const fakeDoc = {};
            openTextDocument.mockResolvedValue(fakeDoc);

            const cmd = createRenderTemplateToFileCommand(provider);
            await cmd();

            expect(openTextDocument).toHaveBeenCalledWith({
                content: "rendered text",
                language: "markdown",
            });
            expect(showTextDocument).toHaveBeenCalledWith(fakeDoc);
        });

        it("returns early when render fails", async () => {
            const provider = makeProvider();
            showQuickPick.mockResolvedValue({ label: "My Template", relativePath: "my-template.md" });
            renderTemplateMock.mockRejectedValue(new Error("fail"));

            const cmd = createRenderTemplateToFileCommand(provider);
            await cmd();

            expect(openTextDocument).not.toHaveBeenCalled();
        });
    });

    describe("createRenderTemplateToClipboardCommand", () => {
        it("returns early when template picker is cancelled", async () => {
            const provider = makeProvider();
            showQuickPick.mockResolvedValue(undefined);
            const cmd = createRenderTemplateToClipboardCommand(provider);
            await cmd();
            expect(clipboardWriteText).not.toHaveBeenCalled();
        });

        it("writes rendered text to clipboard", async () => {
            const provider = makeProvider();
            showQuickPick.mockResolvedValue({ label: "My Template", relativePath: "my-template.md" });

            const cmd = createRenderTemplateToClipboardCommand(provider);
            await cmd();

            expect(clipboardWriteText).toHaveBeenCalledWith("rendered text");
            expect(showInformationMessage).toHaveBeenCalledWith(
                expect.stringContaining("clipboard")
            );
        });

        it("returns early when render fails", async () => {
            const provider = makeProvider();
            showQuickPick.mockResolvedValue({ label: "My Template", relativePath: "my-template.md" });
            renderTemplateMock.mockRejectedValue(new Error("fail"));

            const cmd = createRenderTemplateToClipboardCommand(provider);
            await cmd();

            expect(clipboardWriteText).not.toHaveBeenCalled();
        });
    });
});
