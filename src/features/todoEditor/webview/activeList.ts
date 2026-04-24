import type { UITask } from './types';
import { vscode, getActive } from './state';
import { el, sanitizeHtml } from './utils';
import { createCheckbox } from './checkbox';
import { attachSubtaskCheckboxHandlers } from './subtaskHandlers';
import { openPopup } from './popup';
import { showContextMenu, dismissContextMenu } from './contextMenu';
import { annotateContacts } from './contactTooltip';

let dragSrcId: string | null = null;
const renderedActiveHtml = new Map<string, string>();

export function invalidateActiveCache(): void {
    renderedActiveHtml.clear();
}

export function renderActiveList(activeList: HTMLElement): void {
    const currentActive = getActive();
    const newIds = currentActive.map(t => t.id);
    const newIdSet = new Set(newIds);

    // Remove cards no longer present
    for (const card of Array.from(activeList.querySelectorAll<HTMLElement>('.active-card'))) {
        const id = card.getAttribute('data-id');
        if (!id || !newIdSet.has(id)) {
            card.remove();
            if (id) renderedActiveHtml.delete(id);
        }
    }

    // Update or insert cards in order
    let prevCard: HTMLElement | null = null;
    for (const task of currentActive) {
        const existing = activeList.querySelector<HTMLElement>(`[data-id="${CSS.escape(task.id)}"]`);
        if (existing) {
            // Only rebuild if content changed
            if (renderedActiveHtml.get(task.id) !== task.bodyHtml) {
                const fresh = renderActiveCard(activeList, task);
                existing.replaceWith(fresh);
                renderedActiveHtml.set(task.id, task.bodyHtml);
                prevCard = fresh;
            } else {
                // Ensure correct order
                const expectedNext = prevCard ? prevCard.nextSibling : activeList.firstChild;
                if (existing !== expectedNext) {
                    if (prevCard) {
                        prevCard.after(existing);
                    } else {
                        activeList.prepend(existing);
                    }
                }
                prevCard = existing;
            }
        } else {
            const card = renderActiveCard(activeList, task);
            if (prevCard) {
                prevCard.after(card);
            } else {
                activeList.prepend(card);
            }
            renderedActiveHtml.set(task.id, task.bodyHtml);
            prevCard = card;
        }
    }
}

function renderActiveCard(activeList: HTMLElement, task: UITask): HTMLElement {
    const card = el('div', 'task-card active-card');
    if (task.sourceRelativePath) card.classList.add('collected');
    card.setAttribute('data-id', task.id);
    card.draggable = true;

    // Checkbox
    const cb = createCheckbox(false);
    cb.classList.add('checkbox');
    cb.addEventListener('click', (e) => {
        e.stopPropagation();
        card.classList.add('completing');
        cb.replaceWith(createCheckbox(true, true));
        vscode.postMessage({ type: 'complete', id: task.id });
    });

    // Body
    const body = el('div', 'task-body');
    body.innerHTML = sanitizeHtml(task.bodyHtml);
    annotateContacts(body);
    body.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        openPopup('edit', task);
    });
    attachSubtaskCheckboxHandlers(body, task.id);

    // Source link
    const source = el('span', 'source-icon');
    if (task.sourceRelativePath) {
        source.classList.add('codicon', 'codicon-link-external', 'has-source');
        source.title = task.sourceRelativePath;
        source.addEventListener('click', (e) => {
            e.stopPropagation();
            vscode.postMessage({ type: 'openSource', id: task.id });
        });
    }

    card.append(cb, body, source);

    // Drag events
    card.addEventListener('dragstart', (e) => {
        dragSrcId = task.id;
        card.classList.add('dragging');
        e.dataTransfer!.effectAllowed = 'move';
        e.dataTransfer!.setData('text/plain', task.id);
    });
    card.addEventListener('dragend', () => {
        dragSrcId = null;
        card.classList.remove('dragging');
        clearDropIndicators(activeList);
    });
    card.addEventListener('dragover', (e) => {
        if (!dragSrcId || dragSrcId === task.id) return;
        e.preventDefault();
        e.dataTransfer!.dropEffect = 'move';
        clearDropIndicators(activeList);
        const rect = card.getBoundingClientRect();
        const mid = rect.top + rect.height / 2;
        if (e.clientY < mid) {
            card.classList.add('drop-above');
        } else {
            card.classList.add('drop-below');
        }
    });
    card.addEventListener('dragleave', () => {
        card.classList.remove('drop-above', 'drop-below');
    });
    card.addEventListener('drop', (e) => {
        e.preventDefault();
        clearDropIndicators(activeList);
        if (!dragSrcId || dragSrcId === task.id) return;

        const srcCard = activeList.querySelector(`[data-id="${CSS.escape(dragSrcId)}"]`);
        if (!srcCard) return;

        const rect = card.getBoundingClientRect();
        const mid = rect.top + rect.height / 2;
        if (e.clientY < mid) {
            activeList.insertBefore(srcCard, card);
        } else {
            activeList.insertBefore(srcCard, card.nextSibling);
        }

        const ids = Array.from(activeList.querySelectorAll('.active-card'))
            .map(c => c.getAttribute('data-id')!)
            .filter(Boolean);
        vscode.postMessage({ type: 'reorder', ids });
    });

    card.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dismissContextMenu();
        showContextMenu(e.clientX, e.clientY, task, 'active');
    });

    return card;
}

function clearDropIndicators(activeList: HTMLElement): void {
    activeList.querySelectorAll('.drop-above, .drop-below').forEach(node => {
        node.classList.remove('drop-above', 'drop-below');
    });
}
