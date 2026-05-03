export function el(tag: string, className?: string): HTMLElement {
    const element = document.createElement(tag);
    if (className) {
        element.className = className;
    }
    return element;
}

export function clearElement(element: HTMLElement): void {
    element.replaceChildren();
}

export interface PreservedFocus {
    field: string;
    selectionStart: number | null;
    selectionEnd: number | null;
}

export function captureFocus(container: HTMLElement): PreservedFocus | null {
    const active = document.activeElement;
    if (!(active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement || active instanceof HTMLSelectElement)) {
        return null;
    }
    if (!container.contains(active)) {
        return null;
    }

    const field = active.getAttribute("data-field");
    if (!field) {
        return null;
    }

    return {
        field,
        selectionStart: "selectionStart" in active ? active.selectionStart : null,
        selectionEnd: "selectionEnd" in active ? active.selectionEnd : null,
    };
}

export function restoreFocus(container: HTMLElement, preserved: PreservedFocus): void {
    const candidates = Array.from(container.querySelectorAll("[data-field]"));
    const target = candidates.find((candidate) => candidate.getAttribute("data-field") === preserved.field);
    if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement)) {
        return;
    }

    target.focus();
    if ((target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)
        && preserved.selectionStart !== null
        && preserved.selectionEnd !== null) {
        target.setSelectionRange(preserved.selectionStart, preserved.selectionEnd);
    }
}
