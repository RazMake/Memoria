import type { UITask } from './types';
import { vscode, getActive, setActive, setCompleted, setContactTooltips } from './state';
import { el } from './utils';
import { renderActiveList, invalidateActiveCache } from './activeList';
import { renderCompletedSection, invalidateCompletedCache } from './completedList';
import { openPopup, isPopupOpen } from './popup';
import { handleSnippetSuggestions, handleSnippetResult } from './snippetAutocomplete';
import { handleLinkSuggestions } from './linkAutocomplete';
import { handleListKeydown, applyHighlight, validateHighlight } from './keyboardNav';

const root = document.getElementById('root') ?? document.body;
root.textContent = '';

const container = el('div', 'todo-container');
const toolbarEl = el('div', 'toolbar');
const addBtn = el('button', 'toolbar-btn');
addBtn.textContent = '+ Add task';
addBtn.addEventListener('click', () => openPopup('add'));

const syncBtn = el('button', 'toolbar-btn');
syncBtn.textContent = 'Sync';
syncBtn.addEventListener('click', () => {
    syncBtn.classList.add('syncing');
    vscode.postMessage({ type: 'scan' });
});

toolbarEl.append(addBtn, syncBtn);

const activeListEl = el('div', 'active-list');
const completedSectionEl = el('div', 'completed-section');
const emptyState = el('div', 'empty-state');

container.append(toolbarEl, activeListEl, emptyState, completedSectionEl);
root.appendChild(container);

window.addEventListener('message', (e: MessageEvent) => {
    const msg = e.data;
    if (msg?.type === 'update') {
        setActive(msg.active as UITask[]);
        setCompleted(msg.completed as UITask[]);
        renderAll();
        validateHighlight();
    } else if (msg?.type === 'syncDone') {
        syncBtn.classList.remove('syncing');
    } else if (msg?.type === 'contactTooltips') {
        setContactTooltips(msg.entries);
        invalidateActiveCache();
        invalidateCompletedCache();
        renderAll();
        validateHighlight();
    } else if (msg?.type === 'snippetSuggestions') {
        handleSnippetSuggestions(msg.items);
    } else if (msg?.type === 'snippetResult') {
        handleSnippetResult(msg.text);
    } else if (msg?.type === 'linkSuggestions') {
        handleLinkSuggestions(msg.items, msg.queryId);
    }
});

vscode.postMessage({ type: 'ready' });

window.addEventListener('keydown', (e: KeyboardEvent) => {
    // List keyboard navigation (arrows, space, delete, etc.)
    if (handleListKeydown(e)) return;

    if (isPopupOpen()) return;
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (e.key === 'a' || e.key === 'n') {
        e.preventDefault();
        openPopup('add');
    }
});

function renderAll(): void {
    renderActiveList(activeListEl);
    renderCompletedSection(completedSectionEl);
    renderEmptyState();
}

function renderEmptyState(): void {
    if (getActive().length === 0) {
        emptyState.innerHTML = '';
        const heading = el('div', 'empty-heading');
        heading.textContent = 'All clear.';
        const sub = el('div', 'empty-sub');
        sub.textContent = "Add a task with the '+ Add task' button above.";
        emptyState.append(heading, sub);
        emptyState.style.display = '';
        activeListEl.style.display = 'none';
    } else {
        emptyState.style.display = 'none';
        activeListEl.style.display = '';
    }
}
