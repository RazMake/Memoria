import { vscode, getActive, getCompleted, getHighlightedId, setHighlightedId } from './state';
import { openPopup, isPopupOpen } from './popup';
import { isCompletedExpanded, toggleCompletedCollapsed } from './completedList';

/**
 * Returns a flat list of all visible task IDs in order:
 * active tasks first, then completed tasks (if expanded).
 */
function getVisibleIds(): string[] {
    const ids: string[] = [];
    for (const t of getActive()) ids.push(t.id);
    if (isCompletedExpanded()) {
        for (const t of getCompleted()) ids.push(t.id);
    }
    return ids;
}

/** Resolve a task (active or completed) by its ID. */
function findTaskById(id: string) {
    for (const t of getActive()) { if (t.id === id) return t; }
    for (const t of getCompleted()) { if (t.id === id) return t; }
    return null;
}

/** Apply the highlight CSS class to the card matching the current highlightedId. */
export function applyHighlight(): void {
    // Remove all existing highlights
    for (const el of Array.from(document.querySelectorAll('.task-card.highlighted'))) {
        el.classList.remove('highlighted');
    }
    const id = getHighlightedId();
    if (!id) return;
    const card = document.querySelector(`.task-card[data-id="${CSS.escape(id)}"]`);
    if (card) {
        card.classList.add('highlighted');
        card.scrollIntoView({ block: 'nearest' });
    }
}

/** Move highlight down by one. If none selected, select first item. */
function moveDown(): void {
    const ids = getVisibleIds();
    if (ids.length === 0) return;
    const cur = getHighlightedId();
    if (cur === null) {
        setHighlightedId(ids[0]);
    } else {
        const idx = ids.indexOf(cur);
        if (idx < ids.length - 1) {
            setHighlightedId(ids[idx + 1]);
        }
    }
    applyHighlight();
}

/** Move highlight up by one. If none selected, select last item. */
function moveUp(): void {
    const ids = getVisibleIds();
    if (ids.length === 0) return;
    const cur = getHighlightedId();
    if (cur === null) {
        setHighlightedId(ids[ids.length - 1]);
    } else {
        const idx = ids.indexOf(cur);
        if (idx > 0) {
            setHighlightedId(ids[idx - 1]);
        }
    }
    applyHighlight();
}

/** Space: toggle complete/uncomplete on highlighted item. */
function toggleComplete(): void {
    const id = getHighlightedId();
    if (!id) return;
    // Determine if active or completed
    if (id.startsWith('a-')) {
        vscode.postMessage({ type: 'complete', id });
    } else if (id.startsWith('c-')) {
        vscode.postMessage({ type: 'uncomplete', id });
    }
}

/** Ctrl+Enter: edit highlighted item (or top item if none selected). */
function editHighlighted(): void {
    let id = getHighlightedId();
    if (!id) {
        const active = getActive();
        if (active.length > 0) {
            id = active[0].id;
            setHighlightedId(id);
            applyHighlight();
        } else {
            return;
        }
    }
    const task = findTaskById(id);
    if (task) {
        openPopup('edit', task);
    }
}

/** Del: delete the highlighted item. */
function deleteHighlighted(): void {
    const id = getHighlightedId();
    if (!id) return;

    // Pre-compute next highlight target
    const ids = getVisibleIds();
    const idx = ids.indexOf(id);
    let nextId: string | null = null;
    if (idx >= 0 && idx < ids.length - 1) {
        nextId = ids[idx + 1];
    } else if (idx > 0) {
        nextId = ids[idx - 1];
    }
    setHighlightedId(nextId);

    vscode.postMessage({ type: 'deleteTask', id });
}

/** Ctrl+Down: swap highlighted item with the one below. */
function swapDown(): void {
    const id = getHighlightedId();
    if (!id) return;
    // Only swap within active list
    const active = getActive();
    const idx = active.findIndex(t => t.id === id);
    if (idx < 0 || idx >= active.length - 1) return;

    // Build new ID order with swapped positions
    const ids = active.map(t => t.id);
    [ids[idx], ids[idx + 1]] = [ids[idx + 1], ids[idx]];
    // COUPLING: IDs use the positional format "a-{index}" assigned by
    // todoEditorProvider.pushUpdate(). If that format changes, update here.
    setHighlightedId(`a-${idx + 1}`);
    vscode.postMessage({ type: 'reorder', ids });
}

/** Ctrl+Up: swap highlighted item with the one above. */
function swapUp(): void {
    const id = getHighlightedId();
    if (!id) return;
    // Only swap within active list
    const active = getActive();
    const idx = active.findIndex(t => t.id === id);
    if (idx <= 0) return;

    const ids = active.map(t => t.id);
    [ids[idx], ids[idx - 1]] = [ids[idx - 1], ids[idx]];
    // COUPLING: IDs use the positional format "a-{index}" assigned by
    // todoEditorProvider.pushUpdate(). If that format changes, update here.
    setHighlightedId(`a-${idx - 1}`);
    vscode.postMessage({ type: 'reorder', ids });
}

/** C: toggle the completed section. When collapsing, move highlight to bottom of active if needed. */
function toggleCompleted(): void {
    const wasExpanded = isCompletedExpanded();
    toggleCompletedCollapsed();

    if (wasExpanded) {
        // Collapsing: if highlight was on a completed item, move to bottom of active
        const id = getHighlightedId();
        if (id && id.startsWith('c-')) {
            const active = getActive();
            if (active.length > 0) {
                setHighlightedId(active[active.length - 1].id);
            } else {
                setHighlightedId(null);
            }
            applyHighlight();
        }
    }
}

/**
 * Main keyboard handler for the todo list (not popup).
 * Returns true if the event was consumed.
 */
export function handleListKeydown(e: KeyboardEvent): boolean {
    if (isPopupOpen()) return false;
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return false;

    // Ctrl+Down / Ctrl+Up: swap items
    if (e.ctrlKey && e.key === 'ArrowDown') {
        e.preventDefault();
        swapDown();
        return true;
    }
    if (e.ctrlKey && e.key === 'ArrowUp') {
        e.preventDefault();
        swapUp();
        return true;
    }

    // Arrow keys (no modifiers): navigate
    if (!e.ctrlKey && !e.altKey && !e.shiftKey) {
        if (e.key === 'Enter') {
            e.preventDefault();
            editHighlighted();
            return true;
        }
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            moveDown();
            return true;
        }
        if (e.key === 'ArrowUp') {
            e.preventDefault();
            moveUp();
            return true;
        }
        if (e.key === ' ') {
            e.preventDefault();
            toggleComplete();
            return true;
        }
        if (e.key === 'Delete') {
            e.preventDefault();
            deleteHighlighted();
            return true;
        }
        if (e.key === 'c' || e.key === 'C') {
            e.preventDefault();
            toggleCompleted();
            return true;
        }
    }

    return false;
}

/**
 * After the popup closes from an edit, re-highlight the edited item.
 * Called from the popup module after a successful edit confirmation.
 */
export function highlightAfterEdit(id: string): void {
    setHighlightedId(id);
    // Apply on next frame so the DOM has updated from the edit
    requestAnimationFrame(() => applyHighlight());
}

/**
 * Ensures the current highlight is still valid after data updates.
 * If the highlighted ID no longer exists, clears the highlight.
 */
export function validateHighlight(): void {
    const id = getHighlightedId();
    if (!id) return;
    const ids = getVisibleIds();
    if (!ids.includes(id)) {
        // Try to find the same position
        // IDs are positional (a-0, a-1, ...) so after reorder the same index
        // might have a different ID. Just clear for simplicity.
        setHighlightedId(null);
    }
    applyHighlight();
}
