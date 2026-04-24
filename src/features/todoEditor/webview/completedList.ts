import type { UITask } from './types';
import { vscode, getCompleted } from './state';
import { el, formatDate, formatDateLong, sanitizeHtml } from './utils';
import { createCheckbox } from './checkbox';
import { attachSubtaskCheckboxHandlers } from './subtaskHandlers';
import { showContextMenu, dismissContextMenu } from './contextMenu';

let completedCollapsed = true;

export function renderCompletedSection(completedSection: HTMLElement): void {
    const currentCompleted = getCompleted();
    completedSection.innerHTML = '';
    if (currentCompleted.length === 0) return;

    const sep = el('div', 'completed-separator');
    const header = el('div', 'completed-header');

    const chevron = el('span', 'completed-chevron');
    chevron.textContent = completedCollapsed ? '▸' : '▾';

    const label = el('span', 'completed-label');
    label.textContent = 'COMPLETED';

    const pill = el('span', 'count-pill');
    pill.textContent = String(currentCompleted.length);

    header.append(chevron, label, pill);
    header.addEventListener('click', () => {
        completedCollapsed = !completedCollapsed;
        renderCompletedSection(completedSection);
    });

    completedSection.append(sep, header);

    if (!completedCollapsed) {
        const list = el('div', 'completed-list');
        for (const task of currentCompleted) {
            list.appendChild(renderCompletedCard(task));
        }
        completedSection.appendChild(list);
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
