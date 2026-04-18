import type { UITask } from './types';
import { vscode } from './state';
import { el } from './utils';
import { openPopup } from './popup';

let activeMenu: HTMLElement | null = null;

export function showContextMenu(
    x: number,
    y: number,
    task: UITask,
    section: 'active' | 'completed',
): void {
    dismissContextMenu();

    const menu = el('div', 'ctx-menu');

    // 1. Complete / Reactivate
    const toggleItem = el('div', 'ctx-menu-item');
    if (section === 'active') {
        toggleItem.textContent = 'Complete';
        toggleItem.addEventListener('click', () => {
            vscode.postMessage({ type: 'complete', id: task.id });
            dismissContextMenu();
        });
    } else {
        toggleItem.textContent = 'Reactivate';
        toggleItem.addEventListener('click', () => {
            vscode.postMessage({ type: 'uncomplete', id: task.id });
            dismissContextMenu();
        });
    }
    menu.appendChild(toggleItem);

    // 2. Edit
    const editItem = el('div', 'ctx-menu-item');
    editItem.textContent = 'Edit';
    editItem.addEventListener('click', () => {
        dismissContextMenu();
        openPopup('edit', task);
    });
    menu.appendChild(editItem);

    // 3. Separator
    menu.appendChild(el('div', 'ctx-menu-separator'));

    // 4. Open source file to the side
    const openSourceItem = el('div', 'ctx-menu-item');
    openSourceItem.textContent = 'Open source file to the side';
    if (task.sourceRelativePath) {
        openSourceItem.addEventListener('click', () => {
            vscode.postMessage({ type: 'openSource', id: task.id });
            dismissContextMenu();
        });
    } else {
        openSourceItem.classList.add('ctx-menu-item-disabled');
    }
    menu.appendChild(openSourceItem);

    // 5. Open source file (same tab group)
    const openSourceInPlaceItem = el('div', 'ctx-menu-item');
    openSourceInPlaceItem.textContent = 'Open source file';
    if (task.sourceRelativePath) {
        openSourceInPlaceItem.addEventListener('click', () => {
            vscode.postMessage({ type: 'openSourceInPlace', id: task.id });
            dismissContextMenu();
        });
    } else {
        openSourceInPlaceItem.classList.add('ctx-menu-item-disabled');
    }
    menu.appendChild(openSourceInPlaceItem);


    // 6. Separator
    menu.appendChild(el('div', 'ctx-menu-separator'));

    // 7. Delete
    const deleteItem = el('div', 'ctx-menu-item ctx-menu-item-danger');
    deleteItem.textContent = 'Delete';
    deleteItem.addEventListener('click', () => {
        vscode.postMessage({ type: 'deleteTask', id: task.id });
        dismissContextMenu();
    });
    menu.appendChild(deleteItem);

    document.body.appendChild(menu);
    activeMenu = menu;

    // Position: ensure menu stays within viewport
    const rect = menu.getBoundingClientRect();
    const maxX = window.innerWidth - rect.width - 4;
    const maxY = window.innerHeight - rect.height - 4;
    menu.style.left = `${Math.max(0, Math.min(x, maxX))}px`;
    menu.style.top = `${Math.max(0, Math.min(y, maxY))}px`;
}

export function dismissContextMenu(): void {
    if (activeMenu) {
        activeMenu.remove();
        activeMenu = null;
    }
}

// Close on any click outside or Escape
document.addEventListener('click', () => dismissContextMenu());
document.addEventListener('contextmenu', (e) => {
    // If right-clicking outside a task card, dismiss
    if (activeMenu && !(e.target as HTMLElement).closest('.ctx-menu')) {
        dismissContextMenu();
    }
});
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') dismissContextMenu();
});
