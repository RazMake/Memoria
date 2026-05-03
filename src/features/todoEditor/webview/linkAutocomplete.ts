import type { LinkSuggestion } from './types';
import { vscode } from './state';
import { el } from './utils';
import { detectLinkContext } from './linkContext';
export type { LinkContext } from './linkContext';
export { detectLinkContext } from './linkContext';

let dropdownEl: HTMLElement | null = null;
let items: LinkSuggestion[] = [];
let selectedIndex = -1;
let activeInput: HTMLInputElement | HTMLTextAreaElement | null = null;
/** Start of the link target region inside parens, i.e. the char after '('. */
let parenStart = -1;
/** Whether we're currently completing a heading (after #). */
let completingHeading = false;
/** The file path portion when completing headings. */
let headingFilePath = '';
/** Suppress the next onLinkInput call (set after accepting to avoid re-triggering). */
let suppressNextInput = false;
/** Monotonic query counter to discard stale async responses. */
let queryId = 0;

export function isLinkDropdownVisible(): boolean {
    return dropdownEl !== null && items.length > 0;
}

/**
 * Called on every `input` event in the popup's input/textarea.
 * Detects if the cursor is inside a markdown link's `()` and triggers
 * file path or heading completion.
 */
export function onLinkInput(input: HTMLInputElement | HTMLTextAreaElement): void {
    if (suppressNextInput) {
        suppressNextInput = false;
        return;
    }
    activeInput = input;
    const value = input.value;
    const cursor = input.selectionStart ?? value.length;

    const ctx = detectLinkContext(value, cursor);
    if (!ctx) {
        hideLinkDropdown();
        return;
    }

    parenStart = ctx.parenStart;

    const qid = ++queryId;

    if (ctx.mode === 'heading') {
        completingHeading = true;
        headingFilePath = ctx.filePath;
        vscode.postMessage({ type: 'linkHeadingQuery', path: ctx.filePath, prefix: ctx.prefix, queryId: qid });
    } else {
        completingHeading = false;
        headingFilePath = '';
        vscode.postMessage({ type: 'linkPathQuery', prefix: ctx.prefix, queryId: qid });
    }
}

/**
 * Handles keydown when the link dropdown is visible.
 * Returns true if the key was consumed.
 */
export function onLinkKeydown(e: KeyboardEvent): boolean {
    if (!isLinkDropdownVisible()) return false;

    switch (e.key) {
        case 'ArrowDown':
            selectedIndex = Math.min(selectedIndex + 1, items.length - 1);
            renderLinkDropdown();
            return true;
        case 'ArrowUp':
            selectedIndex = Math.max(selectedIndex - 1, 0);
            renderLinkDropdown();
            return true;
        case 'Tab':
        case 'Enter':
            if (selectedIndex >= 0 && selectedIndex < items.length) {
                acceptLinkItem(items[selectedIndex]);
                return true;
            }
            return false;
        case 'Escape':
            hideLinkDropdown();
            return true;
        default:
            return false;
    }
}

/** Receive link suggestions from the extension host. */
export function handleLinkSuggestions(suggestions: LinkSuggestion[], responseQueryId?: number): void {
    // Discard stale responses from earlier queries
    if (responseQueryId !== undefined && responseQueryId !== queryId) return;
    items = suggestions;
    selectedIndex = items.length > 0 ? 0 : -1;
    if (items.length > 0) {
        renderLinkDropdown();
    } else {
        hideLinkDropdown();
    }
}

/** Clean up. */
export function disposeLinkAutocomplete(): void {
    hideLinkDropdown();
    activeInput = null;
    parenStart = -1;
    completingHeading = false;
    headingFilePath = '';
    suppressNextInput = false;
}

// ── Private helpers ──────────────────────────────────────────────

function acceptLinkItem(item: LinkSuggestion): void {
    if (!activeInput) return;

    const cursor = activeInput.selectionStart ?? activeInput.value.length;
    const value = activeInput.value;

    if (completingHeading) {
        // Replace from after '#' to cursor
        const contentBeforeHash = value.slice(parenStart, cursor);
        const hashIdx = contentBeforeHash.indexOf('#');
        const replaceStart = parenStart + hashIdx + 1;
        const before = value.slice(0, replaceStart);
        const after = value.slice(cursor);
        activeInput.value = before + item.insertText + after;
        const newCursor = replaceStart + item.insertText.length;
        activeInput.setSelectionRange(newCursor, newCursor);
    } else {
        // Replace from parenStart to cursor
        const before = value.slice(0, parenStart);
        const after = value.slice(cursor);
        activeInput.value = before + item.insertText + after;
        const newCursor = parenStart + item.insertText.length;
        activeInput.setSelectionRange(newCursor, newCursor);
    }

    activeInput.focus();
    // Suppress re-triggering from the synthetic input event
    suppressNextInput = true;
    // Fire input event so auto-grow works
    activeInput.dispatchEvent(new Event('input', { bubbles: true }));
    hideLinkDropdown();
}

function renderLinkDropdown(): void {
    if (!activeInput) return;

    if (!dropdownEl) {
        dropdownEl = el('div', 'snippet-dropdown');
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
            e.preventDefault();
            acceptLinkItem(item);
        });
        row.addEventListener('mouseenter', () => {
            selectedIndex = i;
            renderLinkDropdown();
        });

        dropdownEl!.appendChild(row);
    });

    const selectedEl = dropdownEl.querySelector('.selected');
    if (selectedEl) selectedEl.scrollIntoView({ block: 'nearest' });
}

function hideLinkDropdown(): void {
    if (dropdownEl) {
        dropdownEl.remove();
        dropdownEl = null;
    }
    items = [];
    selectedIndex = -1;
}
