import type * as vscode from "vscode";
import type {
    Contact,
    ContactFieldMap,
    ContactKind,
    ContactsViewContact,
    ContactsViewFormRequest,
    ContactsViewSnapshot,
    ContactsViewToExtensionMessage,
} from "./types";
import type {
    ContactsFormOpenRequest,
    ContactsSnapshot,
    ResolvedContact,
} from "./contactsFeature";

export function mapSnapshot(snapshot: ContactsSnapshot): ContactsViewSnapshot {
    return {
        active: snapshot.active,
        multiGroup: snapshot.multiGroup,
        groups: snapshot.groups.map((group) => ({ ...group })),
        contacts: snapshot.contacts.map(mapContact),
        referenceData: {
            pronouns: snapshot.referenceData.pronouns.map((entry) => ({
                ...entry,
                extraFields: cloneFieldMap(entry.extraFields),
            })),
            careerLevels: snapshot.referenceData.careerLevels.map((entry) => ({
                key: entry.key,
                id: entry.id,
                interviewType: entry.interviewType,
                titlePattern: entry.titlePattern,
                extraFields: cloneFieldMap(entry.extraFields),
            })),
            careerPaths: snapshot.referenceData.careerPaths.map((entry) => ({
                ...entry,
                extraFields: cloneFieldMap(entry.extraFields),
            })),
            interviewTypes: snapshot.referenceData.interviewTypes.map((entry) => ({
                ...entry,
                extraFields: cloneFieldMap(entry.extraFields),
            })),
            canonicalTitles: snapshot.referenceData.canonicalTitles.map((pair) => ({ ...pair })),
        },
    };
}

export function mapContact(contact: ResolvedContact): ContactsViewContact {
    if (contact.kind === "report") {
        return {
            kind: "report",
            id: contact.id,
            nickname: contact.nickname,
            fullName: contact.fullName,
            title: contact.title,
            shortTitle: contact.shortTitle,
            careerPathKey: contact.careerPathKey,
            pronounsKey: contact.pronounsKey,
            extraFields: cloneFieldMap(contact.extraFields),
            droppedFields: cloneFieldMap(contact.droppedFields),
            levelId: contact.levelId,
            levelStartDate: contact.levelStartDate,
            groupFile: contact.groupFile,
            groupName: contact.groupName,
            isCustomGroup: contact.isCustomGroup,
        };
    }

    return {
        kind: "colleague",
        id: contact.id,
        nickname: contact.nickname,
        fullName: contact.fullName,
        title: contact.title,
        shortTitle: contact.shortTitle,
        careerPathKey: contact.careerPathKey,
        pronounsKey: contact.pronounsKey,
        extraFields: cloneFieldMap(contact.extraFields),
        droppedFields: cloneFieldMap(contact.droppedFields),
        groupFile: contact.groupFile,
        groupName: contact.groupName,
        isCustomGroup: contact.isCustomGroup,
    };
}

export function mapFormRequest(request: ContactsFormOpenRequest): ContactsViewFormRequest {
    return { ...request };
}

export function buildWritableContact(draft: Contact, sourceContact: ContactsViewContact | null): Contact {
    const baseExtraFields = sourceContact
        ? cloneFieldMap(sourceContact.extraFields)
        : cloneFieldMap(draft.extraFields);
    const baseDroppedFields = buildDroppedFields(draft.kind, sourceContact, draft.droppedFields);

    if (draft.kind === "report") {
        return {
            kind: "report",
            id: draft.id.trim(),
            nickname: draft.nickname.trim(),
            fullName: draft.fullName.trim(),
            title: draft.title.trim(),
            careerPathKey: draft.careerPathKey.trim(),
            levelId: draft.levelId.trim(),
            levelStartDate: draft.levelStartDate.trim(),
            pronounsKey: draft.pronounsKey.trim(),
            extraFields: baseExtraFields,
            droppedFields: baseDroppedFields,
        };
    }

    return {
        kind: "colleague",
        id: draft.id.trim(),
        nickname: draft.nickname.trim(),
        fullName: draft.fullName.trim(),
        title: draft.title.trim(),
        careerPathKey: draft.careerPathKey.trim(),
        pronounsKey: draft.pronounsKey.trim(),
        extraFields: baseExtraFields,
        droppedFields: baseDroppedFields,
    };
}

export function buildDroppedFields(
    targetKind: ContactKind,
    sourceContact: ContactsViewContact | null,
    fallback: ContactFieldMap,
): ContactFieldMap {
    if (!sourceContact) {
        return cloneFieldMap(fallback);
    }

    const droppedFields = cloneFieldMap(sourceContact.droppedFields);
    if (sourceContact.kind === "colleague" && targetKind === "report") {
        delete droppedFields.LevelId;
        delete droppedFields.LevelStartDate;
    }

    return droppedFields;
}

export function disposeAll(disposables: readonly vscode.Disposable[]): void {
    for (const disposable of disposables) {
        disposable.dispose();
    }
}

export function cloneFieldMap(fields: ContactFieldMap): ContactFieldMap {
    return { ...fields };
}

export function isToExtensionMessage(value: unknown): value is ContactsViewToExtensionMessage {
    if (!isRecord(value) || typeof value.type !== "string") {
        return false;
    }

    switch (value.type) {
        case "ready":
            return true;
        case "open":
            return isFormMode(value.mode)
                && (value.contactId === undefined || typeof value.contactId === "string")
                && (value.targetGroupFile === undefined || typeof value.targetGroupFile === "string")
                && (value.preferredGroupFile === undefined || typeof value.preferredGroupFile === "string");
        case "save":
            return isFormMode(value.mode)
                && (value.sourceContactId === undefined || typeof value.sourceContactId === "string")
                && (value.groupFile === undefined || typeof value.groupFile === "string")
                && (value.newGroupName === undefined || typeof value.newGroupName === "string")
                && isContact(value.contact);
        case "delete":
            return typeof value.contactId === "string";
        case "move":
            return typeof value.contactId === "string"
                && (value.targetGroupFile === undefined || typeof value.targetGroupFile === "string");
        default:
            return false;
    }
}

function isContact(value: unknown): value is Contact {
    if (!isRecord(value)
        || !isContactKind(value.kind)
        || typeof value.id !== "string"
        || typeof value.nickname !== "string"
        || typeof value.fullName !== "string"
        || typeof value.title !== "string"
        || typeof value.careerPathKey !== "string"
        || typeof value.pronounsKey !== "string"
        || !isFieldMap(value.extraFields)
        || !isFieldMap(value.droppedFields)) {
        return false;
    }

    if (value.kind === "report") {
        return typeof value.levelId === "string" && typeof value.levelStartDate === "string";
    }

    return true;
}

function isContactKind(value: unknown): value is ContactKind {
    return value === "report" || value === "colleague";
}

function isFieldMap(value: unknown): value is ContactFieldMap {
    return isRecord(value) && Object.values(value).every((entry) => typeof entry === "string");
}

function isFormMode(value: unknown): value is ContactsViewFormRequest["mode"] {
    return value === "add" || value === "edit" || value === "move";
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}
