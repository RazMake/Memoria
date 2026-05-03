import { describe, it, expect, vi } from "vitest";
import { handleFormatKey } from "../../../../src/features/todoEditor/webview/formatShortcuts";

function makeInput(value: string, selStart: number, selEnd?: number): HTMLInputElement {
    const input = {
        value,
        selectionStart: selStart,
        selectionEnd: selEnd ?? selStart,
        setSelectionRange: vi.fn(),
        dispatchEvent: vi.fn(),
    } as unknown as HTMLInputElement;
    return input;
}

function makeKeyEvent(key: string, ctrlKey = true): KeyboardEvent {
    return {
        key,
        ctrlKey,
        metaKey: false,
        preventDefault: vi.fn(),
        target: { tagName: "INPUT" },
    } as unknown as KeyboardEvent;
}

describe("handleFormatKey", () => {
    describe("bold (Ctrl+B)", () => {
        it("should wrap selected text with **", () => {
            const input = makeInput("hello world", 6, 11); // "world" selected
            const e = makeKeyEvent("b");
            const result = handleFormatKey(e, input);
            expect(result).toBe(true);
            expect(input.value).toBe("hello **world**");
            expect(input.setSelectionRange).toHaveBeenCalledWith(8, 13);
        });

        it("should insert **** with cursor inside when nothing selected", () => {
            const input = makeInput("hello ", 6);
            const e = makeKeyEvent("b");
            handleFormatKey(e, input);
            expect(input.value).toBe("hello ****");
            expect(input.setSelectionRange).toHaveBeenCalledWith(8, 8);
        });
    });

    describe("italic (Ctrl+I)", () => {
        it("should wrap selected text with _", () => {
            const input = makeInput("hello world", 6, 11);
            const e = makeKeyEvent("i");
            const result = handleFormatKey(e, input);
            expect(result).toBe(true);
            expect(input.value).toBe("hello _world_");
            expect(input.setSelectionRange).toHaveBeenCalledWith(7, 12);
        });

        it("should insert __ with cursor inside when nothing selected", () => {
            const input = makeInput("hello ", 6);
            const e = makeKeyEvent("i");
            handleFormatKey(e, input);
            expect(input.value).toBe("hello __");
            expect(input.setSelectionRange).toHaveBeenCalledWith(7, 7);
        });
    });

    describe("link (Ctrl+L)", () => {
        it("should wrap selected text in []() with cursor between ()", () => {
            const input = makeInput("click here", 6, 10); // "here" selected
            const e = makeKeyEvent("l");
            const result = handleFormatKey(e, input);
            expect(result).toBe(true);
            expect(input.value).toBe("click [here]()");
            expect(input.setSelectionRange).toHaveBeenCalledWith(13, 13); // between ()
        });

        it("should insert []() with cursor between () when nothing selected", () => {
            const input = makeInput("see ", 4);
            const e = makeKeyEvent("l");
            handleFormatKey(e, input);
            expect(input.value).toBe("see []()");
            expect(input.setSelectionRange).toHaveBeenCalledWith(7, 7); // between ()
        });
    });

    describe("non-matching keys", () => {
        it("should return false for non-Ctrl keys", () => {
            const input = makeInput("text", 0);
            const e = makeKeyEvent("b", false); // no Ctrl
            expect(handleFormatKey(e, input)).toBe(false);
        });

        it("should return false for unrecognized Ctrl+key combos", () => {
            const input = makeInput("text", 0);
            const e = makeKeyEvent("z");
            expect(handleFormatKey(e, input)).toBe(false);
        });
    });

    describe("event handling", () => {
        it("should call preventDefault on matching key events", () => {
            const input = makeInput("text", 0, 4);
            const e = makeKeyEvent("b");
            handleFormatKey(e, input);
            expect(e.preventDefault).toHaveBeenCalled();
        });

        it("should dispatch input event for auto-grow", () => {
            const input = makeInput("text", 0, 4);
            const e = makeKeyEvent("b");
            handleFormatKey(e, input);
            expect(input.dispatchEvent).toHaveBeenCalledWith(
                expect.objectContaining({ type: "input" }),
            );
        });
    });

    describe("edge cases", () => {
        it("should handle empty input value", () => {
            const input = makeInput("", 0);
            const e = makeKeyEvent("b");
            handleFormatKey(e, input);
            expect(input.value).toBe("****");
            expect(input.setSelectionRange).toHaveBeenCalledWith(2, 2);
        });

        it("should handle cursor at the beginning", () => {
            const input = makeInput("text", 0, 0);
            const e = makeKeyEvent("i");
            handleFormatKey(e, input);
            expect(input.value).toBe("__text");
            expect(input.setSelectionRange).toHaveBeenCalledWith(1, 1);
        });

        it("should handle full text selected for link", () => {
            const input = makeInput("full text", 0, 9);
            const e = makeKeyEvent("l");
            handleFormatKey(e, input);
            expect(input.value).toBe("[full text]()");
            expect(input.setSelectionRange).toHaveBeenCalledWith(12, 12);
        });
    });
});
