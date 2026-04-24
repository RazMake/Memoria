import {
    buildColleagueTitleOptions,
    buildLevelOptions,
    buildReportTitleOptions,
    cloneContact,
    createFormState,
    findContact,
    findGroup,
    getMoveTargets,
    getTargetGroupKind,
    NEW_GROUP_VALUE,
    synchronizeFormDraft,
    validateForm,
} from "./formModel";
import { formatIsoDateForDisplay, moveDateSelectionByTab, parseDisplayDateToIso, sanitizeDateDisplayInput } from "./dateInput";
import {
    clearBanner,
    closeForm,
    getState,
    openForm,
    setBanner,
    setGroupExpanded,
    setPendingDeleteContactId,
    setSearch,
    setSnapshot,
    setSubmitting,
    updateActiveForm,
    vscode,
} from "./state";
import { createModifierKeyTracker } from "./modifierKeys";
import { injectStyles } from "./styles";
import type { Contact, ContactsFormState, ContactsViewContact, ContactsViewToWebviewMessage } from "./types";

const root = document.getElementById("root") ?? document.body;
const modifierKeys = createModifierKeyTracker();

const shell = el("div", "contacts-shell");
const stage = el("div", "contacts-stage");

const listPane = el("section", "contacts-pane contacts-list-pane");
const listHeader = el("div", "contacts-list-header");
const listHeaderTitle = el("div", "contacts-header-title");
const listHeaderSubtitle = el("div", "contacts-header-subtitle");
const searchRow = el("div", "contacts-search-row");
const searchInput = document.createElement("input");
searchInput.type = "search";
searchInput.className = "contacts-search-input";
searchInput.placeholder = "Search people";
searchInput.autocomplete = "off";
searchInput.spellcheck = false;

const addButton = document.createElement("button");
addButton.type = "button";
addButton.className = "contacts-add-button";
addButton.textContent = "+";
addButton.setAttribute("aria-label", "Add person");

const listBannerHost = el("div", "contacts-panel-banner");
const listScroll = el("div", "contacts-list-scroll");
const listToolbar = el("div", "contacts-toolbar");
const groupsHost = el("div", "contacts-groups");

const formPane = el("section", "contacts-pane contacts-form-pane");

searchRow.append(searchInput, addButton);
listHeader.append(listHeaderTitle, listHeaderSubtitle, searchRow);
listScroll.append(listToolbar, groupsHost);
listPane.append(listHeader, listBannerHost, listScroll);

stage.append(listPane, formPane);
shell.appendChild(stage);
root.appendChild(shell);

injectStyles();

searchInput.addEventListener("input", () => {
    setSearch(searchInput.value);
    renderList();
});

addButton.addEventListener("click", () => {
    const snapshot = getState().snapshot;
    if (!snapshot?.active) {
        return;
    }

    clearBanner();
    vscode.postMessage({
        type: "open",
        mode: "add",
        preferredGroupFile: snapshot.groups[0]?.file,
    });
});

window.addEventListener("message", (event: MessageEvent) => {
    const message = event.data;
    if (!isWebviewMessage(message)) {
        return;
    }

    switch (message.type) {
        case "update":
            setSnapshot(message.snapshot);
            renderAll();
            break;
        case "open": {
            const snapshot = getState().snapshot;
            if (!snapshot) {
                return;
            }

            const form = createFormState(snapshot, message.request);
            if (!form) {
                setBanner({
                    tone: "error",
                    message: "Memoria: The requested contact or destination group is no longer available.",
                });
                renderAll();
                return;
            }

            openForm(form);
            renderAll();
            break;
        }
        case "saved": {
            closeForm();
            renderAll();
            break;
        }
        case "error":
            setSubmitting(false);
            setBanner({
                tone: "error",
                message: message.message,
            });
            renderAll({ preserveFormFocus: true });
            break;
    }
});

window.addEventListener("keydown", (event: KeyboardEvent) => {
    const state = getState();
    const target = event.target;
    const isEditableTarget = target instanceof HTMLInputElement
        || target instanceof HTMLTextAreaElement
        || target instanceof HTMLSelectElement;

    if (event.key === "Escape") {
        if (state.pendingDeleteContactId) {
            setPendingDeleteContactId(null);
            renderList();
            return;
        }

        if (state.activeForm && !state.submitting) {
            closeForm();
            renderAll();
        }
        return;
    }

    if (event.key === "/" && !isEditableTarget) {
        event.preventDefault();
        searchInput.focus();
        searchInput.select();
    }
});

vscode.postMessage({ type: "ready" });

renderAll();

function renderAll(options?: { preserveFormFocus?: boolean }): void {
    shell.classList.toggle("form-open", Boolean(getState().activeForm));
    renderList();
    renderFormPane(Boolean(options?.preserveFormFocus));
}

function renderList(): void {
    const state = getState();
    const snapshot = state.snapshot;
    const searchQuery = state.search.trim().toLowerCase();

    searchInput.value = state.search;
    addButton.disabled = !snapshot?.active;

    renderBanner(listBannerHost, state.activeForm ? null : state.banner);
    clearElement(groupsHost);
    clearElement(listToolbar);

    if (!snapshot) {
        listHeaderTitle.textContent = "";
        listHeaderSubtitle.textContent = "Waiting for the sidebar to initialize.";
        groupsHost.appendChild(createEmptyState("Loading contacts", "Open the Contacts view after the feature is activated."));
        return;
    }

    if (!snapshot.active) {
        listHeaderTitle.textContent = "";
        listHeaderSubtitle.textContent = "Contacts is not enabled for this workspace.";
        groupsHost.appendChild(createEmptyState("Contacts is unavailable", "Enable the contacts feature to browse or edit people from the sidebar."));
        return;
    }

    listHeaderTitle.textContent = "";
    listHeaderSubtitle.textContent = buildHeaderSubtitle(snapshot.contacts.length, snapshot.groups.length, searchQuery.length > 0);

    if (searchQuery) {
        const matchedContacts = snapshot.contacts.filter((contact) => matchesSearch(contact, searchQuery));
        if (matchedContacts.length === 0) {
            groupsHost.appendChild(createEmptyState("No matches", "Search by nickname, full name, id, or title."));
            return;
        }

        const flatList = el("div", "contacts-flat-list");
        for (const contact of matchedContacts) {
            flatList.appendChild(createContactRow(contact, true));
        }
        groupsHost.appendChild(flatList);
        return;
    }

    listToolbar.append(createToolbarButton("expand-all", "+", "Expand all", () => {
        for (const group of snapshot.groups) {
            setGroupExpanded(group.file, true);
        }
        renderList();
    }), createToolbarButton("collapse-all", "−", "Collapse all", () => {
        for (const group of snapshot.groups) {
            setGroupExpanded(group.file, false);
        }
        renderList();
    }));

    const groupedContacts = snapshot.groups.map((group) => {
        const contacts = snapshot.contacts.filter((contact) => contact.groupFile === group.file);
        return { group, contacts };
    });

    if (groupedContacts.length === 0) {
        groupsHost.appendChild(createEmptyState("No contacts", "Add someone using the + button above."));
        return;
    }

    for (const entry of groupedContacts) {
        groupsHost.appendChild(createGroupCard(entry.group, entry.contacts));
    }
}

function renderFormPane(preserveFocus: boolean): void {
    const preservedFocus = preserveFocus ? captureFocus(formPane) : null;
    clearElement(formPane);

    const state = getState();
    const snapshot = state.snapshot;
    if (!snapshot?.active || !state.activeForm) {
        formPane.appendChild(createFormPlaceholder(snapshot?.active === true));
        if (preservedFocus) {
            restoreFocus(formPane, preservedFocus);
        }
        return;
    }

    const formState = state.activeForm;
    synchronizeFormDraft(formState, snapshot);

    const sourceGroup = formState.sourceGroupFile
        ? findGroup(snapshot, formState.sourceGroupFile)
        : null;
    const targetKind = getTargetGroupKind(snapshot, formState);

    const form = document.createElement("form");
    form.className = "contacts-form-shell";
    form.noValidate = true;
    form.addEventListener("submit", (event) => {
        event.preventDefault();
        handleSave();
    });

    const bannerHost = el("div", "contacts-panel-banner");
    renderBanner(bannerHost, state.banner);
    form.appendChild(bannerHost);

    const body = el("div", "contacts-form-scroll");
    const generalSection = el("section", "contacts-form-section");
    const generalTitle = el("div", "contacts-form-section-title");
    generalTitle.textContent = formState.mode === "move" ? "Destination" : "Details";
    generalSection.appendChild(generalTitle);

    appendGroupField(generalSection, formState, snapshot, sourceGroup?.name ?? null);

    const idReadOnly = formState.mode !== "add";
    generalSection.appendChild(createInputField({
        field: "id",
        label: "Id",
        value: formState.draft.id,
        readOnly: idReadOnly,
        placeholder: "alias",
        error: formState.errors.id,
        onInput: (value) => mutateForm((formDraft) => {
            formDraft.draft.id = value.toLowerCase();
        }, { clearErrors: ["id"] }),
    }));

    generalSection.appendChild(createInputField({
        field: "nickname",
        label: "Nickname",
        value: formState.draft.nickname,
        placeholder: "Alice",
        error: formState.errors.nickname,
        onInput: (value) => mutateForm((formDraft) => {
            formDraft.draft.nickname = toTitleCase(value);
        }, { clearErrors: ["nickname"] }),
    }));

    generalSection.appendChild(createInputField({
        field: "fullName",
        label: "Full name",
        value: formState.draft.fullName,
        placeholder: "Alice Anderson",
        error: formState.errors.fullName,
        onInput: (value) => mutateForm((formDraft) => {
            formDraft.draft.fullName = toTitleCase(value);
        }, { clearErrors: ["fullName"] }),
    }));

    generalSection.appendChild(createSelectField({
        field: "pronounsKey",
        label: "Pronouns",
        value: formState.draft.pronounsKey,
        placeholder: "Select the pronouns",
        options: snapshot.referenceData.pronouns.map((pronouns) => {
            const display = `${pronouns.subject}/${pronouns.object}`;
            return {
                value: pronouns.key,
                label: display === pronouns.key ? pronouns.key : pronouns.key,
                detail: display !== pronouns.key ? display : undefined,
            };
        }),
        error: formState.errors.pronounsKey,
        onChange: (value) => mutateForm((formDraft) => {
            formDraft.draft.pronounsKey = value;
        }, { clearErrors: ["pronounsKey"] }),
    }));

    body.appendChild(generalSection);

    const roleSection = el("section", "contacts-form-section");
    const roleTitle = el("div", "contacts-form-section-title");
    roleTitle.textContent = targetKind === "report" ? "Role and level" : "Role";
    roleSection.appendChild(roleTitle);

    roleSection.appendChild(createSelectField({
        field: "careerPathKey",
        label: "Career path",
        value: formState.draft.careerPathKey,
        placeholder: "Select the career path",
        options: snapshot.referenceData.careerPaths.map((careerPath) => ({
            value: careerPath.key,
            label: `${careerPath.name} (${careerPath.short})`,
        })),
        error: formState.errors.careerPathKey,
        onChange: (value) => mutateForm((formDraft) => {
            formDraft.draft.careerPathKey = value;
        }, { clearErrors: true, resync: true }),
    }));

    if (formState.draft.kind === "report") {
        const levelOptions = buildLevelOptions(snapshot, formState.draft);
        roleSection.appendChild(createSelectField({
            field: "levelId",
            label: "Level",
            value: formState.draft.levelId,
            placeholder: formState.draft.careerPathKey ? "Select the level" : "Select a career path first",
            options: levelOptions,
            disabled: !formState.draft.careerPathKey,
            helpText: levelOptions.length === 0 && formState.draft.careerPathKey
                    ? "No levels are available for this career path."
                    : undefined,
            error: formState.errors.levelId,
            onChange: (value) => mutateForm((formDraft) => {
                if (formDraft.draft.kind === "report") {
                    formDraft.draft.levelId = value;
                }
            }, { clearErrors: true, resync: true }),
        }));

        const reportTitleOptions = buildReportTitleOptions(snapshot, formState);
        if (reportTitleOptions.length > 1) {
            roleSection.appendChild(createSelectField({
                field: "reportTitleMode",
                label: "Title",
                value: formState.reportTitleMode,
                options: reportTitleOptions,
                error: formState.errors.title,
                helpText: "Pick the stored custom title or switch back to the generated title.",
                onChange: (value) => mutateForm((formDraft) => {
                    formDraft.reportTitleMode = value === "custom" ? "custom" : "generated";
                }, { clearErrors: true, resync: true }),
            }));
        } else {
            roleSection.appendChild(createInputField({
                field: "title",
                label: "Title",
                value: formState.draft.title,
                readOnly: true,
                placeholder: "Choose a career path and level",
                tooltip: formState.reportTitleMode === "custom"
                    ? "This contact currently stores a custom title."
                    : "Report titles are generated from the selected career path and level.",
                error: formState.errors.title,
            }));
        }

        roleSection.appendChild(createDateInputField({
            field: "levelStartDate",
            label: "Level start date",
            value: formState.draft.levelStartDate,
            displayValue: formState.levelStartDateDisplay,
            error: formState.errors.levelStartDate,
            onInput: (displayValue, isoValue, commit) => mutateForm((formDraft) => {
                if (formDraft.draft.kind === "report") {
                    formDraft.levelStartDateDisplay = displayValue;
                    formDraft.draft.levelStartDate = isoValue;
                }
            }, { clearErrors: ["levelStartDate"], render: commit }),
        }));
    } else {
        roleSection.appendChild(createGroupedTitleField({
            field: "title",
            label: "Title",
            value: formState.draft.title,
            placeholder: "Select the title",
            snapshot,
            currentTitle: formState.draft.title,
            error: formState.errors.title,
            onChange: (value, careerPathKey) => mutateForm((formDraft) => {
                formDraft.draft.title = value;
                if (careerPathKey) {
                    formDraft.draft.careerPathKey = careerPathKey;
                }
            }, { clearErrors: ["title", "careerPathKey"], resync: true }),
        }));
    }

    body.appendChild(roleSection);

    form.appendChild(body);

    const footer = el("div", "contacts-form-footer");
    const cancelButton = document.createElement("button");
    cancelButton.type = "button";
    cancelButton.className = "contacts-secondary-button";
    cancelButton.textContent = formState.mode === "move" ? "Cancel move" : "Cancel";
    cancelButton.disabled = state.submitting;
    cancelButton.addEventListener("click", () => {
        if (getState().submitting) {
            return;
        }

        closeForm();
        renderAll();
    });

    const saveButton = document.createElement("button");
    saveButton.type = "submit";
    saveButton.className = "contacts-primary-button";
    saveButton.textContent = state.submitting
        ? saveButtonLabel(formState.mode, true)
        : saveButtonLabel(formState.mode, false);
    saveButton.disabled = state.submitting;

    footer.append(cancelButton, saveButton);
    form.appendChild(footer);

    formPane.appendChild(form);

    if (preservedFocus) {
        restoreFocus(formPane, preservedFocus);
    }

    function handleSave(): void {
        const liveState = getState();
        const snapshotState = liveState.snapshot;
        const activeForm = liveState.activeForm;
        if (!snapshotState || !activeForm || liveState.submitting) {
            return;
        }

        synchronizeFormDraft(activeForm, snapshotState);
        const errors = validateForm(snapshotState, activeForm);
        if (Object.keys(errors).length > 0) {
            updateActiveForm((editableForm) => {
                editableForm.errors = errors;
            });
            setBanner({
                tone: "error",
                message: "Please fill required fields.",
            });
            renderAll({ preserveFormFocus: true });
            return;
        }

        setSubmitting(true);
        clearBanner();
        renderAll({ preserveFormFocus: true });

        vscode.postMessage({
            type: "save",
            mode: activeForm.mode,
            sourceContactId: activeForm.sourceContactId ?? undefined,
            groupFile: activeForm.useNewGroup ? undefined : activeForm.selectedGroupFile,
            newGroupName: activeForm.useNewGroup ? activeForm.newGroupName : undefined,
            contact: cloneContact(activeForm.draft),
        });
    }
}

function appendGroupField(
    section: HTMLElement,
    formState: ContactsFormState,
    snapshot: NonNullable<ReturnType<typeof getState>["snapshot"]>,
    sourceGroupName: string | null,
): void {
    if (formState.mode === "edit") {
        const group = formState.sourceGroupFile ? findGroup(snapshot, formState.sourceGroupFile) : null;
        section.appendChild(createReadOnlyField({
            field: "group",
            label: "Group",
            value: group?.name ?? sourceGroupName ?? "Unknown group",
            helpText: "Use Move to put this contact into a different group.",
        }));
        return;
    }

    const availableGroups = formState.mode === "move" && formState.sourceGroupFile
        ? getMoveTargets(snapshot, formState.sourceGroupFile)
        : snapshot.groups;
    const groupOptions = availableGroups.map((group) => ({
        value: group.file,
        label: group.name,
        bold: group.type === "report",
    }));
    groupOptions.push({
        value: NEW_GROUP_VALUE,
        label: "Create new group",
        bold: false,
    });

    section.appendChild(createSelectField({
        field: "group",
        label: formState.mode === "move" ? "Move to" : "Group",
        value: formState.useNewGroup ? NEW_GROUP_VALUE : formState.selectedGroupFile,
        options: groupOptions,
        error: formState.errors.group,
        onChange: (value) => mutateForm((editableForm) => {
            editableForm.useNewGroup = value === NEW_GROUP_VALUE;
            if (!editableForm.useNewGroup) {
                editableForm.selectedGroupFile = value;
            }
        }, { clearErrors: true, resync: true }),
    }));

    if (formState.useNewGroup) {
        section.appendChild(createInputField({
            field: "newGroupName",
            label: "New group name",
            value: formState.newGroupName,
            placeholder: "Colleagues",
            error: formState.errors.group,
            onInput: (value) => mutateForm((editableForm) => {
                editableForm.newGroupName = toTitleCase(value);
            }, { clearErrors: ["group"] }),
        }));
    }
}

function createGroupCard(
    group: NonNullable<ReturnType<typeof getState>["snapshot"]>["groups"][number],
    contacts: readonly ContactsViewContact[],
): HTMLElement {
    const details = document.createElement("details");
    details.className = "group-card";
    details.open = getState().expandedGroups.has(group.file);
    details.addEventListener("toggle", () => {
        setGroupExpanded(group.file, details.open);
    });

    const summary = document.createElement("summary");
    summary.className = "group-summary";

    const titleStack = el("div", "group-title-stack");
    const title = el("div", "group-title");
    title.textContent = group.name;
    const countSpan = el("span", "contacts-group-count");
    countSpan.textContent = `(${contacts.length})`;
    title.appendChild(countSpan);
    titleStack.appendChild(title);

    summary.append(document.createElement("span"), titleStack);
    details.appendChild(summary);

    const groupList = el("div", "group-list");
    if (contacts.length === 0) {
        const emptyState = el("div", "group-empty");
        emptyState.textContent = "No contacts in this group yet.";
        groupList.appendChild(emptyState);
    } else {
        for (const contact of contacts) {
            groupList.appendChild(createContactRow(contact, false));
        }
    }

    details.appendChild(groupList);
    return details;
}

function createContactRow(contact: ContactsViewContact, showGroupTag: boolean): HTMLElement {
    const row = el("div", "contact-row");
    row.tabIndex = 0;
    row.setAttribute("role", "button");
    row.setAttribute("aria-label", `Edit ${contact.fullName || contact.nickname || contact.id}`);

    const pendingDelete = getState().pendingDeleteContactId === contact.id;
    row.classList.toggle("pending-delete", pendingDelete);

    if (!pendingDelete) {
        row.addEventListener("click", () => {
            clearBanner();
            vscode.postMessage({
                type: "open",
                mode: "edit",
                contactId: contact.id,
            });
        });
        row.addEventListener("keydown", (event: KeyboardEvent) => {
            if (event.key !== "Enter" && event.key !== " ") {
                return;
            }

            event.preventDefault();
            vscode.postMessage({
                type: "open",
                mode: "edit",
                contactId: contact.id,
            });
        });
    }

    const copy = el("div", "contact-copy");
    const linePrimary = el("div", "contact-line-primary");
    const nickname = el("span", "contact-primary-name");
    nickname.textContent = contact.nickname || contact.fullName || contact.id;
    linePrimary.appendChild(nickname);
    if (contact.fullName && contact.fullName !== contact.nickname) {
        const fullName = el("span", "contact-primary-full-name");
        fullName.textContent = ` (${contact.fullName})`;
        linePrimary.appendChild(fullName);
    }


    if (showGroupTag && contact.groupName) {
        const groupTag = el("span", "contact-group-tag");
        groupTag.textContent = contact.groupName;
        linePrimary.appendChild(groupTag);
    }

    const lineSecondary = el("div", "contact-line-secondary");
    lineSecondary.textContent = contact.shortTitle || contact.title || "Untitled";
    copy.append(linePrimary, lineSecondary);
    row.appendChild(copy);

    const actions = el("div", "contact-actions");
    actions.appendChild(createActionButton("Edit", "edit", (event) => {
        event.stopPropagation();
        clearBanner();
        vscode.postMessage({
            type: "open",
            mode: "edit",
            contactId: contact.id,
        });
    }));

    const moveTargets = getState().snapshot
        ? getMoveTargets(getState().snapshot!, contact.groupFile)
        : [];
    if (moveTargets.length > 0) {
        actions.appendChild(createActionButton("Move", "move", (event) => {
            event.stopPropagation();
            clearBanner();
            handleMove(contact, moveTargets);
        }));
    }

    actions.appendChild(createActionButton("Delete", "delete", (event) => {
        event.stopPropagation();
        setPendingDeleteContactId(contact.id);
        renderList();
    }));
    row.appendChild(actions);

    if (pendingDelete) {
        const confirm = el("div", "contact-confirm");
        const confirmCopy = el("div", "contact-confirm-copy");
        confirmCopy.textContent = `Delete ${contact.nickname || contact.id}?`;

        const confirmActions = el("div", "contact-confirm-actions");
        const confirmButton = document.createElement("button");
        confirmButton.type = "button";
        confirmButton.className = "contact-confirm-button";
        confirmButton.textContent = "Confirm";
        confirmButton.addEventListener("click", (event) => {
            event.stopPropagation();
            setPendingDeleteContactId(null);
            clearBanner();
            vscode.postMessage({
                type: "delete",
                contactId: contact.id,
            });
            renderList();
        });

        const cancelButton = document.createElement("button");
        cancelButton.type = "button";
        cancelButton.className = "contact-cancel-button";
        cancelButton.textContent = "Cancel";
        cancelButton.addEventListener("click", (event) => {
            event.stopPropagation();
            setPendingDeleteContactId(null);
            renderList();
        });

        confirmActions.append(confirmButton, cancelButton);
        confirm.append(confirmCopy, confirmActions);
        row.appendChild(confirm);
    }

    return row;
}

function handleMove(contact: ContactsViewContact, moveTargets: readonly ReturnType<typeof getMoveTargets>[number][]): void {
    const directTarget = moveTargets.length === 1 ? moveTargets[0] : null;
    if (directTarget && !(contact.kind === "colleague" && directTarget.type === "report")) {
        vscode.postMessage({
            type: "move",
            contactId: contact.id,
            targetGroupFile: directTarget.file,
        });
        return;
    }

    vscode.postMessage({
        type: "open",
        mode: "move",
        contactId: contact.id,
        targetGroupFile: directTarget?.file ?? moveTargets[0]?.file,
    });
}

function mutateForm(
    mutator: (form: ContactsFormState) => void,
    options?: { clearErrors?: true | string[]; resync?: boolean; render?: boolean },
): void {
    const snapshot = getState().snapshot;
    clearBanner();
    updateActiveForm((form) => {
        mutator(form);

        if (options?.clearErrors === true) {
            form.errors = {};
        } else if (Array.isArray(options?.clearErrors)) {
            for (const key of options.clearErrors) {
                delete form.errors[key];
            }
        }

        if (options?.resync && snapshot) {
            synchronizeFormDraft(form, snapshot);
        }
    });

    if (options?.render !== false) {
        renderAll({ preserveFormFocus: true });
    }
}

function createReadOnlyField(options: {
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

function createInputField(options: {
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

function createDateInputField(options: {
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

function createSelectField(options: {
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

function createGroupedTitleField(options: {
    field: string;
    label: string;
    value: string;
    placeholder: string;
    snapshot: NonNullable<ReturnType<typeof getState>["snapshot"]>;
    currentTitle: string;
    error?: string;
    onChange: (value: string, careerPathKey: string | null) => void;
}): HTMLElement {
    const field = el("label", "contacts-field");
    const label = el("span", "contacts-field-label");
    label.textContent = options.label;

    const wrapper = el("div", "contacts-title-combo-wrapper");

    const comboInput = document.createElement("input");
    comboInput.type = "text";
    comboInput.className = "contacts-field-input contacts-title-combo-input";
    comboInput.placeholder = options.placeholder;
    comboInput.autocomplete = "off";
    comboInput.spellcheck = false;
    comboInput.setAttribute("data-field", options.field);
    comboInput.value = options.value;
    if (options.error) {
        comboInput.classList.add("error");
    }

    const dropdown = el("div", "contacts-title-dropdown");
    dropdown.setAttribute("role", "listbox");

    const titleMap = buildTitleToCareerPathMap(options.snapshot);
    const titleOptions = buildColleagueTitleOptions(options.snapshot, options.currentTitle);

    function populateDropdown(filter: string): void {
        clearElement(dropdown);
        const lowerFilter = filter.toLowerCase();
        const grouped = groupTitlesByCareerPath(titleOptions, options.snapshot);

        let hasGroupedItems = false;

        // First render standalone items (CVP etc.) before groups
        for (const group of grouped) {
            if (!group.isStandalone) {
                continue;
            }
            for (const opt of group.options) {
                if (lowerFilter && !opt.label.toLowerCase().includes(lowerFilter)) {
                    continue;
                }
                const item = el("div", "contacts-title-option");
                item.setAttribute("role", "option");
                item.setAttribute("data-value", opt.value);
                item.textContent = opt.label;
                item.addEventListener("mousedown", (event) => {
                    event.preventDefault();
                    selectItem(opt.value);
                });
                dropdown.appendChild(item);
            }
        }

        // Add separator if we had standalone items and will have grouped items
        const standaloneCount = dropdown.childElementCount;

        for (const group of grouped) {
            if (group.isStandalone) {
                continue;
            }
            const matchingOptions = group.options.filter((opt) =>
                !lowerFilter || opt.label.toLowerCase().includes(lowerFilter),
            );
            if (matchingOptions.length === 0) {
                continue;
            }

            hasGroupedItems = true;

            if (standaloneCount > 0 && dropdown.querySelectorAll(".contacts-title-separator").length === 0) {
                dropdown.appendChild(el("div", "contacts-title-separator"));
            }

            const groupLabel = el("div", "contacts-title-group-label");
            groupLabel.textContent = group.careerPathName;
            dropdown.appendChild(groupLabel);

            for (const opt of matchingOptions) {
                const item = el("div", "contacts-title-option");
                item.setAttribute("role", "option");
                item.setAttribute("data-value", opt.value);
                item.textContent = opt.label;
                item.addEventListener("mousedown", (event) => {
                    event.preventDefault();
                    selectItem(opt.value);
                });
                dropdown.appendChild(item);
            }
        }

        if (!hasGroupedItems && standaloneCount === 0) {
            const empty = el("div", "contacts-title-option contacts-title-empty");
            empty.textContent = "No matching titles";
            dropdown.appendChild(empty);
        }
    }

    function selectItem(value: string): void {
        comboInput.value = value;
        dropdown.classList.remove("open");
        const careerPathKey = titleMap.get(value) ?? null;
        options.onChange(value, careerPathKey);
    }

    comboInput.addEventListener("focus", () => {
        populateDropdown(comboInput.value === options.value ? "" : comboInput.value);
        dropdown.classList.add("open");
    });

    comboInput.addEventListener("input", () => {
        populateDropdown(comboInput.value);
        dropdown.classList.add("open");
    });

    comboInput.addEventListener("blur", () => {
        // Small delay to allow mousedown on items to fire
        setTimeout(() => {
            dropdown.classList.remove("open");
        }, 150);
    });

    comboInput.addEventListener("keydown", (event: KeyboardEvent) => {
        if (event.key === "Escape") {
            dropdown.classList.remove("open");
            comboInput.blur();
        }
    });

    wrapper.append(comboInput, dropdown);
    field.append(label, wrapper);
    appendFieldMeta(field);
    return field;
}

function buildTitleToCareerPathMap(
    snapshot: NonNullable<ReturnType<typeof getState>["snapshot"]>,
): Map<string, string> {
    const map = new Map<string, string>();
    for (const title of snapshot.referenceData.canonicalTitles) {
        if (map.has(title.normal)) {
            continue;
        }

        for (const path of snapshot.referenceData.careerPaths) {
            for (const level of snapshot.referenceData.careerLevels) {
                if (level.id < path.minimumCareerLevel) {
                    continue;
                }

                const pattern = level.titlePattern;
                const generated = pattern.split("{CareerPath}").join(path.name);
                if (generated === title.normal) {
                    map.set(title.normal, path.key);
                    break;
                }
            }

            if (map.has(title.normal)) {
                break;
            }
        }
    }
    return map;
}

interface TitleOptionGroup {
    careerPathName: string;
    isStandalone: boolean;
    options: Array<{ value: string; label: string }>;
}

function groupTitlesByCareerPath(
    titleOptions: ReturnType<typeof buildColleagueTitleOptions>,
    snapshot: NonNullable<ReturnType<typeof getState>["snapshot"]>,
): TitleOptionGroup[] {
    const titleToPath = buildTitleToCareerPathMap(snapshot);
    const pathKeyToName = new Map(snapshot.referenceData.careerPaths.map((p) => [p.key, p.name]));

    const groups = new Map<string, TitleOptionGroup>();
    const standaloneOptions: Array<{ value: string; label: string }> = [];

    for (const opt of titleOptions) {
        const pathKey = titleToPath.get(opt.value);
        const pathName = pathKey ? pathKeyToName.get(pathKey) ?? "Other" : null;

        if (opt.isCustom || !pathName) {
            standaloneOptions.push({ value: opt.value, label: opt.value });
            continue;
        }

        let group = groups.get(pathName);
        if (!group) {
            group = { careerPathName: pathName, isStandalone: false, options: [] };
            groups.set(pathName, group);
        }
        group.options.push({ value: opt.value, label: opt.label });
    }

    const result: TitleOptionGroup[] = [];

    if (standaloneOptions.length > 0) {
        result.push({ careerPathName: "", isStandalone: true, options: standaloneOptions });
    }

    for (const group of groups.values()) {
        result.push(group);
    }

    return result;
}

function appendFieldMeta(field: HTMLElement, helpText?: string): void {
    if (helpText) {
        const help = el("div", "contacts-field-help");
        help.textContent = helpText;
        field.appendChild(help);
    }
}

function createActionButton(
    label: string,
    variant: "edit" | "move" | "delete",
    onClick: (event: MouseEvent) => void,
): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `contact-action ${variant}`;
    button.textContent = label;
    button.addEventListener("click", onClick);
    return button;
}

function createEmptyState(title: string, subtitle: string): HTMLElement {
    const empty = el("div", "contacts-empty");
    const emptyTitle = el("div", "contacts-empty-title");
    emptyTitle.textContent = title;
    const emptySubtitle = el("div", "contacts-empty-subtitle");
    emptySubtitle.textContent = subtitle;
    empty.append(emptyTitle, emptySubtitle);
    return empty;
}

function createFormPlaceholder(active: boolean): HTMLElement {
    const placeholder = el("div", "contacts-form-placeholder");
    const title = el("div", "contacts-form-placeholder-title");
    title.textContent = active ? "Select a person or add someone new" : "Contacts is unavailable";
    const subtitle = el("div", "contacts-form-placeholder-subtitle");
    subtitle.textContent = active
        ? "The form slides in here when you add, edit, or move a contact."
        : "Enable the contacts feature to edit people from the sidebar.";
    placeholder.append(title, subtitle);
    return placeholder;
}

function renderBanner(host: HTMLElement, banner: ReturnType<typeof getState>["banner"]): void {
    clearElement(host);
    if (!banner) {
        return;
    }

    const bannerElement = el("div", `contacts-banner ${banner.tone}`);
    bannerElement.textContent = banner.message;
    host.appendChild(bannerElement);
}

function buildHeaderSubtitle(contactCount: number, groupCount: number, searching: boolean): string {
    if (searching) {
        return `${contactCount} ${pluralize("person", contactCount)} across ${groupCount} ${pluralize("group", groupCount)}`;
    }

    return `${contactCount} ${pluralize("person", contactCount)} in ${groupCount} ${pluralize("group", groupCount)}`;
}

function saveButtonLabel(mode: ContactsFormState["mode"], submitting: boolean): string {
    if (!submitting) {
        return mode === "move" ? "Move" : "Save";
    }

    return mode === "move" ? "Moving..." : "Saving...";
}

function matchesSearch(contact: ContactsViewContact, query: string): boolean {
    const haystack = [
        contact.id,
        contact.nickname,
        contact.fullName,
        contact.title,
        contact.shortTitle,
    ].join("\n").toLowerCase();
    return haystack.includes(query);
}

function pluralize(word: string, count: number): string {
    return count === 1 ? word : `${word}s`;
}

function toTitleCase(value: string): string {
    return value.replace(/\b\w+/g, (word) =>
        word.charAt(0).toUpperCase() + word.slice(1).toLowerCase(),
    );
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

function createToolbarButton(id: string, glyph: string, title: string, onClick: () => void): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "contacts-toolbar-button";
    button.setAttribute("data-action", id);
    button.title = title;
    button.setAttribute("aria-label", title);
    const icon = el("span", "contacts-toolbar-glyph");
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = glyph;
    button.appendChild(icon);
    button.addEventListener("click", onClick);
    return button;
}

function el(tag: string, className?: string): HTMLElement {
    const element = document.createElement(tag);
    if (className) {
        element.className = className;
    }
    return element;
}

function clearElement(element: HTMLElement): void {
    element.replaceChildren();
}

function captureFocus(container: HTMLElement): PreservedFocus | null {
    const active = document.activeElement;
    if (!(active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement || active instanceof HTMLSelectElement)) {
        return null;
    }
    if (!container.contains(active)) {
        return null;
    }

    const field = active.getAttribute("data-field");
    if (!field) {
        return null;
    }

    return {
        field,
        selectionStart: "selectionStart" in active ? active.selectionStart : null,
        selectionEnd: "selectionEnd" in active ? active.selectionEnd : null,
    };
}

function restoreFocus(container: HTMLElement, preserved: PreservedFocus): void {
    const candidates = Array.from(container.querySelectorAll("[data-field]"));
    const target = candidates.find((candidate) => candidate.getAttribute("data-field") === preserved.field);
    if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement)) {
        return;
    }

    target.focus();
    if ((target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)
        && preserved.selectionStart !== null
        && preserved.selectionEnd !== null) {
        target.setSelectionRange(preserved.selectionStart, preserved.selectionEnd);
    }
}

function isWebviewMessage(value: unknown): value is ContactsViewToWebviewMessage {
    if (!isRecord(value) || typeof value.type !== "string") {
        return false;
    }

    switch (value.type) {
        case "update":
            return isRecord(value.snapshot);
        case "open":
            return isRecord(value.request);
        case "saved":
            return typeof value.mode === "string"
                && typeof value.contactId === "string"
                && typeof value.groupFile === "string";
        case "error":
            return typeof value.message === "string";
        default:
            return false;
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

interface PreservedFocus {
    field: string;
    selectionStart: number | null;
    selectionEnd: number | null;
}