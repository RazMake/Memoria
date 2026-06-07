import { describe, it, expect, vi, beforeEach } from "vitest";

const resolveSourceUri = vi.fn();
const locateSourceTask = vi.fn();
const renderTaskBlock = vi.fn(() => "RENDERED");
const renderDoneBlock = vi.fn(() => "DONE");
const replaceLineRange = vi.fn(() => "NEW_TEXT");

vi.mock("../../../../src/features/taskCollector/taskCollectorPathResolver", () => ({
    resolveSourceUri: (...a: any[]) => resolveSourceUri(...a),
}));

vi.mock("../../../../src/features/taskCollector/taskCollectorTransformer", () => ({
    locateSourceTask: (...a: any[]) => locateSourceTask(...a),
}));

vi.mock("../../../../src/features/taskCollector/taskWriter", () => ({
    renderTaskBlock: (...a: any[]) => renderTaskBlock(...a),
    renderDoneBlock: (...a: any[]) => renderDoneBlock(...a),
    replaceLineRange: (...a: any[]) => replaceLineRange(...a),
}));

import {
    modifySourceTask,
    updateSourceTask,
    deleteSourceTask,
} from "../../../../src/features/taskCollector/sourceTaskMutator";

function makeWriter() {
    return {
        mutateDocument: vi.fn(async (_uri: any, cb: any) => {
            // Drive the document-mutation callback with synthetic state.
            return cb({}, "CURRENT_TEXT", "\n");
        }),
    } as any;
}

const ENTRY: any = { source: "Notes/a.md", sourceRoot: null };
const INDEX: any = {};
const LOCATION = {
    block: { bodyRange: { startLine: 2, endLine: 4 } },
};

describe("sourceTaskMutator", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        renderTaskBlock.mockReturnValue("RENDERED");
        replaceLineRange.mockReturnValue("NEW_TEXT");
    });

    it("returns early without mutating when the source URI cannot be resolved", async () => {
        resolveSourceUri.mockReturnValue(undefined);
        const writer = makeWriter();

        await modifySourceTask(writer, INDEX, ENTRY, () => "X");

        expect(writer.mutateDocument).not.toHaveBeenCalled();
    });

    it("leaves the text unchanged when the task cannot be located", async () => {
        resolveSourceUri.mockReturnValue({ fsPath: "/a.md" });
        locateSourceTask.mockReturnValue(null);
        const writer = makeWriter();

        await modifySourceTask(writer, INDEX, ENTRY, () => "X");

        expect(writer.mutateDocument).toHaveBeenCalledTimes(1);
        // The callback returns the original text when no location is found.
        expect(replaceLineRange).not.toHaveBeenCalled();
    });

    it("replaces the located line range with the built replacement", async () => {
        resolveSourceUri.mockReturnValue({ fsPath: "/a.md" });
        locateSourceTask.mockReturnValue(LOCATION);
        const writer = makeWriter();
        const builder = vi.fn(() => "BUILT");

        await modifySourceTask(writer, INDEX, ENTRY, builder);

        expect(builder).toHaveBeenCalledWith(LOCATION.block);
        expect(replaceLineRange).toHaveBeenCalledWith("CURRENT_TEXT", 2, 4, "BUILT", "\n");
    });

    it("uses sourceRoot when provided to resolve the URI", async () => {
        resolveSourceUri.mockReturnValue({ fsPath: "/a.md" });
        locateSourceTask.mockReturnValue(LOCATION);
        const writer = makeWriter();

        await modifySourceTask(writer, INDEX, { source: "a.md", sourceRoot: "/root" } as any, () => "X");

        expect(resolveSourceUri).toHaveBeenCalledWith("a.md", "/root");
    });

    it("updateSourceTask renders a task block with body and checked state", async () => {
        resolveSourceUri.mockReturnValue({ fsPath: "/a.md" });
        locateSourceTask.mockReturnValue(LOCATION);
        const writer = makeWriter();

        await updateSourceTask(writer, INDEX, ENTRY, "new body", true);

        expect(renderTaskBlock).toHaveBeenCalledWith(LOCATION.block, "new body", true);
        expect(replaceLineRange).toHaveBeenCalledWith("CURRENT_TEXT", 2, 4, "RENDERED", "\n");
    });

    it("deleteSourceTask replaces the task block with an empty string", async () => {
        resolveSourceUri.mockReturnValue({ fsPath: "/a.md" });
        locateSourceTask.mockReturnValue(LOCATION);
        const writer = makeWriter();

        await deleteSourceTask(writer, INDEX, ENTRY);

        expect(replaceLineRange).toHaveBeenCalledWith("CURRENT_TEXT", 2, 4, "", "\n");
    });
});
