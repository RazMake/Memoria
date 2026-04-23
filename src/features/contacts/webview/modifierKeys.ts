export interface ModifierKeyState {
    ctrl: boolean;
    shift: boolean;
    alt: boolean;
    meta: boolean;
}

export type ModifierKeyListener = (state: ModifierKeyState) => void;

export interface ModifierKeyTracker {
    getState(): ModifierKeyState;
    subscribe(listener: ModifierKeyListener): () => void;
    dispose(): void;
}

export interface ModifierKeyEvent {
    ctrlKey: boolean;
    shiftKey: boolean;
    altKey: boolean;
    metaKey: boolean;
}

export interface ModifierKeyTarget {
    addEventListener(type: string, handler: (event: never) => void, capture?: boolean): void;
    removeEventListener(type: string, handler: (event: never) => void, capture?: boolean): void;
}

export function createModifierKeyTracker(target: ModifierKeyTarget = window): ModifierKeyTracker {
    const state: ModifierKeyState = { ctrl: false, shift: false, alt: false, meta: false };
    const listeners = new Set<ModifierKeyListener>();

    function notify(): void {
        for (const listener of listeners) {
            listener({ ...state });
        }
    }

    function update(event: ModifierKeyEvent): void {
        const next: ModifierKeyState = {
            ctrl: event.ctrlKey,
            shift: event.shiftKey,
            alt: event.altKey,
            meta: event.metaKey,
        };

        if (
            next.ctrl !== state.ctrl
            || next.shift !== state.shift
            || next.alt !== state.alt
            || next.meta !== state.meta
        ) {
            state.ctrl = next.ctrl;
            state.shift = next.shift;
            state.alt = next.alt;
            state.meta = next.meta;
            notify();
        }
    }

    function reset(): void {
        if (state.ctrl || state.shift || state.alt || state.meta) {
            state.ctrl = false;
            state.shift = false;
            state.alt = false;
            state.meta = false;
            notify();
        }
    }

    const updateHandler = update as (event: never) => void;
    const resetHandler = reset as (event: never) => void;

    target.addEventListener("keydown", updateHandler, true);
    target.addEventListener("keyup", updateHandler, true);
    target.addEventListener("mousemove", updateHandler, true);
    target.addEventListener("blur", resetHandler);

    return {
        getState(): ModifierKeyState {
            return { ...state };
        },

        subscribe(listener: ModifierKeyListener): () => void {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },

        dispose(): void {
            target.removeEventListener("keydown", updateHandler, true);
            target.removeEventListener("keyup", updateHandler, true);
            target.removeEventListener("mousemove", updateHandler, true);
            target.removeEventListener("blur", resetHandler);
            listeners.clear();
        },
    };
}
