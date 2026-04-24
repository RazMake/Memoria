import type { ContactTooltipEntry } from './types';
import { getContactTooltips } from './state';

let tooltipEl: HTMLElement | null = null;
let activeTarget: HTMLElement | null = null;

/**
 * Scans rendered task body elements for contact name text and wraps
 * matching text nodes with tooltip-enabled `<span>` elements.
 *
 * Must be called after task HTML is injected into the DOM.
 */
export function annotateContacts(bodyEl: HTMLElement): void {
    const entries = getContactTooltips();
    if (entries.length === 0) return;

    const walker = document.createTreeWalker(bodyEl, NodeFilter.SHOW_TEXT);
    const textNodes: Text[] = [];
    while (walker.nextNode()) {
        textNodes.push(walker.currentNode as Text);
    }

    for (const node of textNodes) {
        const text = node.textContent;
        if (!text) continue;
        wrapContactMatches(node, text, entries);
    }
}

/**
 * Replaces a text node with a fragment containing contact-annotated spans
 * and plain text segments.
 */
function wrapContactMatches(
    node: Text,
    text: string,
    entries: ContactTooltipEntry[],
): void {
    // Find all matches, picking the longest (entries are pre-sorted longest-first).
    const matches: Array<{ start: number; end: number; entry: ContactTooltipEntry }> = [];

    for (const entry of entries) {
        let searchFrom = 0;
        while (true) {
            const idx = text.indexOf(entry.text, searchFrom);
            if (idx === -1) break;
            const end = idx + entry.text.length;
            // Skip if overlapping with a previously found (longer) match.
            const overlaps = matches.some(m => idx < m.end && end > m.start);
            if (!overlaps) {
                matches.push({ start: idx, end, entry });
            }
            searchFrom = idx + 1;
        }
    }

    if (matches.length === 0) return;

    // Sort by start position for sequential fragment construction.
    matches.sort((a, b) => a.start - b.start);

    const frag = document.createDocumentFragment();
    let cursor = 0;

    for (const m of matches) {
        if (m.start > cursor) {
            frag.appendChild(document.createTextNode(text.slice(cursor, m.start)));
        }
        const span = document.createElement('span');
        span.className = 'contact-mention';
        span.textContent = text.slice(m.start, m.end);
        span.dataset.briefHtml = m.entry.briefHtml;
        span.dataset.detailedHtml = m.entry.detailedHtml;
        span.addEventListener('mouseenter', onMentionEnter);
        span.addEventListener('mouseleave', onMentionLeave);
        frag.appendChild(span);
        cursor = m.end;
    }

    if (cursor < text.length) {
        frag.appendChild(document.createTextNode(text.slice(cursor)));
    }

    node.parentNode!.replaceChild(frag, node);
}

function onMentionEnter(e: MouseEvent): void {
    const target = e.currentTarget as HTMLElement;
    activeTarget = target;
    const isDetailed = e.shiftKey;
    const html = isDetailed
        ? target.dataset.detailedHtml!
        : target.dataset.briefHtml!;
    showTooltip(target, html);
}

function onMentionLeave(): void {
    activeTarget = null;
    hideTooltip();
}

function showTooltip(anchor: HTMLElement, html: string): void {
    hideTooltip();
    tooltipEl = document.createElement('div');
    tooltipEl.className = 'contact-tooltip';
    tooltipEl.innerHTML = html;
    document.body.appendChild(tooltipEl);
    positionTooltip(anchor);
}

function positionTooltip(anchor: HTMLElement): void {
    if (!tooltipEl) return;
    const rect = anchor.getBoundingClientRect();
    const tipWidth = tooltipEl.offsetWidth;
    const tipHeight = tooltipEl.offsetHeight;

    // Prefer above the anchor; fall back to below if not enough space.
    let top = rect.top - tipHeight - 6;
    if (top < 4) {
        top = rect.bottom + 6;
    }

    // Horizontally center on the anchor, clamped to viewport.
    let left = rect.left + rect.width / 2 - tipWidth / 2;
    left = Math.max(4, Math.min(left, window.innerWidth - tipWidth - 4));

    tooltipEl.style.top = `${top}px`;
    tooltipEl.style.left = `${left}px`;
}

function hideTooltip(): void {
    if (tooltipEl) {
        tooltipEl.remove();
        tooltipEl = null;
    }
}

// Toggle between brief and detailed when Shift is pressed/released
// while hovering over a contact mention.
document.addEventListener('keydown', (e) => {
    if (e.key === 'Shift' && activeTarget) {
        const html = activeTarget.dataset.detailedHtml!;
        showTooltip(activeTarget, html);
    }
});

document.addEventListener('keyup', (e) => {
    if (e.key === 'Shift' && activeTarget) {
        const html = activeTarget.dataset.briefHtml!;
        showTooltip(activeTarget, html);
    }
});
