import { el } from "./domUtils";

export function createInputField(options: {
    field: string;
    label: string;
    value: string;
    placeholder?: string;
    helpText?: string;
    tooltip?: string;
    error?: string;
    readOnly?: boolean;
    type?: string;
    onInput?: (value: string) => void;
}): HTMLElement {
    const field = el("label", "contacts-field");
    const label = el("span", "contacts-field-label");
    label.textContent = options.label;
    if (options.tooltip) {
        label.title = options.tooltip;
        label.classList.add("contacts-field-label-tooltip");
    }

    const input = document.createElement("input");
    input.className = "contacts-field-input";
    input.value = options.value;
    input.placeholder = options.placeholder ?? "";
    input.readOnly = Boolean(options.readOnly);
    input.type = options.type ?? "text";
    input.setAttribute("data-field", options.field);
    if (options.tooltip) {
        input.title = options.tooltip;
    }
    if (options.error) {
        input.classList.add("error");
    }
    if (options.onInput) {
        input.addEventListener("input", () => options.onInput?.(input.value));
    }

    field.append(label, input);
    appendFieldMeta(field, options.helpText);
    return field;
}

export function createSelectField(options: {
    field: string;
    label: string;
    value: string;
    options: Array<{ value: string; label: string; detail?: string; bold?: boolean }>;
    placeholder?: string;
    helpText?: string;
    error?: string;
    disabled?: boolean;
    onChange?: (value: string) => void;
}): HTMLElement {
    const field = el("label", "contacts-field");
    const label = el("span", "contacts-field-label");
    label.textContent = options.label;

    const select = document.createElement("select");
    select.className = "contacts-field-select";
    select.disabled = Boolean(options.disabled);
    select.setAttribute("data-field", options.field);
    if (options.error) {
        select.classList.add("error");
    }

    if (options.placeholder !== undefined) {
        const placeholder = document.createElement("option");
        placeholder.value = "";
        placeholder.textContent = options.placeholder;
        placeholder.disabled = true;
        placeholder.hidden = true;
        select.appendChild(placeholder);
    }

    for (const option of options.options) {
        const optionElement = document.createElement("option");
        optionElement.value = option.value;
        optionElement.textContent = option.detail ? `${option.label} \u2014 ${option.detail}` : option.label;
        if (option.bold) {
            optionElement.style.fontWeight = "bold";
        }
        select.appendChild(optionElement);
    }

    select.value = options.value;

    function updateMuted(): void {
        select.classList.toggle("placeholder-shown", !select.value);
    }
    updateMuted();

    select.addEventListener("change", () => {
        updateMuted();
        options.onChange?.(select.value);
    });

    field.append(label, select);
    appendFieldMeta(field, options.helpText);
    return field;
}

export function createReadOnlyField(options: {
    field: string;
    label: string;
    value: string;
    helpText?: string;
}): HTMLElement {
    return createInputField({
        field: options.field,
        label: options.label,
        value: options.value,
        readOnly: true,
        helpText: options.helpText,
    });
}

function appendFieldMeta(field: HTMLElement, helpText?: string): void {
    if (helpText) {
        const help = el("div", "contacts-field-help");
        help.textContent = helpText;
        field.appendChild(help);
    }
}
