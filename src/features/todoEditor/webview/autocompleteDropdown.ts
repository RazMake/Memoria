// Shared autocomplete dropdown controller for the todo editor popup.
// Parameterized by item type — used by both snippet and link autocomplete.

import { el } from './utils';

export interface DropdownItem {
    label: string;
    description?: string;
}

export interface AutocompleteDropdown<T extends DropdownItem> {
    isVisible(): boolean;
    show(newItems: T[], renderFn?: () => void): void;
    hide(): void;
    handleKeydown(e: KeyboardEvent, accept: (item: T) => void): boolean;
    getActiveInput(): HTMLInputElement | HTMLTextAreaElement | null;
    setActiveInput(input: HTMLInputElement | HTMLTextAreaElement): void;
    dispose(): void;
}

export function createAutocompleteDropdown<T extends DropdownItem>(
    onAccept: (item: T) => void,
): AutocompleteDropdown<T> {
    let dropdownEl: HTMLElement | null = null;
    let items: T[] = [];
    let selectedIndex = -1;
    let activeInput: HTMLInputElement | HTMLTextAreaElement | null = null;

    function isVisible(): boolean {
        return dropdownEl !== null && items.length > 0;
    }

    function render(): void {
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
                onAccept(item);
            });
            row.addEventListener('mouseenter', () => {
                selectedIndex = i;
                render();
            });

            dropdownEl!.appendChild(row);
        });

        const selectedEl = dropdownEl.querySelector('.selected');
        if (selectedEl) selectedEl.scrollIntoView({ block: 'nearest' });
    }

    function hide(): void {
        if (dropdownEl) {
            dropdownEl.remove();
            dropdownEl = null;
        }
        items = [];
        selectedIndex = -1;
    }

    function show(newItems: T[]): void {
        items = newItems;
        selectedIndex = items.length > 0 ? 0 : -1;
        if (items.length > 0) {
            render();
        } else {
            hide();
        }
    }

    function handleKeydown(e: KeyboardEvent, accept: (item: T) => void): boolean {
        if (!isVisible()) return false;

        switch (e.key) {
            case 'ArrowDown':
                selectedIndex = Math.min(selectedIndex + 1, items.length - 1);
                render();
                return true;
            case 'ArrowUp':
                selectedIndex = Math.max(selectedIndex - 1, 0);
                render();
                return true;
            case 'Tab':
            case 'Enter':
                if (selectedIndex >= 0 && selectedIndex < items.length) {
                    accept(items[selectedIndex]);
                    return true;
                }
                return false;
            case 'Escape':
                hide();
                return true;
            default:
                return false;
        }
    }

    return {
        isVisible,
        show,
        hide,
        handleKeydown,
        getActiveInput: () => activeInput,
        setActiveInput: (input) => { activeInput = input; },
        dispose: () => { hide(); activeInput = null; },
    };
}
