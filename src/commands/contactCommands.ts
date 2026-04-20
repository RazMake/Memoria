import * as vscode from "vscode";
import {
    CONTACTS_INACTIVE_MESSAGE,
    type ContactGroupSummary,
    type ContactsFeature,
    type ResolvedContact,
} from "../features/contacts/contactsFeature";

export type ContactCommandTarget = string | { contactId: string };

interface ContactQuickPickItem extends vscode.QuickPickItem {
    contactId: string;
}

interface GroupQuickPickItem extends vscode.QuickPickItem {
    groupFile: string;
    groupType: ContactGroupSummary["type"];
}

interface ConfirmationQuickPickItem extends vscode.QuickPickItem {
    confirm: boolean;
}

export function createAddPersonCommand(feature: ContactsFeature): () => Promise<void> {
    return async () => {
        if (!ensureFeatureActive(feature)) {
            return;
        }

        feature.requestAddContactForm();
    };
}

export function createEditPersonCommand(feature: ContactsFeature): (target?: ContactCommandTarget) => Promise<void> {
    return async (target?: ContactCommandTarget) => {
        if (!ensureFeatureActive(feature)) {
            return;
        }

        const contact = await resolveContactSelection(feature, target, "Memoria: Select a person to edit");
        if (!contact) {
            return;
        }

        feature.requestEditContactForm(contact.id);
    };
}

export function createDeletePersonCommand(feature: ContactsFeature): (target?: ContactCommandTarget) => Promise<void> {
    return async (target?: ContactCommandTarget) => {
        if (!ensureFeatureActive(feature)) {
            return;
        }

        const usedFallbackSelection = target === undefined;
        const contact = await resolveContactSelection(feature, target, "Memoria: Select a person to delete");
        if (!contact) {
            return;
        }

        if (usedFallbackSelection && !(await confirmDelete(contact))) {
            return;
        }

        try {
            await feature.deleteContact(contact.id);
        } catch (error) {
            vscode.window.showErrorMessage(
                `Memoria: Could not delete person — ${error instanceof Error ? error.message : String(error)}`
            );
        }
    };
}

export function createMovePersonCommand(feature: ContactsFeature): (target?: ContactCommandTarget) => Promise<void> {
    return async (target?: ContactCommandTarget) => {
        if (!ensureFeatureActive(feature)) {
            return;
        }

        const groups = feature.getGroupSummaries();
        if (groups.length < 2) {
            vscode.window.showInformationMessage("Memoria: Moving a person requires at least two contact groups.");
            return;
        }

        const usedFallbackSelection = target === undefined;
        const contact = await resolveContactSelection(feature, target, "Memoria: Select a person to move");
        if (!contact) {
            return;
        }

        const targetGroup = await resolveTargetGroupSelection(groups, contact, usedFallbackSelection);
        if (!targetGroup) {
            return;
        }

        if (contact.kind === "colleague" && targetGroup.groupType === "report") {
            feature.requestMoveContactForm(contact.id, targetGroup.groupFile);
            return;
        }

        try {
            await feature.moveContact(contact.id, targetGroup.groupFile);
        } catch (error) {
            vscode.window.showErrorMessage(
                `Memoria: Could not move person — ${error instanceof Error ? error.message : String(error)}`
            );
        }
    };
}

function ensureFeatureActive(feature: ContactsFeature): boolean {
    if (feature.isActive()) {
        return true;
    }

    vscode.window.showInformationMessage(CONTACTS_INACTIVE_MESSAGE);
    return false;
}

async function resolveContactSelection(
    feature: ContactsFeature,
    target: ContactCommandTarget | undefined,
    title: string,
): Promise<ResolvedContact | null> {
    const targetContactId = getTargetContactId(target);
    if (targetContactId) {
        const contact = feature.getContactById(targetContactId);
        if (!contact) {
            vscode.window.showErrorMessage(`Memoria: Contact "${targetContactId}" was not found.`);
            return null;
        }

        return contact;
    }

    const contacts = [...feature.getAllContacts()]
        .sort((left, right) => left.fullName.localeCompare(right.fullName, undefined, { sensitivity: "base" }));

    if (contacts.length === 0) {
        vscode.window.showInformationMessage("Memoria: No contacts are available.");
        return null;
    }

    const items: ContactQuickPickItem[] = contacts.map((contact) => ({
        label: contact.fullName || contact.nickname || contact.id,
        description: contact.title,
        detail: contact.groupName,
        contactId: contact.id,
    }));

    const picked = await vscode.window.showQuickPick(items, {
        title,
        placeHolder: "Choose a person",
    });

    return picked ? feature.getContactById(picked.contactId) : null;
}

async function confirmDelete(contact: ResolvedContact): Promise<boolean> {
    const picked = await vscode.window.showQuickPick<ConfirmationQuickPickItem>([
        {
            label: `Delete ${contact.fullName || contact.id}`,
            description: contact.groupName,
            confirm: true,
        },
        {
            label: "Cancel",
            confirm: false,
        },
    ], {
        title: "Memoria: Confirm delete",
        placeHolder: "Choose whether to delete this person",
    });

    return picked?.confirm === true;
}

async function resolveTargetGroupSelection(
    groups: readonly ContactGroupSummary[],
    contact: ResolvedContact,
    usedFallbackSelection: boolean,
): Promise<GroupQuickPickItem | null> {
    const availableGroups = groups
        .filter((group) => group.file !== contact.groupFile)
        .sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: "base" }));

    if (availableGroups.length === 0) {
        return null;
    }

    if (!usedFallbackSelection && availableGroups.length === 1) {
        return {
            label: availableGroups[0].name,
            description: availableGroups[0].type,
            groupFile: availableGroups[0].file,
            groupType: availableGroups[0].type,
        };
    }

    const items: GroupQuickPickItem[] = availableGroups.map((group) => ({
        label: group.name,
        description: group.type,
        groupFile: group.file,
        groupType: group.type,
    }));

    const picked = await vscode.window.showQuickPick(items, {
        title: "Memoria: Select a destination group",
        placeHolder: "Choose where to move this person",
    });

    return picked ?? null;
}

function getTargetContactId(target: ContactCommandTarget | undefined): string | null {
    if (!target) {
        return null;
    }

    return typeof target === "string" ? target : target.contactId;
}