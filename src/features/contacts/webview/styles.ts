export function injectStyles(): void {
    const root = document.getElementById("root") ?? document.body;
    const nonce = root.getAttribute("data-nonce") ?? "";
    const style = document.createElement("style");
    style.setAttribute("nonce", nonce);
    style.textContent = `
body {
    padding: 0 !important;
    margin: 0;
}

.contacts-shell {
    --contacts-border: color-mix(in srgb, var(--vscode-widget-border) 68%, transparent);
    --contacts-border-strong: color-mix(in srgb, var(--vscode-focusBorder) 32%, var(--vscode-widget-border) 68%);
    --contacts-surface: color-mix(in srgb, var(--vscode-editorWidget-background) 78%, var(--vscode-sideBar-background) 22%);
    --contacts-surface-strong: color-mix(in srgb, var(--vscode-sideBar-background) 58%, var(--vscode-editor-background) 42%);
    --contacts-surface-muted: color-mix(in srgb, var(--vscode-editor-background) 36%, transparent);
    --contacts-accent: color-mix(in srgb, var(--vscode-button-background) 64%, var(--vscode-focusBorder) 36%);
    --contacts-accent-soft: color-mix(in srgb, var(--contacts-accent) 18%, transparent);
    --contacts-danger: color-mix(in srgb, var(--vscode-inputValidation-errorBorder, #f48771) 72%, var(--vscode-errorForeground, #f48771) 28%);
    min-height: 100vh;
    color: var(--vscode-foreground);
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size);
    background:
        radial-gradient(circle at top right, color-mix(in srgb, var(--contacts-accent) 18%, transparent) 0, transparent 54%),
        linear-gradient(180deg, color-mix(in srgb, var(--contacts-surface) 78%, transparent), transparent 180px),
        var(--vscode-sideBar-background);
}

.contacts-stage {
    position: relative;
    min-height: 100vh;
    overflow: hidden;
}

.contacts-pane {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    min-height: 100vh;
}

.contacts-list-pane {
    background: var(--vscode-sideBar-background);
    transition: transform 200ms ease, opacity 180ms ease, filter 180ms ease;
}

.contacts-form-pane {
    transform: translateX(104%);
    opacity: 0;
    pointer-events: none;
    background: var(--vscode-sideBar-background);
    transition: transform 220ms cubic-bezier(0.22, 1, 0.36, 1), opacity 180ms ease;
}

.contacts-shell.form-open .contacts-list-pane {
    transform: translateX(0);
    opacity: 0;
    pointer-events: none;
    visibility: hidden;
}

.contacts-shell.form-open .contacts-form-pane {
    transform: translateX(0);
    opacity: 1;
    pointer-events: auto;
}

.contacts-list-header {
    position: sticky;
    top: 0;
    z-index: 6;
    padding: 10px 4px 8px;
    border-bottom: 1px solid var(--contacts-border);
    background: var(--vscode-sideBar-background);
    backdrop-filter: blur(16px);
}

.contacts-header-title {
    font-size: 14px;
    font-weight: 700;
    letter-spacing: 0.01em;
}

.contacts-header-subtitle {
    margin-top: 2px;
    color: var(--vscode-descriptionForeground);
    font-size: 11px;
}

.contacts-search-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 6px;
    margin-top: 8px;
}

.contacts-search-input,
.contacts-field-input,
.contacts-field-select {
    width: 100%;
    min-width: 0;
    border: 1px solid var(--contacts-border);
    border-radius: 10px;
    background: color-mix(in srgb, var(--vscode-input-background) 86%, transparent);
    color: var(--vscode-input-foreground);
    font: inherit;
    line-height: 1.3;
    box-sizing: border-box;
    transition: border-color 120ms ease, background 120ms ease, box-shadow 120ms ease;
}

.contacts-search-input:focus,
.contacts-field-input:focus,
.contacts-field-select:focus {
    outline: none;
    border-color: var(--vscode-focusBorder);
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--vscode-focusBorder) 70%, transparent);
}

.contacts-search-input {
    padding: 7px 10px;
}

.contacts-field-input,
.contacts-field-select {
    padding: 9px 10px;
}

.contacts-date-input-wrapper {
    position: relative;
}

.contacts-date-input {
    padding-right: 36px;
}

.contacts-date-picker-button {
    position: absolute;
    top: 50%;
    right: 8px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    padding: 0;
    border: none;
    background: none;
    color: color-mix(in srgb, var(--vscode-foreground) 82%, transparent);
    transform: translateY(-50%);
    cursor: pointer;
}

.contacts-date-picker-button:hover {
    color: var(--vscode-foreground);
}

.contacts-date-picker-button svg {
    width: 16px;
    height: 16px;
}

.contacts-date-calendar {
    position: absolute;
    bottom: calc(100% + 6px);
    top: auto;
    right: 0;
    width: 220px;
    padding: 10px;
    border: 1px solid var(--contacts-border-strong);
    border-radius: 12px;
    background: color-mix(in srgb, var(--contacts-surface) 94%, var(--vscode-sideBar-background) 6%);
    box-shadow: 0 10px 24px color-mix(in srgb, black 24%, transparent);
    display: none;
    z-index: 12;
}

.contacts-date-calendar.open {
    display: block;
}

.contacts-date-calendar-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 8px;
}

.contacts-date-calendar-label {
    font-size: 12px;
    font-weight: 700;
}

.contacts-date-calendar-nav {
    width: 24px;
    height: 24px;
    padding: 0;
    border: 1px solid var(--contacts-border);
    border-radius: 8px;
    background: color-mix(in srgb, var(--contacts-surface-strong) 88%, transparent);
    color: var(--vscode-foreground);
    cursor: pointer;
}

.contacts-date-calendar-weekdays,
.contacts-date-calendar-grid {
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
    gap: 4px;
}

.contacts-date-calendar-weekdays {
    margin-bottom: 6px;
}

.contacts-date-calendar-weekday {
    font-size: 10px;
    text-align: center;
    color: var(--vscode-descriptionForeground);
}

.contacts-date-calendar-day {
    height: 28px;
    padding: 0;
    border: 1px solid transparent;
    border-radius: 8px;
    background: none;
    color: var(--vscode-foreground);
    cursor: pointer;
    font: inherit;
}

.contacts-date-calendar-day:hover {
    background: color-mix(in srgb, var(--contacts-accent) 12%, transparent);
}

.contacts-date-calendar-day.outside-month {
    color: var(--vscode-descriptionForeground);
}

.contacts-date-calendar-day.today {
    border-color: color-mix(in srgb, var(--vscode-focusBorder) 70%, transparent);
}

.contacts-date-calendar-day.selected {
    background: color-mix(in srgb, var(--contacts-accent) 22%, transparent);
    border-color: color-mix(in srgb, var(--contacts-accent) 44%, transparent);
}

.contacts-field-input[readonly] {
    cursor: default;
    background: color-mix(in srgb, var(--vscode-editor-background) 68%, transparent);
    color: color-mix(in srgb, var(--vscode-foreground) 84%, var(--vscode-descriptionForeground) 16%);
}

.contacts-add-button,
.contacts-back-button,
.contacts-primary-button,
.contacts-secondary-button,
.contact-action,
.contact-confirm-button,
.contact-cancel-button {
    border: 1px solid var(--contacts-border);
    border-radius: 10px;
    background: color-mix(in srgb, var(--contacts-surface-strong) 88%, transparent);
    color: var(--vscode-foreground);
    font: inherit;
    cursor: pointer;
    transition: transform 120ms ease, border-color 120ms ease, background 120ms ease, opacity 120ms ease;
}

.contacts-add-button:hover,
.contacts-back-button:hover,
.contacts-primary-button:hover,
.contacts-secondary-button:hover,
.contact-action:hover,
.contact-confirm-button:hover,
.contact-cancel-button:hover {
    border-color: var(--contacts-border-strong);
}

.contacts-add-button:active,
.contacts-back-button:active,
.contacts-primary-button:active,
.contacts-secondary-button:active,
.contact-action:active,
.contact-confirm-button:active,
.contact-cancel-button:active {
    transform: translateY(1px);
}

.contacts-add-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    min-width: 30px;
    padding: 0;
    line-height: 1;
    font-size: 18px;
    font-weight: 800;
    color: var(--vscode-button-foreground);
    border-color: color-mix(in srgb, var(--contacts-accent) 78%, transparent);
    background: linear-gradient(180deg, color-mix(in srgb, var(--contacts-accent) 92%, white 8%), color-mix(in srgb, var(--contacts-accent) 78%, black 22%));
}

.contacts-panel-banner {
    padding: 0 4px;
}

.contacts-banner {
    margin-top: 10px;
    border-radius: 10px;
    border: 1px solid var(--contacts-border);
    padding: 10px 12px;
    font-size: 12px;
    line-height: 1.45;
}

.contacts-banner.info {
    border-color: color-mix(in srgb, var(--contacts-accent) 46%, var(--contacts-border) 54%);
    background: color-mix(in srgb, var(--contacts-accent) 14%, transparent);
}

.contacts-banner.error {
    border-color: color-mix(in srgb, var(--contacts-danger) 62%, var(--contacts-border) 38%);
    background: color-mix(in srgb, var(--contacts-danger) 16%, transparent);
}

.contacts-list-scroll,
.contacts-form-scroll {
    flex: 1;
    overflow-y: auto;
}

.contacts-form-scroll {
    -ms-overflow-style: none;
    scrollbar-width: none;
}

.contacts-form-scroll::-webkit-scrollbar {
    width: 0;
    height: 0;
}

.contacts-list-scroll {
    padding: 6px 4px 28px;
}

.contacts-groups {
    display: grid;
    gap: 10px;
}

.contacts-empty,
.contacts-form-placeholder {
    border: 1px solid var(--contacts-border);
    border-radius: 16px;
    padding: 18px 16px;
    background: color-mix(in srgb, var(--contacts-surface) 72%, transparent);
}

.contacts-empty-title,
.contacts-form-placeholder-title {
    font-size: 13px;
    font-weight: 700;
}

.contacts-empty-subtitle,
.contacts-form-placeholder-subtitle {
    margin-top: 6px;
    color: var(--vscode-descriptionForeground);
    line-height: 1.5;
}

.group-card {
    border: 1px solid var(--contacts-border);
    border-radius: 14px;
    overflow: hidden;
    background: color-mix(in srgb, var(--contacts-surface) 74%, transparent);
    box-shadow: inset 0 1px 0 color-mix(in srgb, white 5%, transparent);
}

.group-summary {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 8px;
    padding: 7px 10px;
    cursor: pointer;
    list-style: none;
    user-select: none;
}

.group-summary::-webkit-details-marker {
    display: none;
}

.group-summary::before {
    content: "";
    width: 8px;
    height: 8px;
    border-right: 1.5px solid color-mix(in srgb, var(--vscode-foreground) 76%, transparent);
    border-bottom: 1.5px solid color-mix(in srgb, var(--vscode-foreground) 76%, transparent);
    transform: rotate(-45deg);
    transition: transform 140ms ease;
}

.group-card[open] .group-summary::before {
    transform: rotate(45deg);
}

.group-title-stack {
    min-width: 0;
}

.group-title {
    font-weight: 700;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.group-meta {
    color: var(--vscode-descriptionForeground);
    font-size: 10px;
}

.group-tags {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 6px;
}

.group-tag,
.contacts-field-chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 3px 7px;
    border-radius: 999px;
    font-size: 10px;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    background: color-mix(in srgb, var(--contacts-accent) 14%, transparent);
    color: color-mix(in srgb, var(--vscode-foreground) 92%, var(--vscode-descriptionForeground) 8%);
}

.group-tag.custom,
.contacts-field-chip.custom {
    background: color-mix(in srgb, var(--vscode-textLink-foreground) 14%, transparent);
}

.group-list {
    display: grid;
}

.group-empty {
    padding: 12px;
    color: var(--vscode-descriptionForeground);
    border-top: 1px solid color-mix(in srgb, var(--contacts-border) 70%, transparent);
}

.contact-row {
    position: relative;
    padding: 8px 10px;
    border-top: 1px solid color-mix(in srgb, var(--contacts-border) 70%, transparent);
    cursor: pointer;
    transition: background 120ms ease, border-color 120ms ease;
}

.contact-row:hover,
.contact-row:focus-visible {
    background: color-mix(in srgb, var(--contacts-accent) 9%, transparent);
}

.contact-row:focus-visible {
    outline: 1px solid var(--vscode-focusBorder);
    outline-offset: -1px;
}

.contact-row.pending-delete {
    background: color-mix(in srgb, var(--contacts-danger) 12%, transparent);
}

.contact-row.pending-delete .contact-copy,
.contact-row.pending-delete .contact-actions {
    visibility: hidden;
}

.contact-copy {
    min-width: 0;
    padding-right: 120px;
}

.contact-line-primary,
.contact-line-secondary {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.contact-line-primary {
    font-size: 12.5px;
}

.contact-primary-name {
    font-weight: 700;
}

.contact-primary-full-name {
    color: var(--vscode-descriptionForeground);
}

.contact-line-secondary {
    margin-top: 3px;
    color: color-mix(in srgb, var(--vscode-foreground) 72%, var(--vscode-descriptionForeground) 28%);
    font-size: 11px;
}

.contact-actions {
    position: absolute;
    top: 8px;
    right: 8px;
    display: flex;
    gap: 6px;
    padding: 3px 4px 3px 18px;
    background: linear-gradient(90deg, transparent, color-mix(in srgb, var(--contacts-surface-strong) 96%, transparent) 18%);
    opacity: 0;
    transform: translateX(8px);
    transition: opacity 120ms ease, transform 120ms ease;
}

.contact-row:hover .contact-actions,
.contact-row:focus-within .contact-actions {
    opacity: 1;
    transform: translateX(0);
}

.contact-action {
    padding: 4px 7px;
    font-size: 10px;
    letter-spacing: 0.04em;
    text-transform: uppercase;
}

.contact-action.delete,
.contact-confirm-button {
    border-color: color-mix(in srgb, var(--contacts-danger) 56%, var(--contacts-border) 44%);
}

.contact-action.move {
    border-color: color-mix(in srgb, var(--contacts-accent) 42%, var(--contacts-border) 58%);
}

.contact-confirm {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 10px 12px;
}

.contact-confirm-copy {
    min-width: 0;
    font-size: 12px;
    font-weight: 600;
}

.contact-confirm-actions {
    display: flex;
    gap: 6px;
}

.contact-confirm-button,
.contact-cancel-button {
    padding: 4px 8px;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
}

.contacts-form-shell {
    display: flex;
    flex-direction: column;
    min-height: 100vh;
}

.contacts-form-scroll {
    padding: 8px 4px 110px;
}

.contacts-form-section {
    margin-bottom: 12px;
    padding: 10px;
    border: 1px solid var(--contacts-border);
    border-radius: 14px;
    background: color-mix(in srgb, var(--contacts-surface) 78%, transparent);
}

.contacts-form-section-title {
    font-size: 12px;
    font-weight: 700;
    margin-bottom: 12px;
}

.contacts-form-note,
.contacts-field-help {
    margin-top: 6px;
    color: var(--vscode-descriptionForeground);
    font-size: 11px;
    line-height: 1.45;
}

.contacts-field {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-bottom: 12px;
}

.contacts-field:last-child {
    margin-bottom: 0;
}

.contacts-field-label {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--vscode-descriptionForeground);
}

.contacts-field-input.error,
.contacts-field-select.error {
    border-color: color-mix(in srgb, var(--contacts-danger) 72%, var(--contacts-border) 28%);
}

.contacts-inline-grid {
    display: grid;
    gap: 12px;
}

.contacts-form-footer {
    position: sticky;
    bottom: 0;
    z-index: 6;
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding: 10px 4px;
    border-top: 1px solid var(--contacts-border);
    background: var(--vscode-sideBar-background);
    backdrop-filter: blur(14px);
}

.contacts-primary-button,
.contacts-secondary-button {
    padding: 4px 17px;
    font-size: 11px;
    font-weight: 600;
}

.contacts-primary-button {
    color: var(--vscode-button-foreground);
    border-color: color-mix(in srgb, var(--contacts-accent) 72%, transparent);
    background: linear-gradient(180deg, color-mix(in srgb, var(--contacts-accent) 90%, white 10%), color-mix(in srgb, var(--contacts-accent) 78%, black 22%));
}

.contacts-primary-button[disabled],
.contacts-secondary-button[disabled],
.contacts-add-button[disabled],
.contacts-back-button[disabled],
.contact-action[disabled],
.contact-confirm-button[disabled],
.contact-cancel-button[disabled] {
    opacity: 0.5;
    cursor: default;
    transform: none;
}

@media (min-width: 420px) {
    .contacts-inline-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
    }
}

@media (prefers-reduced-motion: reduce) {
    .contacts-list-pane,
    .contacts-form-pane,
    .contact-action,
    .contacts-add-button,
    .contacts-primary-button,
    .contacts-secondary-button,
    .contact-confirm-button,
    .contact-cancel-button,
    .group-summary::before,
    .contact-actions {
        transition: none !important;
    }
}

.contacts-toolbar {
    display: flex;
    gap: 2px;
    margin-bottom: 4px;
}

.contacts-toolbar-button {
    border: none;
    background: none;
    color: var(--vscode-descriptionForeground);
    cursor: pointer;
    padding: 2px 4px;
    font-size: 12px;
    line-height: 1;
    border-radius: 4px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    transition: background 100ms ease, color 100ms ease;
}

.contacts-toolbar-button:hover {
    background: color-mix(in srgb, var(--vscode-foreground) 12%, transparent);
    color: var(--vscode-foreground);
}

.contacts-toolbar-glyph {
    font-size: 15px;
    font-weight: 700;
    line-height: 1;
}

.contacts-flat-list {
    display: grid;
    gap: 2px;
}

.contact-group-tag {
    display: inline-flex;
    align-items: center;
    padding: 1px 6px;
    border-radius: 999px;
    font-size: 9px;
    letter-spacing: 0.03em;
    background: color-mix(in srgb, var(--contacts-accent) 14%, transparent);
    color: color-mix(in srgb, var(--vscode-foreground) 80%, var(--vscode-descriptionForeground) 20%);
    margin-left: 6px;
    vertical-align: middle;
}

.contacts-group-count {
    font-size: 11px;
    color: var(--vscode-descriptionForeground);
    font-weight: 400;
    margin-left: 4px;
}

.contacts-field-select.placeholder-shown {
    color: var(--vscode-input-foreground);
}

.contacts-field-label-tooltip {
    cursor: help;
}

.contacts-field-select optgroup {
    font-weight: 700;
    font-style: normal;
    padding-top: 4px;
}

.contacts-title-combo-wrapper {
    position: relative;
}

.contacts-title-combo-input {
    cursor: text;
}

.contacts-title-dropdown {
    display: none;
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    z-index: 10;
    max-height: 220px;
    overflow-y: auto;
    border: 1px solid var(--contacts-border-strong);
    border-top: none;
    border-radius: 0 0 10px 10px;
    background: var(--vscode-input-background);
    box-shadow: 0 4px 12px color-mix(in srgb, black 18%, transparent);
}

.contacts-title-dropdown.open {
    display: block;
}

.contacts-title-group-label {
    padding: 6px 10px 3px;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--vscode-descriptionForeground);
    user-select: none;
}

.contacts-title-option {
    padding: 5px 10px;
    font-size: 12px;
    cursor: pointer;
    transition: background 80ms ease;
}

.contacts-title-option:hover {
    background: color-mix(in srgb, var(--contacts-accent) 14%, transparent);
}

.contacts-title-empty {
    color: var(--vscode-descriptionForeground);
    font-style: italic;
    cursor: default;
}

.contacts-title-empty:hover {
    background: none;
}

.contacts-title-separator {
    height: 1px;
    margin: 4px 10px;
    background: var(--contacts-border);
}
`;

    document.head.appendChild(style);
}