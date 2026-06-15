/**
 * ContactsProvider interface and MeProfile type used by the template engine adapters.
 * No vscode imports.
 * Imported by peopleFunctions.ts and both hosts (VS Code and CLI).
 */

import type { ResolvedContact } from "../contacts/contactResolution";
import type { MeProfile } from "../contacts/contactParser";

export type { MeProfile } from "../contacts/contactParser";
export type { ResolvedContact } from "../contacts/contactResolution";

/** Narrow interface for accessing contacts data from the template engine. */
export interface ContactsProvider {
    /** Group names available to PeopleSelector. */
    listGroups(): string[];
    /** Flattened people in a group (empty if the group is unknown or Contacts is unavailable). */
    getGroupContacts(groupName: string): ResolvedContact[];
    /** The current user's flattened MeProfile parsed from Me.md, or null if absent. */
    getMe(): MeProfile | null | Promise<MeProfile | null>;
    /** Whether Contacts data is available at all (false ⇒ short-circuit people built-ins). */
    isAvailable(): boolean;
}
