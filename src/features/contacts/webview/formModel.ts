import { isMarkdownPath } from "../../../utils/markdown";
import { generateTitle } from "../titleGenerator";
import type { CareerLevelReference, CareerPathReference, Contact, ContactKind, ContactTitlePair, ContactsViewContact, ContactsViewFormRequest, ContactsViewSnapshot } from "../types";
import { formatIsoDateForDisplay } from "./dateInput";
import type { ContactsFormState } from "./types";

const INVALID_GROUP_NAME_RE = /[\\/:*?"<>|]/;

export const NEW_GROUP_VALUE = "__new-group__";

export interface SelectOption {
    value: string;
    label: string;
    detail?: string;
    isCustom?: boolean;
}

export function createFormState(snapshot: ContactsViewSnapshot, request: ContactsViewFormRequest): ContactsFormState | null {
    switch (request.mode) {
        case "add":
            return createAddFormState(snapshot, request.preferredGroupFile);
        case "edit": {
            const sourceContact = request.contactId ? findContact(snapshot, request.contactId) : null;
            if (!sourceContact) {
                return null;
            }

            const form = createBaseFormState("edit", sourceContact.groupFile, sourceContact.groupFile, cloneContact(sourceContact));
            initializeReportTitleMode(form, snapshot, sourceContact);
            synchronizeFormDraft(form, snapshot);
            return form;
        }
        case "move": {
            const sourceContact = request.contactId ? findContact(snapshot, request.contactId) : null;
            if (!sourceContact) {
                return null;
            }

            const targetGroupFile = request.targetGroupFile
                && request.targetGroupFile !== sourceContact.groupFile
                ? request.targetGroupFile
                : getMoveTargets(snapshot, sourceContact.groupFile)[0]?.file;
            if (!targetGroupFile) {
                return null;
            }

            const targetGroup = findGroup(snapshot, targetGroupFile);
            if (!targetGroup) {
                return null;
            }

            const draft = convertContactForTarget(sourceContact, targetGroup.type);
            const form = createBaseFormState("move", sourceContact.groupFile, targetGroupFile, draft);
            form.sourceContactId = sourceContact.id;
            initializeReportTitleMode(form, snapshot, sourceContact);
            synchronizeFormDraft(form, snapshot);
            return form;
        }
    }
}

export function synchronizeFormDraft(form: ContactsFormState, snapshot: ContactsViewSnapshot): void {
    const targetKind = getTargetGroupKind(snapshot, form);
    if (form.draft.kind !== targetKind) {
        form.draft = convertContactForKind(form.draft, targetKind);
    }

    if (form.draft.kind !== "report") {
        form.levelStartDateDisplay = "";
        return;
    }

    if (!form.levelStartDateDisplay.trim() && form.draft.levelStartDate.trim()) {
        form.levelStartDateDisplay = formatIsoDateForDisplay(form.draft.levelStartDate);
    }

    const levelOptions = buildLevelOptions(snapshot, form.draft);
    if (form.draft.levelId && !levelOptions.some((option) => option.value === form.draft.levelId)) {
        form.draft.levelId = "";
    }

    const generatedTitle = getGeneratedReportTitle(snapshot, form.draft);
    if (!generatedTitle) {
        if (form.reportTitleMode === "generated") {
            form.draft.title = "";
        }
        return;
    }

    if (form.reportTitleMode === "custom" && form.customReportTitle) {
        form.draft.title = form.customReportTitle;
        return;
    }

    form.reportTitleMode = "generated";
    form.draft.title = generatedTitle.normal;
}

export function validateForm(snapshot: ContactsViewSnapshot, form: ContactsFormState): Record<string, string> {
    const errors: Record<string, string> = {};

    if (form.mode !== "edit") {
        if (form.useNewGroup) {
            const newGroupName = form.newGroupName.trim();
            if (!newGroupName) {
                errors.group = "Enter a name for the new group.";
            } else {
                try {
                    const groupFile = toCustomGroupFileName(newGroupName);
                    if (snapshot.groups.some((group) => group.file.toLowerCase() === groupFile.toLowerCase())) {
                        errors.group = "A group with that name already exists.";
                    }
                } catch (error) {
                    errors.group = error instanceof Error ? error.message : String(error);
                }
            }
        } else if (!findGroup(snapshot, form.selectedGroupFile)) {
            errors.group = "Choose a destination group.";
        }
    }

    if (form.mode === "move" && !form.useNewGroup && form.selectedGroupFile === form.sourceGroupFile) {
        errors.group = "Choose a different destination group.";
    }

    if (!form.draft.id.trim()) {
        errors.id = "Id is required.";
    } else if (snapshot.contacts.some((contact) => contact.id === form.draft.id && contact.id !== form.sourceContactId)) {
        errors.id = `A contact with id "${form.draft.id}" already exists.`;
    }

    if (!form.draft.nickname.trim()) {
        errors.nickname = "Nickname is required.";
    }

    if (!form.draft.fullName.trim()) {
        errors.fullName = "Full name is required.";
    }

    const selectedCareerPath = findCareerPath(snapshot, form.draft.careerPathKey);
    if (form.draft.kind === "report") {
        if (!form.draft.careerPathKey.trim()) {
            errors.careerPathKey = "Choose a career path.";
        } else if (!selectedCareerPath) {
            errors.careerPathKey = "The selected career path no longer exists.";
        }
    }

    if (!form.draft.pronounsKey.trim()) {
        errors.pronounsKey = "Choose a pronouns profile.";
    } else if (!snapshot.referenceData.pronouns.some((entry) => entry.key === form.draft.pronounsKey)) {
        errors.pronounsKey = "The selected pronouns profile no longer exists.";
    }

    if (form.draft.kind === "report") {
        if (!form.draft.levelId.trim()) {
            errors.levelId = "Choose a level.";
        }
        if (!form.levelStartDateDisplay.trim()) {
            errors.levelStartDate = "Enter the level start date.";
        } else if (!form.draft.levelStartDate.trim()) {
            errors.levelStartDate = "Enter a valid level start date.";
        }

        const selectedLevel = findCareerLevel(snapshot, form.draft.levelId);
        if (form.draft.levelId && !selectedLevel) {
            errors.levelId = "The selected level no longer exists.";
        }

        if (selectedCareerPath && selectedLevel && selectedLevel.id < selectedCareerPath.minimumCareerLevel) {
            errors.levelId = `${selectedLevel.key} is below the minimum level for ${selectedCareerPath.name}.`;
        }

        if (form.reportTitleMode === "custom") {
            if (!form.customReportTitle?.trim()) {
                errors.title = "The custom report title is empty.";
            }
        } else if (!getGeneratedReportTitle(snapshot, form.draft)) {
            errors.title = "Choose a career path and level to generate the report title.";
        }
    } else if (!form.draft.title.trim()) {
        errors.title = "Choose a title.";
    }

    return errors;
}

export function buildLevelOptions(snapshot: ContactsViewSnapshot, draft: Extract<Contact, { kind: "report" }>): SelectOption[] {
    const careerPath = findCareerPath(snapshot, draft.careerPathKey);
    if (!careerPath) {
        return [];
    }

    return [...snapshot.referenceData.careerLevels]
        .filter((careerLevel) => careerLevel.id >= careerPath.minimumCareerLevel)
        .sort((left, right) => left.id - right.id)
        .map((careerLevel) => ({
            value: careerLevel.key,
            label: `Level ${careerLevel.id} (${generateTitle(careerPath, careerLevel).normal})`,
        }));
}

export function buildColleagueTitleOptions(snapshot: ContactsViewSnapshot, currentTitle: string): SelectOption[] {
    const options: SelectOption[] = [];
    const seenValues = new Set<string>();
    const trimmedCurrentTitle = currentTitle.trim();

    if (trimmedCurrentTitle && !snapshot.referenceData.canonicalTitles.some((pair) => pair.normal === trimmedCurrentTitle)) {
        options.push({
            value: trimmedCurrentTitle,
            label: `${trimmedCurrentTitle} (Custom)`,
            isCustom: true,
        });
        seenValues.add(trimmedCurrentTitle);
    }

    for (const pair of snapshot.referenceData.canonicalTitles) {
        if (seenValues.has(pair.normal)) {
            continue;
        }

        seenValues.add(pair.normal);
        options.push({
            value: pair.normal,
            label: pair.normal,
            detail: pair.short !== pair.normal ? pair.short : undefined,
        });
    }

    return options;
}

export function buildReportTitleOptions(snapshot: ContactsViewSnapshot, form: ContactsFormState): SelectOption[] {
    if (form.draft.kind !== "report") {
        return [];
    }

    const generated = getGeneratedReportTitle(snapshot, form.draft);
    const options: SelectOption[] = [];

    if (generated) {
        options.push({
            value: "generated",
            label: generated.normal,
            detail: generated.short !== generated.normal ? `Short: ${generated.short}` : "Generated",
        });
    }

    if (form.customReportTitle?.trim()) {
        options.push({
            value: "custom",
            label: `${form.customReportTitle} (Custom)`,
            isCustom: true,
        });
    }

    return options;
}

export function getGeneratedReportTitle(
    snapshot: ContactsViewSnapshot,
    draft: Extract<Contact, { kind: "report" }>,
): ContactTitlePair | null {
    const careerPath = findCareerPath(snapshot, draft.careerPathKey);
    const careerLevel = findCareerLevel(snapshot, draft.levelId);
    if (!careerPath || !careerLevel || careerLevel.id < careerPath.minimumCareerLevel) {
        return null;
    }

    return generateTitle(careerPath, careerLevel);
}

export function getTargetGroupKind(snapshot: ContactsViewSnapshot, form: ContactsFormState): ContactKind {
    if (form.useNewGroup) {
        return "colleague";
    }

    return findGroup(snapshot, form.selectedGroupFile)?.type ?? form.draft.kind;
}

export function getMoveTargets(snapshot: ContactsViewSnapshot, sourceGroupFile: string): ContactsViewSnapshot["groups"] {
    return snapshot.groups.filter((group) => group.file !== sourceGroupFile);
}

export function findContact(snapshot: ContactsViewSnapshot, contactId: string): ContactsViewContact | null {
    return snapshot.contacts.find((contact) => contact.id === contactId) ?? null;
}

export function findGroup(snapshot: ContactsViewSnapshot, groupFile: string): ContactsViewSnapshot["groups"][number] | null {
    return snapshot.groups.find((group) => group.file === groupFile) ?? null;
}

export function cloneContact(contact: Contact | ContactsViewContact): Contact {
    if (contact.kind === "report") {
        return {
            kind: "report",
            id: contact.id,
            nickname: contact.nickname,
            fullName: contact.fullName,
            title: contact.title,
            careerPathKey: contact.careerPathKey,
            levelId: contact.levelId,
            levelStartDate: contact.levelStartDate,
            pronounsKey: contact.pronounsKey,
            extraFields: { ...contact.extraFields },
            droppedFields: { ...contact.droppedFields },
        };
    }

    return {
        kind: "colleague",
        id: contact.id,
        nickname: contact.nickname,
        fullName: contact.fullName,
        title: contact.title,
        careerPathKey: contact.careerPathKey,
        pronounsKey: contact.pronounsKey,
        extraFields: { ...contact.extraFields },
        droppedFields: { ...contact.droppedFields },
    };
}

function createAddFormState(snapshot: ContactsViewSnapshot, preferredGroupFile?: string): ContactsFormState {
    const preferredGroup = preferredGroupFile
        ? findGroup(snapshot, preferredGroupFile)
        : null;
    const defaultGroup = preferredGroup ?? snapshot.groups[0] ?? null;
    const useNewGroup = defaultGroup === null;
    const draft = createEmptyContact(defaultGroup?.type ?? "colleague");

    const form = createBaseFormState("add", null, defaultGroup?.file ?? "", draft);
    form.useNewGroup = useNewGroup;
    synchronizeFormDraft(form, snapshot);
    return form;
}

function createBaseFormState(
    mode: ContactsFormState["mode"],
    sourceGroupFile: string | null,
    selectedGroupFile: string,
    draft: Contact,
): ContactsFormState {
    return {
        mode,
        sourceContactId: mode === "add" ? null : draft.id,
        sourceGroupFile,
        selectedGroupFile,
        useNewGroup: false,
        newGroupName: "",
        draft,
        levelStartDateDisplay: draft.kind === "report" ? formatIsoDateForDisplay(draft.levelStartDate) : "",
        reportTitleMode: "generated",
        customReportTitle: null,
        errors: {},
    };
}

function initializeReportTitleMode(
    form: ContactsFormState,
    snapshot: ContactsViewSnapshot,
    sourceContact: ContactsViewContact,
): void {
    if (sourceContact.kind !== "report") {
        form.customReportTitle = null;
        form.reportTitleMode = "generated";
        return;
    }

    const generated = getGeneratedReportTitle(snapshot, cloneContact(sourceContact));
    if (generated && generated.normal === sourceContact.title) {
        form.customReportTitle = null;
        form.reportTitleMode = "generated";
        return;
    }

    form.customReportTitle = sourceContact.title;
    form.reportTitleMode = "custom";
}

function convertContactForTarget(sourceContact: ContactsViewContact, targetKind: ContactKind): Contact {
    if (sourceContact.kind === targetKind) {
        return cloneContact(sourceContact);
    }

    if (targetKind === "colleague") {
        return {
            kind: "colleague",
            id: sourceContact.id,
            nickname: sourceContact.nickname,
            fullName: sourceContact.fullName,
            title: sourceContact.title,
            careerPathKey: sourceContact.careerPathKey,
            pronounsKey: sourceContact.pronounsKey,
            extraFields: { ...sourceContact.extraFields },
            droppedFields: { ...sourceContact.droppedFields },
        };
    }

    const droppedFields = { ...sourceContact.droppedFields };
    const levelId = droppedFields.LevelId ?? "";
    const levelStartDate = droppedFields.LevelStartDate ?? "";
    delete droppedFields.LevelId;
    delete droppedFields.LevelStartDate;

    return {
        kind: "report",
        id: sourceContact.id,
        nickname: sourceContact.nickname,
        fullName: sourceContact.fullName,
        title: "",
        careerPathKey: sourceContact.careerPathKey,
        levelId,
        levelStartDate,
        pronounsKey: sourceContact.pronounsKey,
        extraFields: { ...sourceContact.extraFields },
        droppedFields,
    };
}

function convertContactForKind(sourceContact: Contact, targetKind: ContactKind): Contact {
    if (sourceContact.kind === targetKind) {
        return cloneContact(sourceContact);
    }

    if (targetKind === "colleague") {
        return {
            kind: "colleague",
            id: sourceContact.id,
            nickname: sourceContact.nickname,
            fullName: sourceContact.fullName,
            title: sourceContact.title,
            careerPathKey: sourceContact.careerPathKey,
            pronounsKey: sourceContact.pronounsKey,
            extraFields: { ...sourceContact.extraFields },
            droppedFields: { ...sourceContact.droppedFields },
        };
    }

    const droppedFields = { ...sourceContact.droppedFields };
    const levelId = droppedFields.LevelId ?? "";
    const levelStartDate = droppedFields.LevelStartDate ?? "";
    delete droppedFields.LevelId;
    delete droppedFields.LevelStartDate;

    return {
        kind: "report",
        id: sourceContact.id,
        nickname: sourceContact.nickname,
        fullName: sourceContact.fullName,
        title: sourceContact.kind === "report" ? sourceContact.title : "",
        careerPathKey: sourceContact.careerPathKey,
        levelId,
        levelStartDate,
        pronounsKey: sourceContact.pronounsKey,
        extraFields: { ...sourceContact.extraFields },
        droppedFields,
    };
}

function createEmptyContact(kind: ContactKind): Contact {
    if (kind === "report") {
        return {
            kind: "report",
            id: "",
            nickname: "",
            fullName: "",
            title: "",
            careerPathKey: "",
            levelId: "",
            levelStartDate: "",
            pronounsKey: "",
            extraFields: {},
            droppedFields: {},
        };
    }

    return {
        kind: "colleague",
        id: "",
        nickname: "",
        fullName: "",
        title: "",
        careerPathKey: "",
        pronounsKey: "",
        extraFields: {},
        droppedFields: {},
    };
}

function findCareerPath(snapshot: ContactsViewSnapshot, key: string): CareerPathReference | null {
    return snapshot.referenceData.careerPaths.find((entry) => entry.key === key) ?? null;
}

function findCareerLevel(snapshot: ContactsViewSnapshot, key: string): CareerLevelReference | null {
    return snapshot.referenceData.careerLevels.find((entry) => entry.key === key) ?? null;
}

function toCustomGroupFileName(name: string): string {
    const trimmedName = name.trim();
    const baseName = isMarkdownPath(trimmedName)
        ? trimmedName.slice(0, -3).trim()
        : trimmedName;

    if (!baseName) {
        throw new Error("Group name is required.");
    }
    if (baseName === "." || baseName === "..") {
        throw new Error("Group name is invalid.");
    }
    if (INVALID_GROUP_NAME_RE.test(baseName)) {
        throw new Error("Group name contains invalid filename characters.");
    }

    return `${baseName}.md`;
}