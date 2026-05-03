import {
    buildLevelOptions,
    buildReportTitleOptions,
    cloneContact,
    findGroup,
    getMoveTargets,
    getTargetGroupKind,
    NEW_GROUP_VALUE,
    synchronizeFormDraft,
    validateForm,
} from "./formModel";
import { el } from "./domUtils";
import { captureFocus, restoreFocus } from "./domUtils";
import { createInputField, createSelectField, createReadOnlyField } from "./formFields";
import { createDateInputField } from "./datePickerField";
import { createGroupedTitleField } from "./titleField";
import { renderBanner, saveButtonLabel, createFormPlaceholder, toTitleCase } from "./uiHelpers";
import {
    clearBanner,
    getState,
    closeForm,
    setSubmitting,
    setBanner,
    updateActiveForm,
    vscode,
} from "./state";
import type { ContactsFormState, ContactsViewSnapshot } from "./types";

export function renderFormPane(
    formPaneEl: HTMLElement,
    renderAll: (options?: { preserveFormFocus?: boolean }) => void,
    preserveFocus: boolean,
): void {
    const preservedFocus = preserveFocus ? captureFocus(formPaneEl) : null;
    formPaneEl.replaceChildren();

    const state = getState();
    const snapshot = state.snapshot;
    if (!snapshot?.active || !state.activeForm) {
        formPaneEl.appendChild(createFormPlaceholder(snapshot?.active === true));
        if (preservedFocus) {
            restoreFocus(formPaneEl, preservedFocus);
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
        handleSave(renderAll);
    });

    const bannerHost = el("div", "contacts-panel-banner");
    renderBanner(bannerHost, state.banner);
    form.appendChild(bannerHost);

    const body = el("div", "contacts-form-scroll");
    const generalSection = el("section", "contacts-form-section");
    const generalTitle = el("div", "contacts-form-section-title");
    generalTitle.textContent = formState.mode === "move" ? "Destination" : "Details";
    generalSection.appendChild(generalTitle);

    appendGroupField(generalSection, formState, snapshot, sourceGroup?.name ?? null, renderAll);

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
        }, renderAll, { clearErrors: ["id"] }),
    }));

    generalSection.appendChild(createInputField({
        field: "nickname",
        label: "Nickname",
        value: formState.draft.nickname,
        placeholder: "Alice",
        error: formState.errors.nickname,
        onInput: (value) => mutateForm((formDraft) => {
            formDraft.draft.nickname = toTitleCase(value);
        }, renderAll, { clearErrors: ["nickname"] }),
    }));

    generalSection.appendChild(createInputField({
        field: "fullName",
        label: "Full name",
        value: formState.draft.fullName,
        placeholder: "Alice Anderson",
        error: formState.errors.fullName,
        onInput: (value) => mutateForm((formDraft) => {
            formDraft.draft.fullName = toTitleCase(value);
        }, renderAll, { clearErrors: ["fullName"] }),
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
        }, renderAll, { clearErrors: ["pronounsKey"] }),
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
        }, renderAll, { clearErrors: true, resync: true }),
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
            }, renderAll, { clearErrors: true, resync: true }),
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
                }, renderAll, { clearErrors: true, resync: true }),
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
            }, renderAll, { clearErrors: ["levelStartDate"], render: commit }),
        }));
    } else {
        roleSection.appendChild(createGroupedTitleField({
            field: "title",
            label: "Title",
            value: formState.draft.title,
            placeholder: "Select the title",
            snapshot,
            currentTitle: formState.draft.title,
            careerPathKey: formState.draft.careerPathKey,
            error: formState.errors.title,
            onChange: (value, careerPathKey) => mutateForm((formDraft) => {
                formDraft.draft.title = value;
                if (careerPathKey) {
                    formDraft.draft.careerPathKey = careerPathKey;
                }
            }, renderAll, { clearErrors: ["title", "careerPathKey"], resync: true }),
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

    formPaneEl.appendChild(form);

    if (preservedFocus) {
        restoreFocus(formPaneEl, preservedFocus);
    }
}

function appendGroupField(
    section: HTMLElement,
    formState: ContactsFormState,
    snapshot: ContactsViewSnapshot & { active: true },
    sourceGroupName: string | null,
    renderAll: (options?: { preserveFormFocus?: boolean }) => void,
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
        }, renderAll, { clearErrors: true, resync: true }),
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
            }, renderAll, { clearErrors: ["group"] }),
        }));
    }
}

function handleSave(renderAll: (options?: { preserveFormFocus?: boolean }) => void): void {
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

function mutateForm(
    mutator: (form: ContactsFormState) => void,
    renderAll: (options?: { preserveFormFocus?: boolean }) => void,
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
