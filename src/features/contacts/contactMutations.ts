import * as vscode from "vscode";
import {
    addContact as addContactToDocument,
    removeContactById,
    serializeContactGroupDocument,
} from "./contactParser";
import {
    buildAutoMovedContact,
    mergeMovedContact,
    splitRelativePath,
} from "./contactUtils";
import type { LoadedGroupState } from "./contactFileLoader";
import { generateTitle } from "./titleGenerator";
import type {
    CareerLevelReference,
    CareerPathReference,
    Contact,
    ContactGroupDocument,
    ContactKind,
    ContactsReferenceData,
    PronounsReference,
} from "./types";
import { textEncoder } from "../../utils/encoding";
import { isMarkdownPath } from "../../utils/markdown";

const encoder = textEncoder;

const INVALID_GROUP_NAME_RE = /[\\/:*?"<>|]/;

export interface ContactLocation {
    group: LoadedGroupState;
    contact: Contact;
}

export function findContactLocation(groups: readonly LoadedGroupState[], contactId: string): ContactLocation | null {
    for (const group of groups) {
        const contact = group.document.contacts.find((candidate) => candidate.id === contactId);
        if (contact) {
            return { group, contact };
        }
    }

    return null;
}

export function requireContact(groups: readonly LoadedGroupState[], contactId: string): ContactLocation {
    const location = findContactLocation(groups, contactId);
    if (!location) {
        throw new Error(`Contact "${contactId}" was not found.`);
    }

    return location;
}

export function requireGroup(groups: readonly LoadedGroupState[], groupFile: string): LoadedGroupState {
    const group = groups.find((entry) => entry.file === groupFile);
    if (!group) {
        throw new Error(`Contact group "${groupFile}" was not found.`);
    }

    return group;
}

export function assertUniqueContactId(
    groups: readonly LoadedGroupState[],
    candidateId: string,
    exclude?: { groupFile: string; contactId: string },
): void {
    for (const group of groups) {
        for (const contact of group.document.contacts) {
            if (exclude && group.file === exclude.groupFile && contact.id === exclude.contactId) {
                continue;
            }

            if (contact.id === candidateId) {
                throw new Error(`A contact with id "${candidateId}" already exists.`);
            }
        }
    }
}

export function requirePronouns(referenceData: ContactsReferenceData, pronounsKey: string): PronounsReference {
    const match = referenceData.pronouns.find((entry) => entry.key === pronounsKey);
    if (!match) {
        throw new Error(`Pronouns "${pronounsKey}" do not exist.`);
    }

    return match;
}

export function requireCareerPath(referenceData: ContactsReferenceData, careerPathKey: string): CareerPathReference {
    const match = referenceData.careerPaths.find((entry) => entry.key === careerPathKey);
    if (!match) {
        throw new Error(`Career path "${careerPathKey}" does not exist.`);
    }

    return match;
}

export function requireCareerLevel(referenceData: ContactsReferenceData, levelId: string): CareerLevelReference {
    const match = referenceData.careerLevels.find((entry) => entry.key === levelId);
    if (!match) {
        throw new Error(`Career level "${levelId}" does not exist.`);
    }

    return match;
}

export function prepareContactForWrite(
    contact: Contact,
    expectedKind: ContactKind,
    referenceData: ContactsReferenceData,
): Contact {
    if (contact.kind !== expectedKind) {
        throw new Error(`Expected a ${expectedKind} contact for this group.`);
    }

    const normalizedContact = structuredClone(contact);
    if (!normalizedContact.id.trim()) {
        throw new Error("Contact id is required.");
    }
    if (!normalizedContact.nickname.trim()) {
        throw new Error("Nickname is required.");
    }
    if (!normalizedContact.fullName.trim()) {
        throw new Error("Full name is required.");
    }
    if (!normalizedContact.careerPathKey.trim()) {
        throw new Error("Career path is required.");
    }
    if (!normalizedContact.pronounsKey.trim()) {
        throw new Error("Pronouns are required.");
    }

    const careerPath = requireCareerPath(referenceData, normalizedContact.careerPathKey);
    requirePronouns(referenceData, normalizedContact.pronounsKey);

    if (normalizedContact.kind === "report") {
        if (!normalizedContact.levelId.trim()) {
            throw new Error("LevelId is required for report contacts.");
        }
        if (!normalizedContact.levelStartDate.trim()) {
            throw new Error("LevelStartDate is required for report contacts.");
        }

        const careerLevel = requireCareerLevel(referenceData, normalizedContact.levelId);
        if (careerLevel.id < careerPath.minimumCareerLevel) {
            throw new Error(`Career level "${careerLevel.key}" is below the minimum allowed for "${careerPath.name}".`);
        }

        if (!normalizedContact.title.trim()) {
            normalizedContact.title = generateTitle(careerPath, careerLevel).normal;
        }
    } else if (!normalizedContact.title.trim()) {
        throw new Error("Title is required for colleague contacts.");
    }

    return normalizedContact;
}

export function prepareMovedContact(
    sourceContact: Contact,
    targetKind: ContactKind,
    referenceData: ContactsReferenceData,
    targetContact?: Contact,
): Contact {
    const autoMovedContact = buildAutoMovedContact(sourceContact, targetKind, referenceData);
    const mergedContact = targetContact
        ? mergeMovedContact(autoMovedContact, targetContact)
        : autoMovedContact;

    return prepareContactForWrite(mergedContact, targetKind, referenceData);
}

export async function writeGroupDocument(
    fs: typeof vscode.workspace.fs,
    peopleRoot: vscode.Uri,
    groupFile: string,
    document: ContactGroupDocument,
): Promise<void> {
    const segments = splitRelativePath(groupFile);
    if (segments.length > 1) {
        await fs.createDirectory(vscode.Uri.joinPath(peopleRoot, ...segments.slice(0, -1)));
    }

    await writeTextFile(fs, vscode.Uri.joinPath(peopleRoot, ...segments), serializeContactGroupDocument(document));
}

export async function writeTextFile(
    fs: typeof vscode.workspace.fs,
    uri: vscode.Uri,
    text: string,
): Promise<void> {
    await fs.writeFile(uri, encoder.encode(text));
}

export function toCustomGroupFileName(name: string): string {
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
