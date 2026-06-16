/**
 * LiveContactsProvider — VS Code host implementation of ContactsProvider.
 * Wraps ContactsFeature.
 */

import type { ContactsFeature } from "../contacts/contactsFeature";
import type { ContactsProvider, MeProfile, ResolvedContact } from "./contactsProvider";
import type { CareerLevelReference } from "../contacts/types";

export class LiveContactsProvider implements ContactsProvider {
    constructor(private readonly contacts: ContactsFeature) {}

    isAvailable(): boolean {
        return this.contacts.isActive();
    }

    listGroups(): string[] {
        if (!this.isAvailable()) return [];
        return this.contacts.getGroupSummaries().map((g) => g.name);
    }

    getGroupContacts(groupName: string): ResolvedContact[] {
        if (!this.isAvailable()) return [];
        return this.contacts.getGroupContacts(groupName);
    }

    async getMe(): Promise<MeProfile | null> {
        if (!this.isAvailable()) return null;
        return this.contacts.getMe();
    }

    getCareerLevel(levelId: string): CareerLevelReference | null {
        if (!this.isAvailable()) return null;
        return this.contacts.getResolvedReferenceData().careerLevels.find((cl) => cl.key === levelId) ?? null;
    }

    getCareerLevelByNumericId(id: number): CareerLevelReference | null {
        if (!this.isAvailable()) return null;
        return this.contacts.getResolvedReferenceData().careerLevels.find((cl) => cl.id === id) ?? null;
    }
}
