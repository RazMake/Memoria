import type { SnippetSuggestion } from './types';
import { vscode } from './state';
import { el } from './utils';

/** Trigger characters that start a snippet query. */
const TRIGGER_CHARS = new Set(['{', '@']);

let dropdownEl: HTMLElement | null = null;
let items: SnippetSuggestion[] = [];
let selectedIndex = -1;
let activeInput: HTMLInputElement | HTMLTextAreaElement | null = null;
let triggerStart = -1;
let pendingResultCallback: ((text: string) => void) | null = null;

export function isDropdownVisible(): boolean {
    return dropdownEl !== null && items.length > 0;
}

/**
 * Called on every `input` event in the popup's input/textarea.
 * Detects a trigger character and sends a snippet query to the extension.
 */
export function onPopupInput(input: HTMLInputElement | HTMLTextAreaElement): void {
    activeInput = input;
    const value = input.value;
    const cursor = input.selectionStart ?? value.length;

    const detected = detectTrigger(value, cursor);
    if (!detected) {
        hideDropdown();
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
    if (!isDropdownVisible()) return false;

    switch (e.key) {
        case 'ArrowDown':
            selectedIndex = Math.min(selectedIndex + 1, items.length - 1);
            renderDropdown();
            return true;
        case 'ArrowUp':
            selectedIndex = Math.max(selectedIndex - 1, 0);
            renderDropdown();
            return true;
        case 'Tab':
        case 'Enter':
            if (selectedIndex >= 0 && selectedIndex < items.length) {
                acceptItem(items[selectedIndex]);
                return true;
            }
            return false;
        case 'Escape':
            hideDropdown();
            return true;
        default:
            return false;
    }
}

/** Receive snippet suggestions from the extension host. */
export function handleSnippetSuggestions(suggestions: SnippetSuggestion[]): void {
    items = suggestions;
    selectedIndex = items.length > 0 ? 0 : -1;
    if (items.length > 0) {
        renderDropdown();
    } else {
        hideDropdown();
    }
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
    hideDropdown();
    activeInput = null;
    triggerStart = -1;
    pendingResultCallback = null;
}

// ── Private helpers ──────────────────────────────────────────────

function detectTrigger(text: string, cursor: number): { char: string; col: number } | undefined {
    for (let col = cursor - 1; col >= 0; col--) {
        const ch = text[col];
        if (TRIGGER_CHARS.has(ch)) return { char: ch, col };
        if (/\s/.test(ch)) return undefined;
    }
    return undefined;
}

function acceptItem(item: SnippetSuggestion): void {
    if (!activeInput) return;

    const cursor = activeInput.selectionStart ?? activeInput.value.length;
    // Text after the trigger char(s) that user typed as the prefix
    const before = activeInput.value.slice(0, triggerStart);
    const after = activeInput.value.slice(cursor);

    // For static snippets, the extension will send a snippetResult.
    // We set up a callback and ask the extension to expand.
    pendingResultCallback = (expanded: string) => {
        if (!activeInput) return;
        activeInput.value = before + expanded + after;
        const newCursor = before.length + expanded.length;
        activeInput.setSelectionRange(newCursor, newCursor);
        activeInput.focus();
        // Fire an input event so auto-grow works on textareas
        activeInput.dispatchEvent(new Event('input', { bubbles: true }));
    };

    const selectedText = activeInput.selectionStart !== activeInput.selectionEnd
        ? activeInput.value.slice(activeInput.selectionStart ?? 0, activeInput.selectionEnd ?? 0)
        : undefined;

    vscode.postMessage({ type: 'snippetAccept', trigger: item.trigger, selectedText });
    hideDropdown();
}

function renderDropdown(): void {
    if (!activeInput) return;

    if (!dropdownEl) {
        dropdownEl = el('div', 'snippet-dropdown');
        // Position relative to the popup input wrap
        const wrap = activeInput.closest('.popup-input-wrap');
        if (wrap) {
            (wrap as HTMLElement).style.position = 'relative';
            wrap.appendChild(dropdownEl);
        } else {
            activeInput.parentElement?.appendChild(dropdownEl);
        }
    }

    dropdownEl.innerHTML = '';
    items.forEach((item, i) => {
        const row = el('div', 'snippet-dropdown-item');
        if (i === selectedIndex) row.classList.add('selected');

        const label = el('span', 'snippet-dropdown-label');
        label.textContent = item.label;
        row.appendChild(label);

        if (item.description) {
            const desc = el('span', 'snippet-dropdown-desc');
            desc.textContent = item.description;
            row.appendChild(desc);
        }

        row.addEventListener('mousedown', (e) => {
            e.preventDefault(); // prevent input blur
            acceptItem(item);
        });
        row.addEventListener('mouseenter', () => {
            selectedIndex = i;
            renderDropdown();
        });

        dropdownEl!.appendChild(row);
    });

    // Scroll selected item into view
    const selectedEl = dropdownEl.querySelector('.selected');
    if (selectedEl) selectedEl.scrollIntoView({ block: 'nearest' });
}

function hideDropdown(): void {
    if (dropdownEl) {
        dropdownEl.remove();
        dropdownEl = null;
    }
    items = [];
    selectedIndex = -1;
}
