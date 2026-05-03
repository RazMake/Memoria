import { formatIsoDateForDisplay, moveDateSelectionByTab, parseDisplayDateToIso, sanitizeDateDisplayInput } from "./dateInput";
import { clearElement, el } from "./domUtils";

export function createDateInputField(options: {
    field: string;
    label: string;
    value: string;
    displayValue: string;
    helpText?: string;
    error?: string;
    onInput?: (displayValue: string, isoValue: string, commit: boolean) => void;
}): HTMLElement {
    const field = el("label", "contacts-field");
    const label = el("span", "contacts-field-label");
    label.textContent = options.label;

    const wrapper = el("div", "contacts-date-input-wrapper");

    const input = document.createElement("input");
    input.type = "text";
    input.className = "contacts-field-input contacts-date-input";
    input.value = options.displayValue;
    input.placeholder = "mm/dd/yyyy";
    input.autocomplete = "off";
    input.spellcheck = false;
    input.inputMode = "numeric";
    input.maxLength = 10;
    input.setAttribute("data-field", options.field);
    if (options.error) {
        input.classList.add("error");
    }

    const pickerButton = document.createElement("button");
    pickerButton.type = "button";
    pickerButton.className = "contacts-date-picker-button";
    pickerButton.setAttribute("aria-label", "Open calendar");
    pickerButton.setAttribute("aria-haspopup", "dialog");
    pickerButton.setAttribute("aria-expanded", "false");
    pickerButton.innerHTML = '<svg viewBox="0 0 16 16"><path d="M4 1.75a.75.75 0 0 1 1.5 0V3h5V1.75a.75.75 0 0 1 1.5 0V3h.25A1.75 1.75 0 0 1 14 4.75v7.5A1.75 1.75 0 0 1 12.25 14h-8.5A1.75 1.75 0 0 1 2 12.25v-7.5A1.75 1.75 0 0 1 3.75 3H4V1.75ZM3.5 6.5v5.75c0 .138.112.25.25.25h8.5a.25.25 0 0 0 .25-.25V6.5h-9Zm9-1.5v-.25a.25.25 0 0 0-.25-.25h-8.5a.25.25 0 0 0-.25.25V5h9Z" fill="currentColor"/></svg>';

    const calendar = el("div", "contacts-date-calendar");
    calendar.setAttribute("role", "dialog");
    calendar.setAttribute("aria-label", "Choose a date");

    const calendarHeader = el("div", "contacts-date-calendar-header");
    const previousMonthButton = document.createElement("button");
    previousMonthButton.type = "button";
    previousMonthButton.className = "contacts-date-calendar-nav";
    previousMonthButton.setAttribute("aria-label", "Previous month");
    previousMonthButton.textContent = "<";

    const monthLabel = el("div", "contacts-date-calendar-label");

    const nextMonthButton = document.createElement("button");
    nextMonthButton.type = "button";
    nextMonthButton.className = "contacts-date-calendar-nav";
    nextMonthButton.setAttribute("aria-label", "Next month");
    nextMonthButton.textContent = ">";

    calendarHeader.append(previousMonthButton, monthLabel, nextMonthButton);

    const weekdayHeader = el("div", "contacts-date-calendar-weekdays");
    for (const weekday of ["S", "M", "T", "W", "T", "F", "S"]) {
        const weekdayLabel = el("div", "contacts-date-calendar-weekday");
        weekdayLabel.textContent = weekday;
        weekdayHeader.appendChild(weekdayLabel);
    }

    const dayGrid = el("div", "contacts-date-calendar-grid");
    calendar.append(calendarHeader, weekdayHeader, dayGrid);

    let calendarOpen = false;
    let selectedIsoValue = options.value;
    let visibleMonth = getCalendarMonthState(selectedIsoValue);
    let outsideClickController: AbortController | null = null;

    const closeCalendar = (): void => {
        calendarOpen = false;
        calendar.classList.remove("open");
        pickerButton.setAttribute("aria-expanded", "false");
        outsideClickController?.abort();
        outsideClickController = null;
    };

    const syncCalendarSelection = (isoValue: string): void => {
        selectedIsoValue = isoValue;
        if (isoValue) {
            visibleMonth = getCalendarMonthState(isoValue);
        }

        if (calendarOpen) {
            renderCalendar();
        }
    };

    const commitDateValue = (render: boolean): void => {
        const displayValue = sanitizeDateDisplayInput(input.value);
        const isoValue = parseDisplayDateToIso(displayValue);
        if (isoValue) {
            const normalizedDisplayValue = formatIsoDateForDisplay(isoValue);
            input.value = normalizedDisplayValue;
            syncCalendarSelection(isoValue);
            options.onInput?.(normalizedDisplayValue, isoValue, render);
            return;
        }

        if (input.value !== displayValue) {
            input.value = displayValue;
        }

        syncCalendarSelection("");
        options.onInput?.(displayValue, "", render);
    };

    const focusAdjacentFormControl = (direction: 1 | -1): boolean => {
        const form = input.closest("form");
        if (!(form instanceof HTMLFormElement)) {
            return false;
        }

        const focusableElements = [...form.querySelectorAll<HTMLElement>("input, select, textarea, button, [tabindex]")].filter((element) => {
            if (element === input) {
                return true;
            }

            if (element.tabIndex < 0 || element.hasAttribute("disabled")) {
                return false;
            }

            if (element.classList.contains("contacts-date-picker-button") || element.closest(".contacts-date-calendar")) {
                return false;
            }

            return element.offsetParent !== null;
        });

        const currentIndex = focusableElements.indexOf(input);
        if (currentIndex < 0) {
            return false;
        }

        const target = focusableElements[currentIndex + direction];
        if (!target) {
            return false;
        }

        target.focus();
        if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
            target.select();
        }
        return true;
    };

    const renderCalendar = (): void => {
        monthLabel.textContent = formatCalendarMonthLabel(visibleMonth.year, visibleMonth.month);
        clearElement(dayGrid);

        const selectedIso = selectedIsoValue;
        const today = new Date();
        const cells = buildCalendarCells(visibleMonth.year, visibleMonth.month);
        for (const cell of cells) {
            const dayButton = document.createElement("button");
            dayButton.type = "button";
            dayButton.className = "contacts-date-calendar-day";
            dayButton.textContent = String(cell.day);
            if (!cell.inCurrentMonth) {
                dayButton.classList.add("outside-month");
            }
            if (cell.iso === selectedIso) {
                dayButton.classList.add("selected");
            }
            if (isTodayCell(cell.year, cell.month, cell.day, today)) {
                dayButton.classList.add("today");
            }

            dayButton.addEventListener("click", () => {
                const isoValue = toIsoDate(cell.year, cell.month, cell.day);
                const displayValue = formatIsoDateForDisplay(isoValue);
                input.value = displayValue;
                syncCalendarSelection(isoValue);
                closeCalendar();
                options.onInput?.(displayValue, isoValue, true);
            });

            dayGrid.appendChild(dayButton);
        }
    };

    const openCalendar = (): void => {
        const parsedIsoValue = parseDisplayDateToIso(input.value);
        if (parsedIsoValue) {
            syncCalendarSelection(parsedIsoValue);
        } else if (!input.value.trim() && !selectedIsoValue) {
            visibleMonth = getCalendarMonthState("");
        }

        renderCalendar();
        calendarOpen = true;
        calendar.classList.add("open");
        pickerButton.setAttribute("aria-expanded", "true");

        outsideClickController?.abort();
        outsideClickController = new AbortController();
        document.addEventListener("pointerdown", (event) => {
            const target = event.target;
            if (target instanceof Node && wrapper.contains(target)) {
                return;
            }

            closeCalendar();
        }, { capture: true, signal: outsideClickController.signal });
    };

    wrapper.addEventListener("keydown", (event: KeyboardEvent) => {
        if (event.key !== "Escape" || !calendarOpen) {
            return;
        }

        event.preventDefault();
        event.stopPropagation();
        closeCalendar();
    });

    pickerButton.addEventListener("pointerdown", (event) => {
        event.preventDefault();
    });

    calendar.addEventListener("pointerdown", (event) => {
        const target = event.target;
        if (target instanceof HTMLElement && target.closest("button")) {
            event.preventDefault();
        }
    });

    input.addEventListener("input", () => {
        const displayValue = sanitizeDateDisplayInput(input.value);
        const isoValue = parseDisplayDateToIso(displayValue) ?? "";
        if (input.value !== displayValue) {
            input.value = displayValue;
        }

        syncCalendarSelection(isoValue);
        options.onInput?.(displayValue, isoValue, false);
    });

    input.addEventListener("keydown", (event: KeyboardEvent) => {
        if (event.key !== "Tab") {
            return;
        }

        const navigation = moveDateSelectionByTab(
            input.value,
            input.selectionStart ?? input.value.length,
            event.shiftKey ? -1 : 1,
        );
        if (!navigation) {
            commitDateValue(false);
            if (focusAdjacentFormControl(event.shiftKey ? -1 : 1)) {
                event.preventDefault();
            }
            return;
        }

        event.preventDefault();
        if (input.value !== navigation.value) {
            input.value = navigation.value;
            const isoValue = parseDisplayDateToIso(navigation.value) ?? "";
            syncCalendarSelection(isoValue);
            options.onInput?.(navigation.value, isoValue, false);
        }

        input.setSelectionRange(navigation.selectionStart, navigation.selectionEnd);
    });

    input.addEventListener("blur", (event: FocusEvent) => {
        if (!input.isConnected) {
            return;
        }

        const nextFocusTarget = event.relatedTarget;
        if (nextFocusTarget instanceof Node && wrapper.contains(nextFocusTarget)) {
            return;
        }

        commitDateValue(!(nextFocusTarget instanceof HTMLElement));
    });

    pickerButton.addEventListener("click", (event) => {
        event.preventDefault();
        if (calendarOpen) {
            closeCalendar();
            return;
        }

        openCalendar();
    });

    previousMonthButton.addEventListener("click", () => {
        visibleMonth = shiftCalendarMonth(visibleMonth, -1);
        renderCalendar();
    });

    nextMonthButton.addEventListener("click", () => {
        visibleMonth = shiftCalendarMonth(visibleMonth, 1);
        renderCalendar();
    });

    wrapper.append(input, pickerButton, calendar);
    field.append(label, wrapper);
    appendFieldMeta(field, options.helpText);
    return field;
}

function appendFieldMeta(field: HTMLElement, helpText?: string): void {
    if (helpText) {
        const help = el("div", "contacts-field-help");
        help.textContent = helpText;
        field.appendChild(help);
    }
}

function getCalendarMonthState(isoValue: string): { year: number; month: number } {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoValue.trim());
    if (match) {
        return {
            year: Number(match[1]),
            month: Number(match[2]) - 1,
        };
    }

    const today = new Date();
    return {
        year: today.getFullYear(),
        month: today.getMonth(),
    };
}

function shiftCalendarMonth(monthState: { year: number; month: number }, delta: number): { year: number; month: number } {
    const nextDate = new Date(monthState.year, monthState.month + delta, 1);
    return {
        year: nextDate.getFullYear(),
        month: nextDate.getMonth(),
    };
}

function formatCalendarMonthLabel(year: number, month: number): string {
    return new Intl.DateTimeFormat(undefined, {
        month: "long",
        year: "numeric",
    }).format(new Date(year, month, 1));
}

function buildCalendarCells(year: number, month: number): Array<{ year: number; month: number; day: number; iso: string; inCurrentMonth: boolean }> {
    const firstDay = new Date(year, month, 1);
    const startOffset = firstDay.getDay();
    const startDate = new Date(year, month, 1 - startOffset);
    const cells: Array<{ year: number; month: number; day: number; iso: string; inCurrentMonth: boolean }> = [];

    for (let index = 0; index < 42; index += 1) {
        const current = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + index);
        cells.push({
            year: current.getFullYear(),
            month: current.getMonth(),
            day: current.getDate(),
            iso: toIsoDate(current.getFullYear(), current.getMonth(), current.getDate()),
            inCurrentMonth: current.getMonth() === month,
        });
    }

    return cells;
}

function toIsoDate(year: number, month: number, day: number): string {
    return `${String(year).padStart(4, "0")}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function isTodayCell(year: number, month: number, day: number, today: Date): boolean {
    return year === today.getFullYear()
        && month === today.getMonth()
        && day === today.getDate();
}
