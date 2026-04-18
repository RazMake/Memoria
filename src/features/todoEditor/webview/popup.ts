import type { UITask } from './types';
import { vscode } from './state';
import { el } from './utils';

let popupMode: 'add' | 'edit' | null = null;
let popupEditId: string | null = null;
let popupTextareaMode = false;
let popupOverlay: HTMLElement | null = null;

export function isPopupOpen(): boolean {
    return popupMode !== null;
}

export function openPopup(mode: 'add'): void;
export function openPopup(mode: 'edit', task: UITask): void;
export function openPopup(mode: 'add' | 'edit', task?: UITask): void {
    const root = document.getElementById('root') ?? document.body;
    closePopup();
    popupMode = mode;
    popupEditId = task?.id ?? null;

    const markdown = task?.bodyMarkdown ?? '';
    const isMultiLine = markdown.includes('\n');
    popupTextareaMode = isMultiLine;

    popupOverlay = el('div', 'popup-overlay');
    popupOverlay.addEventListener('click', (e) => {
        if (e.target === popupOverlay) closePopup();
    });

    const dialog = el('div', 'popup-dialog');
    dialog.addEventListener('click', (e) => e.stopPropagation());

    const title = el('div', 'popup-title');
    title.textContent = mode === 'add' ? 'ADD TASK' : 'EDIT TASK';

    const inputWrap = el('div', 'popup-input-wrap');
    const hint = el('div', 'popup-hint');

    let activeInput: HTMLInputElement | HTMLTextAreaElement;

    function buildInput(): void {
        inputWrap.innerHTML = '';
        if (popupTextareaMode) {
            const ta = document.createElement('textarea');
            ta.className = 'popup-input popup-textarea';
            ta.value = mode === 'edit' && activeInput === undefined ? markdown : (activeInput?.value ?? '');
            ta.rows = 3;
            ta.placeholder = 'Task description…';
            ta.addEventListener('input', () => autoGrow(ta));
            ta.addEventListener('keydown', handleTextareaKey);
            inputWrap.appendChild(ta);
            activeInput = ta;
            hint.textContent = 'Enter twice at the end to confirm · Ctrl+Enter (anywhere) to confirm · Escape to cancel';
            requestAnimationFrame(() => {
                autoGrow(ta);
                ta.focus();
                ta.setSelectionRange(ta.value.length, ta.value.length);
            });
        } else {
            const inp = document.createElement('input');
            inp.type = 'text';
            inp.className = 'popup-input';
            inp.value = mode === 'edit' && activeInput === undefined ? markdown : (activeInput?.value ?? '');
            inp.placeholder = 'Task description…';
            inp.addEventListener('keydown', handleInputKey);
            inputWrap.appendChild(inp);
            activeInput = inp;
            hint.textContent = 'Enter to confirm · Shift+Enter for multi-line · Escape to cancel';
            requestAnimationFrame(() => {
                inp.focus();
                inp.setSelectionRange(inp.value.length, inp.value.length);
            });
        }
    }

    // Initialize activeInput as undefined (cast is safe — buildInput sets it immediately)
    activeInput = undefined!;
    buildInput();

    function handleInputKey(e: KeyboardEvent): void {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            confirmPopup();
        } else if (e.key === 'Enter' && e.shiftKey) {
            e.preventDefault();
            popupTextareaMode = true;
            const val = activeInput.value;
            buildInput();
            activeInput.value = val + '\n';
            if (activeInput instanceof HTMLTextAreaElement) autoGrow(activeInput);
        } else if (e.key === 'Escape') {
            e.preventDefault();
            closePopup();
        }
    }

    function handleTextareaKey(e: KeyboardEvent): void {
        if (e.key === 'Enter' && e.ctrlKey) {
            e.preventDefault();
            confirmPopup();
            return;
        }
        if (e.key === 'Enter' && !e.shiftKey) {
            const ta = activeInput as HTMLTextAreaElement;
            if (ta.value.endsWith('\n')) {
                e.preventDefault();
                ta.value = ta.value.replace(/\n+$/, '');
                confirmPopup();
                return;
            }
        } else if (e.key === 'Escape') {
            e.preventDefault();
            closePopup();
        }
    }

    function confirmPopup(): void {
        const text = activeInput.value.trim();
        if (!text) { closePopup(); return; }

        if (popupMode === 'add') {
            vscode.postMessage({ type: 'addTask', text });
        } else if (popupMode === 'edit' && popupEditId) {
            vscode.postMessage({ type: 'editTask', id: popupEditId, newBody: text });
        }
        closePopup();
    }

    const btnRow = el('div', 'popup-buttons');

    const cancelBtn = el('button', 'popup-btn cancel-btn');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => closePopup());

    const confirmBtn = el('button', 'popup-btn primary-btn');
    confirmBtn.textContent = mode === 'add' ? 'Add' : 'Save';
    confirmBtn.addEventListener('click', () => confirmPopup());

    btnRow.append(cancelBtn, confirmBtn);
    dialog.append(title, inputWrap, hint, btnRow);
    popupOverlay.appendChild(dialog);
    root.appendChild(popupOverlay);

    popupOverlay.addEventListener('keydown', trapFocus);
}

function closePopup(): void {
    if (popupOverlay) {
        popupOverlay.removeEventListener('keydown', trapFocus);
        popupOverlay.remove();
        popupOverlay = null;
    }
    popupMode = null;
    popupEditId = null;
    popupTextareaMode = false;
}

function trapFocus(e: KeyboardEvent): void {
    if (e.key !== 'Tab' || !popupOverlay) return;
    const focusable = popupOverlay.querySelectorAll<HTMLElement>(
        'input, textarea, button, [tabindex]:not([tabindex="-1"])'
    );
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus(); }
    } else {
        if (document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
}

function autoGrow(ta: HTMLTextAreaElement): void {
    ta.style.height = 'auto';
    ta.style.height = ta.scrollHeight + 'px';
}
