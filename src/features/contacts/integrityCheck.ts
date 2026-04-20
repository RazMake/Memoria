import { UNKNOWN_REFERENCE_KEY } from "./referenceDefaults";
import type {
    CareerLevelIntegrityCorrection,
    CareerLevelReference,
    Contact,
    ContactGroupDocument,
    ContactIntegrityCorrection,
    ContactsReferenceData,
} from "./types";

export function findContactIntegrityCorrections(
    document: ContactGroupDocument,
    referenceData: ContactsReferenceData,
): ContactIntegrityCorrection[] {
    const pronounKeys = new Set(referenceData.pronouns.map((entry) => entry.key));
    const careerPathKeys = new Set(referenceData.careerPaths.map((entry) => entry.key));
    const careerLevelKeys = new Set(referenceData.careerLevels.map((entry) => entry.key));
    const corrections: ContactIntegrityCorrection[] = [];

    for (const contact of document.contacts) {
        if (isMissingReference(contact.pronounsKey, pronounKeys)) {
            corrections.push(buildContactCorrection(contact.id, "pronounsKey", contact.pronounsKey));
        }

        if (isMissingReference(contact.careerPathKey, careerPathKeys)) {
            corrections.push(buildContactCorrection(contact.id, "careerPathKey", contact.careerPathKey));
        }

        if (contact.kind === "report" && isMissingReference(contact.levelId, careerLevelKeys)) {
            corrections.push(buildContactCorrection(contact.id, "levelId", contact.levelId));
        }
    }

    return corrections;
}

export function applyContactIntegrityCorrections(
    document: ContactGroupDocument,
    corrections: readonly ContactIntegrityCorrection[],
): ContactGroupDocument {
    if (corrections.length === 0) {
        return document;
    }

    const correctionsByContactId = new Map<string, ContactIntegrityCorrection[]>();
    for (const correction of corrections) {
        const existing = correctionsByContactId.get(correction.contactId) ?? [];
        existing.push(correction);
        correctionsByContactId.set(correction.contactId, existing);
    }

    return {
        kind: document.kind,
        contacts: document.contacts.map((contact) => {
            const contactCorrections = correctionsByContactId.get(contact.id);
            if (!contactCorrections) {
                return contact;
            }

            return applyCorrectionsToContact(contact, contactCorrections);
        }),
    };
}

export function findCareerLevelIntegrityCorrections(
    careerLevels: readonly CareerLevelReference[],
    interviewTypes: readonly { key: string }[],
): CareerLevelIntegrityCorrection[] {
    const interviewTypeKeys = new Set(interviewTypes.map((entry) => entry.key));
    const corrections: CareerLevelIntegrityCorrection[] = [];

    for (const careerLevel of careerLevels) {
        if (isMissingReference(careerLevel.interviewType, interviewTypeKeys)) {
            corrections.push({
                entityType: "careerLevel",
                levelKey: careerLevel.key,
                field: "interviewType",
                oldValue: careerLevel.interviewType,
                newValue: UNKNOWN_REFERENCE_KEY,
            });
        }
    }

    return corrections;
}

export function applyCareerLevelIntegrityCorrections(
    careerLevels: readonly CareerLevelReference[],
    corrections: readonly CareerLevelIntegrityCorrection[],
): CareerLevelReference[] {
    if (corrections.length === 0) {
        return [...careerLevels];
    }

    const correctionsByLevelKey = new Map(corrections.map((correction) => [correction.levelKey, correction]));
    return careerLevels.map((careerLevel) => {
        const correction = correctionsByLevelKey.get(careerLevel.key);
        if (!correction) {
            return { ...careerLevel, extraFields: { ...careerLevel.extraFields } };
        }

        return {
            ...careerLevel,
            interviewType: correction.newValue,
            extraFields: { ...careerLevel.extraFields },
        };
    });
}

function buildContactCorrection(
    contactId: string,
    field: ContactIntegrityCorrection["field"],
    oldValue: string,
): ContactIntegrityCorrection {
    return {
        entityType: "contact",
        contactId,
        field,
        oldValue,
        newValue: UNKNOWN_REFERENCE_KEY,
    };
}

function isMissingReference(referenceKey: string, validKeys: ReadonlySet<string>): boolean {
    return referenceKey !== UNKNOWN_REFERENCE_KEY && !validKeys.has(referenceKey);
}

function applyCorrectionsToContact(contact: Contact, corrections: readonly ContactIntegrityCorrection[]): Contact {
    if (contact.kind === "report") {
        const updatedContact = {
            ...contact,
            extraFields: { ...contact.extraFields },
            droppedFields: { ...contact.droppedFields },
        };

        for (const correction of corrections) {
            switch (correction.field) {
                case "pronounsKey":
                    updatedContact.pronounsKey = correction.newValue;
                    break;
                case "careerPathKey":
                    updatedContact.careerPathKey = correction.newValue;
                    break;
                case "levelId":
                    updatedContact.levelId = correction.newValue;
                    break;
            }
        }

        return updatedContact;
    }

    const updatedContact = {
        ...contact,
        extraFields: { ...contact.extraFields },
        droppedFields: { ...contact.droppedFields },
    };

    for (const correction of corrections) {
        if (correction.field === "pronounsKey") {
            updatedContact.pronounsKey = correction.newValue;
            continue;
        }

        if (correction.field === "careerPathKey") {
            updatedContact.careerPathKey = correction.newValue;
        }
    }

    return updatedContact;
}