import { vscode } from './state';
import { formatDate, formatDateLong } from './utils';

export function attachSubtaskCheckboxHandlers(bodyEl: HTMLElement, taskId: string): void {
    // Transform completed-date <em> elements into pill badges placed after the checkbox
    const COMPLETED_EM_RE = /^Completed\s+(\d{4}-\d{2}-\d{2})$/;
    bodyEl.querySelectorAll<HTMLElement>('.task-list-item').forEach((li) => {
        // Find all <em> elements within this task-list-item (including nested
        // non-task lists) but skip those belonging to a nested task-list-item.
        const completedEms: HTMLElement[] = [];
        for (const em of Array.from(li.querySelectorAll('em'))) {
            if (em.closest('.task-list-item') !== li) continue;
            completedEms.push(em as HTMLElement);
        }
        for (const em of completedEms) {
            const match = COMPLETED_EM_RE.exec(em.textContent?.trim() ?? '');
            if (!match) continue;
            const pill = document.createElement('span');
            pill.className = 'subtask-date-pill';
            pill.textContent = formatDate(match[1]);
            pill.title = formatDateLong(match[1]);
            // Also remove the <br> right before the <em> to avoid a trailing blank line
            const prev = em.previousSibling;
            if (prev && (prev as HTMLElement).tagName === 'BR') {
                prev.remove();
            }
            // If the em is inside a nested non-task list item, clean up that
            // item (and its parent <ul>) when it becomes empty after removal.
            const parentLi = em.parentElement;
            em.remove();
            if (parentLi && parentLi.tagName === 'LI' && !parentLi.classList.contains('task-list-item')) {
                if (!parentLi.textContent?.trim() && parentLi.querySelectorAll('*').length === 0) {
                    const parentUl = parentLi.parentElement;
                    parentLi.remove();
                    if (parentUl && parentUl.tagName === 'UL' && parentUl.children.length === 0) {
                        parentUl.remove();
                    }
                }
            }
            // Insert pill right after the checkbox (or its wrapper)
            const cb = li.querySelector('.task-list-item-checkbox');
            const cbParent = cb?.closest('.subtask-checkbox-wrap') ?? cb;
            if (cbParent?.nextSibling) {
                li.insertBefore(pill, cbParent.nextSibling);
            } else {
                li.prepend(pill);
            }
        }

        // Wrap checkbox in a strut container for zoom-proof vertical centering
        const cbEl = li.querySelector('.task-list-item-checkbox');
        if (cbEl) {
            const cbWrap = document.createElement('span');
            cbWrap.className = 'subtask-checkbox-wrap';
            cbEl.parentNode!.insertBefore(cbWrap, cbEl);
            cbWrap.appendChild(cbEl);
        }

        // Wrap all content after checkbox wrapper (and date pill) into a span so
        // inline elements (strong, em, code, br, text nodes) stay together
        // as a single flex item instead of wrapping independently.
        const cbWrapEl = li.querySelector('.subtask-checkbox-wrap') ?? li.querySelector('.task-list-item-checkbox');
        if (cbWrapEl) {
            const wrap = document.createElement('span');
            wrap.className = 'subtask-content';
            // Collect nodes after checkbox wrapper and any date pill
            let startNode = cbWrapEl.nextSibling;
            while (startNode && (startNode as HTMLElement).classList?.contains('subtask-date-pill')) {
                startNode = startNode.nextSibling;
            }
            while (startNode) {
                const next = startNode.nextSibling;
                // Nested lists (task-lists and plain ul/ol) stay outside the
                // wrap so they render as proper block-level lists with markers.
                const tag = (startNode as HTMLElement).tagName;
                if (tag === 'UL' || tag === 'OL') break;
                wrap.appendChild(startNode);
                startNode = next;
            }
            if (wrap.childNodes.length > 0) {
                // Insert wrap before any nested list, or at end
                const nestedList = li.querySelector(':scope > ul, :scope > ol');
                if (nestedList) {
                    li.insertBefore(wrap, nestedList);
                } else {
                    li.appendChild(wrap);
                }
            }
        }
    });

    const checkboxes = bodyEl.querySelectorAll<HTMLInputElement>('input.task-list-item-checkbox');
    checkboxes.forEach((cb, index) => {
        // Remove the disabled attribute so clicks register reliably
        cb.removeAttribute('disabled');

        const toggle = (e: Event) => {
            e.preventDefault();
            e.stopPropagation();
            // Optimistic toggle: update checkbox visually before the round-trip
            cb.checked = !cb.checked;
            vscode.postMessage({ type: 'toggleSubtask', id: taskId, index });
        };

        cb.addEventListener('click', toggle);

        // Clicking anywhere on the task-list-item row also toggles
        const listItem = cb.closest('.task-list-item') as HTMLElement | null;
        if (listItem) {
            listItem.addEventListener('click', (e) => {
                if (e.target === cb) return; // handled above
                toggle(e);
            });

            // Suppress drag initiation from subtask rows without blocking clicks.
            // Setting draggable=false on the list item prevents the card's
            // draggable=true from taking effect when the drag starts here.
            listItem.setAttribute('draggable', 'false');
        }
    });
}
