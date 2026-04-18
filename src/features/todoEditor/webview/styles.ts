export function injectStyles(): void {
    const root = document.getElementById('root') ?? document.body;
    const nonce = root.getAttribute('data-nonce') ?? '';
    const style = document.createElement('style');
    style.setAttribute('nonce', nonce);
    style.textContent = `
/* Container */
.todo-container {
    padding: 0;
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size);
    color: var(--vscode-foreground);
}

/* Toolbar */
.toolbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
}
.toolbar-btn {
    background: transparent;
    color: var(--vscode-foreground);
    border: 1px solid var(--vscode-widget-border);
    border-radius: 4px;
    font-size: 12px;
    padding: 3px 8px;
    cursor: pointer;
    opacity: 0.5;
    transition: opacity 120ms;
    font-family: inherit;
}
.toolbar-btn:hover {
    opacity: 0.85;
}
@keyframes spin {
    from { transform: rotate(0deg); }
    to   { transform: rotate(360deg); }
}
.toolbar-btn.syncing {
    pointer-events: none;
    opacity: 0.85;
}
.toolbar-btn.syncing::before {
    content: '';
    display: inline-block;
    width: 10px;
    height: 10px;
    margin-right: 6px;
    border: 1.5px solid var(--vscode-foreground);
    border-top-color: transparent;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    vertical-align: middle;
}

/* Task card */
.task-card {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    margin-bottom: 6px;
    padding: 6px 10px;
    border-radius: 6px;
    border: 1px solid color-mix(in srgb, var(--vscode-widget-border) 50%, transparent);
    background: var(--vscode-editor-background);
    transition: background 100ms;
    position: relative;
}
.task-card:hover {
    background: var(--vscode-list-hoverBackground);
}

/* Active card grab cursor */
.active-card {
    cursor: grab;
}
.active-card:active {
    cursor: grabbing;
}

/* Checkbox SVG */
.checkbox-svg {
    flex-shrink: 0;
    cursor: pointer;
}
.checkbox {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    align-self: flex-start;
}
/* Invisible text strut that makes the checkbox container match
   the first text line's height at any zoom level. */
.checkbox::after {
    content: '\\200b';
    line-height: 1.45;
    width: 0;
    overflow: hidden;
}

/* Checkbox fill animation */
@keyframes cbFill {
    from { r: 0; }
    to   { r: 7; }
}
.cb-fill-animate {
    animation: cbFill 150ms ease-out;
}

/* Task body */
.task-body {
    flex: 1;
    min-width: 0;
    line-height: 1.45;
    overflow-wrap: break-word;
}
.task-body p {
    margin: 0;
}
.task-body p + p {
    margin-top: 1em;
}
.task-body ul.contains-task-list {
    list-style: none;
    padding-left: 0;
    margin: 4px 0 0;
}
/* Plain list items mixed into a task list (e.g. sub-bullets under a
   checked subtask) need their bullet markers restored. */
.task-body .contains-task-list > li:not(.task-list-item) {
    list-style: disc;
    display: list-item;
    margin-left: 24px;
}
.task-body .contains-task-list .contains-task-list {
    flex-basis: 100%;
    margin-left: -8px;
    margin-right: -4px;
    margin-top: 0;
    padding-left: 32px;
}
.task-body .task-list-item ul:not(.contains-task-list) {
    margin: 2px 0 0;
    padding-left: 20px;
    flex-basis: 100%;
}
.task-body .task-list-item {
    display: flex;
    align-items: flex-start;
    flex-wrap: wrap;
    column-gap: 6px;
    margin-bottom: 2px;
    cursor: pointer;
    border-radius: 4px;
    padding: 3px 8px;
    margin-left: -8px;
    margin-right: -4px;
    transition: background 100ms;
}
.task-body .task-list-item:has(> .contains-task-list) {
    padding-bottom: 0;
}
.task-body .task-list-item:hover:not(:has(.task-list-item:hover)) {
    background: color-mix(in srgb, var(--vscode-foreground) 8%, transparent);
}
.task-body .task-list-item-checkbox {
    margin: 0;
    cursor: pointer;
    width: 18px;
    height: 18px;
    accent-color: var(--vscode-button-background);
    appearance: none;
    -webkit-appearance: none;
    border: 1.2px solid var(--vscode-foreground);
    border-radius: 3px;
    opacity: 0.5;
    background: transparent;
    position: relative;
    flex-shrink: 0;
}
.subtask-checkbox-wrap {
    display: flex;
    align-items: center;
    flex-shrink: 0;
}
/* Invisible text strut matching the text line-height so the
   checkbox centers on the first line at any zoom level. */
.subtask-checkbox-wrap::after {
    content: '\\200b';
    line-height: 1.45;
    width: 0;
    overflow: hidden;
}
.task-body .task-list-item-checkbox:checked {
    opacity: 0.7;
    background: transparent;
    border-color: #4ec963;
}
.task-body .task-list-item-checkbox:checked::after {
    content: '\\2713';
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    font-size: 14px;
    font-weight: bold;
    color: #4ec963;
    line-height: 1;
}
.task-body .subtask-date-pill {
    font-size: 9px;
    background: color-mix(in srgb, var(--vscode-button-background) 15%, transparent);
    color: var(--vscode-descriptionForeground);
    border-radius: 8px;
    padding: 1px 6px;
    white-space: nowrap;
    margin-right: 2px;
    flex-shrink: 0;
    /* Strut trick (same as checkbox-wrap) so the pill centres on the text line */
    display: inline-flex;
    align-items: center;
    line-height: 1.45;
}
.task-body .subtask-date-pill::before {
    content: '\\200b';
    line-height: 1.45;
    font-size: var(--vscode-font-size, 13px);
}
.task-body .subtask-content {
    flex: 1;
    min-width: 0;
    overflow-wrap: break-word;
}

/* Source icon */
.source-icon {
    flex-shrink: 0;
    font-size: 13px;
    opacity: 0;
    cursor: default;
    transition: opacity 100ms;
    line-height: 1;
    padding-top: 2px;
}
.source-icon.has-source {
    cursor: pointer;
}
.task-card:hover .source-icon.has-source {
    opacity: 0.5;
}
.source-icon.has-source:hover {
    opacity: 1 !important;
}

/* Drag states */
.task-card.dragging {
    opacity: 0.4;
    transform: scale(1.02);
    box-shadow: 0 4px 16px rgba(0,0,0,0.2);
}
.task-card.drop-above {
    border-top: 2px solid var(--vscode-focusBorder);
    margin-top: -2px;
}
.task-card.drop-below {
    border-bottom: 2px solid var(--vscode-focusBorder);
    margin-bottom: 6px;
}

/* Completing / uncompleting optimistic */
.task-card.completing {
    opacity: 0.5;
}
.task-card.uncompleting {
    opacity: 0.8;
}

/* Completed card */
.completed-card {
    opacity: 0.6;
}

/* Date badge */
.date-badge {
    flex-shrink: 0;
    background: var(--vscode-badge-background);
    color: var(--vscode-badge-foreground);
    border-radius: 10px;
    padding: 1px 7px;
    font-size: 11px;
    line-height: 1.5;
    white-space: nowrap;
    margin-top: 1px;
}

/* Completed section */
.completed-separator {
    height: 1px;
    background: var(--vscode-widget-border);
    margin: 20px 0 12px;
}
.completed-header {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    user-select: none;
    margin-bottom: 12px;
}
.completed-chevron {
    font-size: 12px;
    opacity: 0.6;
}
.completed-label {
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--vscode-descriptionForeground);
}
.count-pill {
    background: var(--vscode-badge-background);
    color: var(--vscode-badge-foreground);
    border-radius: 10px;
    padding: 1px 7px;
    font-size: 11px;
}
.completed-list {
    display: flex;
    flex-direction: column;
}

/* Empty state */
.empty-state {
    text-align: center;
    padding: 64px 16px;
}
.empty-heading {
    font-size: 16px;
    margin-bottom: 8px;
}
.empty-sub {
    font-size: 13px;
    color: var(--vscode-descriptionForeground);
}

/* Popup overlay */
.popup-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.25);
    display: flex;
    justify-content: center;
    align-items: flex-start;
    padding-top: 15vh;
    z-index: 1000;
}
.popup-dialog {
    width: min(560px, 90vw);
    background: var(--vscode-editorWidget-background);
    border: 1px solid var(--vscode-focusBorder);
    border-radius: 8px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.3);
    padding: 16px;
}
.popup-title {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--vscode-descriptionForeground);
    margin-bottom: 10px;
}
.popup-input-wrap {
    margin-bottom: 6px;
}
.popup-input {
    display: block;
    width: 100%;
    box-sizing: border-box;
    background: var(--vscode-input-background);
    color: var(--vscode-foreground);
    border: 1px solid var(--vscode-input-border);
    border-radius: 4px;
    padding: 6px 8px;
    font-family: inherit;
    font-size: inherit;
    outline: none;
    resize: none;
}
.popup-input:focus {
    border-color: var(--vscode-focusBorder);
}
.popup-textarea {
    min-height: 60px;
    line-height: 1.45;
}
.popup-hint {
    font-size: 11px;
    color: var(--vscode-descriptionForeground);
    margin-bottom: 12px;
}
.popup-buttons {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
}
.popup-btn {
    border-radius: 4px;
    padding: 4px 12px;
    font-size: 12px;
    cursor: pointer;
    border: 1px solid transparent;
    font-family: inherit;
}
.cancel-btn {
    background: transparent;
    color: var(--vscode-foreground);
    border-color: var(--vscode-widget-border);
}
.cancel-btn:hover {
    opacity: 0.85;
}
.primary-btn {
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    border: none;
}
.primary-btn:hover {
    opacity: 0.9;
}

/* Scrollbar */
::-webkit-scrollbar {
    width: 10px;
}
::-webkit-scrollbar-track {
    background: var(--vscode-editor-background);
}
::-webkit-scrollbar-thumb {
    background: var(--vscode-scrollbarSlider-background);
    border-radius: 5px;
}
::-webkit-scrollbar-thumb:hover {
    background: var(--vscode-scrollbarSlider-hoverBackground);
}
::-webkit-scrollbar-thumb:active {
    background: var(--vscode-scrollbarSlider-activeBackground);
}

/* Context menu */
.ctx-menu {
    position: fixed;
    z-index: 2000;
    min-width: 160px;
    background: var(--vscode-menu-background, var(--vscode-editorWidget-background));
    color: var(--vscode-menu-foreground, var(--vscode-foreground));
    border: 1px solid var(--vscode-menu-border, var(--vscode-widget-border));
    border-radius: 5px;
    padding: 4px 0;
    box-shadow: 0 4px 16px rgba(0,0,0,0.28);
    font-size: 12px;
}
.ctx-menu-item {
    padding: 4px 20px;
    cursor: pointer;
    white-space: nowrap;
    transition: background 60ms;
}
.ctx-menu-item:hover {
    background: var(--vscode-menu-selectionBackground, var(--vscode-list-hoverBackground));
    color: var(--vscode-menu-selectionForeground, var(--vscode-foreground));
}
.ctx-menu-item-disabled {
    opacity: 0.4;
    cursor: default;
    pointer-events: none;
}
.ctx-menu-item-danger {
    color: var(--vscode-errorForeground);
}
.ctx-menu-item-danger:hover {
    background: color-mix(in srgb, var(--vscode-errorForeground) 12%, transparent);
}
.ctx-menu-separator {
    height: 1px;
    background: var(--vscode-menu-separatorBackground, var(--vscode-widget-border));
    margin: 4px 0;
}
`;
    document.head.appendChild(style);
}
