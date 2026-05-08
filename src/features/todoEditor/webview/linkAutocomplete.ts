import type { LinkSuggestion } from './types';
import { vscode } from './state';
import { createAutocompleteDropdown } from './autocompleteDropdown';
import { detectLinkContext } from './linkContext';
export type { LinkContext } from './linkContext';
export { detectLinkContext } from './linkContext';

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

const dropdown = createAutocompleteDropdown<LinkSuggestion>(acceptLinkItem);

export function isLinkDropdownVisible(): boolean {
    return dropdown.isVisible();
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
    dropdown.setActiveInput(input);
    const value = input.value;
    const cursor = input.selectionStart ?? value.length;

    const ctx = detectLinkContext(value, cursor);
    if (!ctx) {
        dropdown.hide();
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
    return dropdown.handleKeydown(e, acceptLinkItem);
}

/** Receive link suggestions from the extension host. */
export function handleLinkSuggestions(suggestions: LinkSuggestion[], responseQueryId?: number): void {
    if (responseQueryId !== undefined && responseQueryId !== queryId) return;
    dropdown.show(suggestions);
}

/** Clean up. */
export function disposeLinkAutocomplete(): void {
    dropdown.dispose();
    parenStart = -1;
    completingHeading = false;
    headingFilePath = '';
    suppressNextInput = false;
}

function acceptLinkItem(item: LinkSuggestion): void {
    const activeInput = dropdown.getActiveInput();
    if (!activeInput) return;

    const cursor = activeInput.selectionStart ?? activeInput.value.length;
    const value = activeInput.value;

    if (completingHeading) {
        const contentBeforeHash = value.slice(parenStart, cursor);
        const hashIdx = contentBeforeHash.indexOf('#');
        const replaceStart = parenStart + hashIdx + 1;
        const before = value.slice(0, replaceStart);
        const after = value.slice(cursor);
        activeInput.value = before + item.insertText + after;
        const newCursor = replaceStart + item.insertText.length;
        activeInput.setSelectionRange(newCursor, newCursor);
    } else {
        const before = value.slice(0, parenStart);
        const after = value.slice(cursor);
        activeInput.value = before + item.insertText + after;
        const newCursor = parenStart + item.insertText.length;
        activeInput.setSelectionRange(newCursor, newCursor);
    }

    activeInput.focus();
    // When accepting a directory (insertText ends with '/'), let the synthetic
    // input event re-trigger autocomplete so the folder's contents are shown
    // immediately. For files and headings we suppress re-triggering.
    const isDirectory = !completingHeading && item.insertText.endsWith('/');
    if (!isDirectory) {
        suppressNextInput = true;
    }
    activeInput.dispatchEvent(new Event('input', { bubbles: true }));
    dropdown.hide();
}
