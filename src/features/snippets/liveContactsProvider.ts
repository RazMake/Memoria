/**
 * LiveContactsProvider — VS Code host implementation of ContactsProvider.
 * Wraps ContactsFeature.
 */

import type { ContactsFeature } from "../contacts/contactsFeature";
import type { ContactsProvider, MeProfile, ResolvedContact } from "./contactsProvider";

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
}
