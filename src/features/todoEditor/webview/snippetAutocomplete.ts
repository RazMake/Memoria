import type { SnippetSuggestion } from './types';
import { vscode } from './state';
import { createAutocompleteDropdown } from './autocompleteDropdown';

/** Trigger characters that start a snippet query. */
const TRIGGER_CHARS = new Set(['{', '@']);

let triggerStart = -1;
let pendingResultCallback: ((text: string) => void) | null = null;

const dropdown = createAutocompleteDropdown<SnippetSuggestion>(acceptItem);

export function isDropdownVisible(): boolean {
    return dropdown.isVisible();
}

/**
 * Called on every `input` event in the popup's input/textarea.
 * Detects a trigger character and sends a snippet query to the extension.
 */
export function onPopupInput(input: HTMLInputElement | HTMLTextAreaElement): void {
    dropdown.setActiveInput(input);
    const value = input.value;
    const cursor = input.selectionStart ?? value.length;

    const detected = detectTrigger(value, cursor);
    if (!detected) {
        dropdown.hide();
        return;
    }

    triggerStart = detected.col;
    const prefix = value.slice(detected.col, cursor);
    vscode.postMessage({ type: 'snippetQuery', prefix });
}

/**
 * Handles keydown in the popup input when the dropdown is visible.
 * Returns `true` if the key was consumed (caller should preventDefault).
 */
export function onPopupKeydown(e: KeyboardEvent): boolean {
    return dropdown.handleKeydown(e, acceptItem);
}

/** Receive snippet suggestions from the extension host. */
export function handleSnippetSuggestions(suggestions: SnippetSuggestion[]): void {
    dropdown.show(suggestions);
}

/** Receive an expanded snippet result from the extension host. */
export function handleSnippetResult(text: string): void {
    if (pendingResultCallback) {
        pendingResultCallback(text);
        pendingResultCallback = null;
    }
}

/** Clean up when the popup closes. */
export function disposeAutocomplete(): void {
    dropdown.dispose();
    triggerStart = -1;
    pendingResultCallback = null;
}

function detectTrigger(text: string, cursor: number): { char: string; col: number } | undefined {
    for (let col = cursor - 1; col >= 0; col--) {
        const ch = text[col];
        if (TRIGGER_CHARS.has(ch)) return { char: ch, col };
        if (/\s/.test(ch)) return undefined;
    }
    return undefined;
}

function acceptItem(item: SnippetSuggestion): void {
    const activeInput = dropdown.getActiveInput();
    if (!activeInput) return;

    const cursor = activeInput.selectionStart ?? activeInput.value.length;
    const before = activeInput.value.slice(0, triggerStart);
    const after = activeInput.value.slice(cursor);

    pendingResultCallback = (expanded: string) => {
        const input = dropdown.getActiveInput();
        if (!input) return;
        input.value = before + expanded + after;
        const newCursor = before.length + expanded.length;
        input.setSelectionRange(newCursor, newCursor);
        input.focus();
        input.dispatchEvent(new Event('input', { bubbles: true }));
    };

    const selectedText = activeInput.selectionStart !== activeInput.selectionEnd
        ? activeInput.value.slice(activeInput.selectionStart ?? 0, activeInput.selectionEnd ?? 0)
        : undefined;

    vscode.postMessage({ type: 'snippetAccept', trigger: item.trigger, selectedText });
    dropdown.hide();
}
