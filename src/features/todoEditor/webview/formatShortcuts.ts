/**
 * Handles Ctrl+B (bold), Ctrl+I (italic), Ctrl+L (link) formatting
 * in the popup's input/textarea. Returns true if the key was consumed.
 */
export function handleFormatKey(e: KeyboardEvent, input: HTMLInputElement | HTMLTextAreaElement): boolean {
    if (!e.ctrlKey) return false;

    const key = e.key.toLowerCase();
    if (key !== 'b' && key !== 'i' && key !== 'l') return false;

    e.preventDefault();
    const start = input.selectionStart ?? 0;
    const end = input.selectionEnd ?? 0;
    const value = input.value;
    const selected = value.slice(start, end);

    if (key === 'b') {
        // Bold: wrap with **
        if (selected) {
            const newValue = value.slice(0, start) + '**' + selected + '**' + value.slice(end);
            input.value = newValue;
            input.setSelectionRange(start + 2, end + 2);
        } else {
            const newValue = value.slice(0, start) + '****' + value.slice(end);
            input.value = newValue;
            input.setSelectionRange(start + 2, start + 2);
        }
    } else if (key === 'i') {
        // Italic: wrap with _
        if (selected) {
            const newValue = value.slice(0, start) + '_' + selected + '_' + value.slice(end);
            input.value = newValue;
            input.setSelectionRange(start + 1, end + 1);
        } else {
            const newValue = value.slice(0, start) + '__' + value.slice(end);
            input.value = newValue;
            input.setSelectionRange(start + 1, start + 1);
        }
    } else if (key === 'l') {
        // Link: wrap with []()
        if (selected) {
            const newValue = value.slice(0, start) + '[' + selected + ']()' + value.slice(end);
            input.value = newValue;
            // Put cursor between ()
            input.setSelectionRange(start + selected.length + 3, start + selected.length + 3);
        } else {
            const newValue = value.slice(0, start) + '[]()' + value.slice(end);
            input.value = newValue;
            // Put cursor between ()
            input.setSelectionRange(start + 3, start + 3);
        }
    }

    // Fire input event for auto-grow on textareas
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
}

/**
 * Handles the `[` key when text is selected: wraps with `[text]()`
 * and places the cursor between the parentheses.
 * Returns true if the key was consumed.
 */
export function handleBracketKey(e: KeyboardEvent, input: HTMLInputElement | HTMLTextAreaElement): boolean {
    if (e.key !== '[' || e.ctrlKey || e.altKey || e.metaKey) return false;

    const start = input.selectionStart ?? 0;
    const end = input.selectionEnd ?? 0;
    if (start === end) return false; // no selection

    e.preventDefault();
    const value = input.value;
    const selected = value.slice(start, end);

    const newValue = value.slice(0, start) + '[' + selected + ']()' + value.slice(end);
    input.value = newValue;
    // Put cursor between ()
    input.setSelectionRange(start + selected.length + 3, start + selected.length + 3);

    input.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
}
