import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createModifierKeyTracker, type ModifierKeyEvent, type ModifierKeyTarget, type ModifierKeyTracker } from "../../../../src/features/contacts/webview/modifierKeys";

/** Minimal event target that stores handlers and lets tests dispatch events by type. */
function createMockTarget(): ModifierKeyTarget & { dispatch(type: string, event: ModifierKeyEvent | Record<string, never>): void } {
    const handlers = new Map<string, Set<(event: never) => void>>();

    return {
        addEventListener(type: string, handler: (event: never) => void): void {
            if (!handlers.has(type)) handlers.set(type, new Set());
            handlers.get(type)!.add(handler);
        },
        removeEventListener(type: string, handler: (event: never) => void): void {
            handlers.get(type)?.delete(handler);
        },
        dispatch(type: string, event: ModifierKeyEvent | Record<string, never>): void {
            for (const handler of handlers.get(type) ?? []) {
                handler(event as never);
            }
        },
    };
}

function modifiers(overrides: Partial<ModifierKeyEvent> = {}): ModifierKeyEvent {
    return { ctrlKey: false, shiftKey: false, altKey: false, metaKey: false, ...overrides };
}

describe("modifierKeys tracker", () => {
    let tracker: ModifierKeyTracker;
    let target: ReturnType<typeof createMockTarget>;

    beforeEach(() => {
        target = createMockTarget();
        tracker = createModifierKeyTracker(target);
    });

    afterEach(() => {
        tracker.dispose();
    });

    it("starts with all modifiers false", () => {
        expect(tracker.getState()).toEqual({ ctrl: false, shift: false, alt: false, meta: false });
    });

    it("detects ctrl on keydown", () => {
        target.dispatch("keydown", modifiers({ ctrlKey: true }));
        expect(tracker.getState().ctrl).toBe(true);
    });

    it("detects shift on keydown", () => {
        target.dispatch("keydown", modifiers({ shiftKey: true }));
        expect(tracker.getState().shift).toBe(true);
    });

    it("detects alt on keydown", () => {
        target.dispatch("keydown", modifiers({ altKey: true }));
        expect(tracker.getState().alt).toBe(true);
    });

    it("detects meta on keydown", () => {
        target.dispatch("keydown", modifiers({ metaKey: true }));
        expect(tracker.getState().meta).toBe(true);
    });

    it("clears modifiers on keyup", () => {
        target.dispatch("keydown", modifiers({ ctrlKey: true, shiftKey: true }));
        expect(tracker.getState().ctrl).toBe(true);
        expect(tracker.getState().shift).toBe(true);

        target.dispatch("keyup", modifiers());
        expect(tracker.getState().ctrl).toBe(false);
        expect(tracker.getState().shift).toBe(false);
    });

    it("reads modifiers from mousemove", () => {
        target.dispatch("mousemove", modifiers({ ctrlKey: true }));
        expect(tracker.getState().ctrl).toBe(true);
    });

    it("resets all modifiers on blur", () => {
        target.dispatch("keydown", modifiers({ ctrlKey: true, shiftKey: true, altKey: true, metaKey: true }));
        expect(tracker.getState()).toEqual({ ctrl: true, shift: true, alt: true, meta: true });

        target.dispatch("blur", {});
        expect(tracker.getState()).toEqual({ ctrl: false, shift: false, alt: false, meta: false });
    });

    it("notifies subscribers when state changes", () => {
        const listener = vi.fn();
        tracker.subscribe(listener);

        target.dispatch("keydown", modifiers({ ctrlKey: true }));
        expect(listener).toHaveBeenCalledTimes(1);
        expect(listener).toHaveBeenCalledWith({ ctrl: true, shift: false, alt: false, meta: false });
    });

    it("does not notify when state is unchanged", () => {
        target.dispatch("keydown", modifiers({ ctrlKey: true }));

        const listener = vi.fn();
        tracker.subscribe(listener);

        target.dispatch("keydown", modifiers({ ctrlKey: true }));
        expect(listener).not.toHaveBeenCalled();
    });

    it("stops notifying after unsubscribe", () => {
        const listener = vi.fn();
        const unsubscribe = tracker.subscribe(listener);

        target.dispatch("keydown", modifiers({ shiftKey: true }));
        expect(listener).toHaveBeenCalledTimes(1);

        unsubscribe();
        target.dispatch("keyup", modifiers());
        expect(listener).toHaveBeenCalledTimes(1);
    });

    it("returns a defensive copy from getState", () => {
        const s1 = tracker.getState();
        target.dispatch("keydown", modifiers({ ctrlKey: true }));
        const s2 = tracker.getState();

        expect(s1.ctrl).toBe(false);
        expect(s2.ctrl).toBe(true);
    });

    it("delivers a defensive copy to subscribers", () => {
        const received: Array<{ ctrl: boolean }> = [];
        tracker.subscribe((s) => received.push(s));

        target.dispatch("keydown", modifiers({ ctrlKey: true }));
        target.dispatch("keyup", modifiers());

        expect(received).toHaveLength(2);
        expect(received[0].ctrl).toBe(true);
        expect(received[1].ctrl).toBe(false);
    });

    it("stops dispatching after dispose", () => {
        const listener = vi.fn();
        tracker.subscribe(listener);

        tracker.dispose();
        target.dispatch("keydown", modifiers({ ctrlKey: true }));
        expect(listener).not.toHaveBeenCalled();
    });

    it("does not notify on blur when already reset", () => {
        const listener = vi.fn();
        tracker.subscribe(listener);

        target.dispatch("blur", {});
        expect(listener).not.toHaveBeenCalled();
    });
});
