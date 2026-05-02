import type { UITask } from './types';
import { vscode, getCompleted } from './state';
import { el, formatDate, formatDateLong, sanitizeHtml } from './utils';
import { createCheckbox } from './checkbox';
import { attachSubtaskCheckboxHandlers } from './subtaskHandlers';
import { showContextMenu, dismissContextMenu } from './contextMenu';
import { annotateContacts } from './contactTooltip';
import { interceptLocalLinks } from './linkHandler';

let completedCollapsed = true;
/** Tracks rendered bodyHtml per task id to skip unchanged cards. */
const renderedCompletedHtml = new Map<string, string>();

export function invalidateCompletedCache(): void {
    renderedCompletedHtml.clear();
}

export function renderCompletedSection(completedSection: HTMLElement): void {
    const currentCompleted = getCompleted();

    if (currentCompleted.length === 0) {
        completedSection.innerHTML = '';
        renderedCompletedHtml.clear();
        return;
    }

    // Ensure structural elements exist (header row)
    let sep = completedSection.querySelector<HTMLElement>('.completed-separator');
    let header = completedSection.querySelector<HTMLElement>('.completed-header');
    let list = completedSection.querySelector<HTMLElement>('.completed-list');

    if (!sep || !header) {
        completedSection.innerHTML = '';
        renderedCompletedHtml.clear();

        sep = el('div', 'completed-separator');
        header = el('div', 'completed-header');
        completedSection.append(sep, header);
        list = null; // force rebuild below
    }

    // Always rebuild header content (cheap — just text + pill)
    header.innerHTML = '';
    const chevron = el('span', 'completed-chevron');
    chevron.textContent = completedCollapsed ? '▸' : '▾';

    const label = el('span', 'completed-label');
    label.textContent = 'COMPLETED';

    const pill = el('span', 'count-pill');
    pill.textContent = String(currentCompleted.length);

    header.append(chevron, label, pill);
    header.onclick = () => {
        completedCollapsed = !completedCollapsed;
        renderCompletedSection(completedSection);
    };

    if (completedCollapsed) {
        if (list) {
            list.remove();
        }
        renderedCompletedHtml.clear();
        return;
    }

    // Expanded: incrementally update the list (same strategy as activeList)
    if (!list) {
        list = el('div', 'completed-list');
        completedSection.appendChild(list);
    }

    const newIdSet = new Set(currentCompleted.map(t => t.id));

    // Remove cards no longer present
    for (const card of Array.from(list.querySelectorAll<HTMLElement>('.completed-card'))) {
        const id = card.getAttribute('data-id');
        if (!id || !newIdSet.has(id)) {
            card.remove();
            if (id) renderedCompletedHtml.delete(id);
        }
    }

    // Update or insert cards in order
    let prevCard: HTMLElement | null = null;
    for (const task of currentCompleted) {
        const existing = list.querySelector<HTMLElement>(`[data-id="${CSS.escape(task.id)}"]`);
        if (existing) {
            if (renderedCompletedHtml.get(task.id) !== task.bodyHtml) {
                const fresh = renderCompletedCard(task);
                existing.replaceWith(fresh);
                renderedCompletedHtml.set(task.id, task.bodyHtml);
                prevCard = fresh;
            } else {
                const expectedNext = prevCard ? prevCard.nextSibling : list.firstChild;
                if (existing !== expectedNext) {
                    if (prevCard) {
                        prevCard.after(existing);
                    } else {
                        list.prepend(existing);
                    }
                }
                prevCard = existing;
            }
        } else {
            const card = renderCompletedCard(task);
            if (prevCard) {
                prevCard.after(card);
            } else {
                list.prepend(card);
            }
            renderedCompletedHtml.set(task.id, task.bodyHtml);
            prevCard = card;
        }
    }
}

function renderCompletedCard(task: UITask): HTMLElement {
    const card = el('div', 'task-card completed-card');
    if (task.sourceRelativePath) card.classList.add('collected');
    card.setAttribute('data-id', task.id);

    // Checkbox (filled)
    const cb = createCheckbox(true, false);
    cb.classList.add('checkbox');
    cb.addEventListener('click', (e) => {
        e.stopPropagation();
        cb.replaceWith(createCheckbox(false));
        card.classList.add('uncompleting');
        vscode.postMessage({ type: 'uncomplete', id: task.id });
    });

    // Date badge
    const dateBadge = el('span', 'date-badge');
    dateBadge.textContent = task.completedDate ? formatDate(task.completedDate) : '';
    if (task.completedDate) dateBadge.title = formatDateLong(task.completedDate);

    // Body (first line struck through via CSS)
    const body = el('div', 'task-body completed-body');
    body.innerHTML = sanitizeHtml(task.bodyHtml);
    annotateContacts(body);
    interceptLocalLinks(body);
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

    card.append(cb, dateBadge, body, source);

    card.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dismissContextMenu();
        showContextMenu(e.clientX, e.clientY, task, 'completed');
    });

    return card;
}
