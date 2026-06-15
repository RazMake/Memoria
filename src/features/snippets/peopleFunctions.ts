/**
 * Host-registered adapter built-in functions: PeopleSelector, Me, DeadlineSelector.
 * Closes over a ContactsProvider; no vscode import; no direct Contacts coupling in the engine core.
 */

import type { TemplateFunction, TemplateContext, TemplateInput } from "./templates/templateTypes";
import type { ContactsProvider, MeProfile, ResolvedContact } from "./contactsProvider";
import { formatDueIn, formatDueBy } from "../../utils/dateUtils";
import { parseDuration } from "./templates/templateParser";

// Re-export for convenience
export type { ResolvedContact, MeProfile };

// ── Constants ────────────────────────────────────────────────────────────────

/** All known ResolvedContact property names — used to prevent flattening collisions. */
const KNOWN_CONTACT_PROPS = new Set([
    "kind", "id", "nickname", "fullName", "title", "careerPathKey", "pronounsKey",
    "levelId", "levelStartDate", "employeeId", "bandRank", "overallRank",
    "extraFields", "droppedFields",
    "groupFile", "groupName", "groupType", "isCustomGroup", "shortTitle",
    "resolvedPronouns", "resolvedCareerPath", "resolvedCareerLevel", "resolvedInterviewType",
]);

// ── Flattened contact type ────────────────────────────────────────────────────

export type FlattenedContact = ResolvedContact & Record<string, unknown>;

/** Flattens a contact's extraFields to top-level properties, skipping known property names. */
function flattenContact(contact: ResolvedContact, diagnostics: string[]): FlattenedContact {
    const flat: Record<string, unknown> = { ...contact };

    for (const [label, value] of Object.entries(contact.extraFields ?? {})) {
        if (KNOWN_CONTACT_PROPS.has(label)) {
            diagnostics.push(`Contact "${contact.id}": extra field "${label}" shadows a known property — skipped`);
            continue;
        }
        if (Object.hasOwn(flat, label)) {
            continue;
        }
        flat[label] = value;
    }

    return flat as FlattenedContact;
}

// ── PeopleSelector ────────────────────────────────────────────────────────────

/**
 * Creates the PeopleSelector built-in function closed over a ContactsProvider.
 * Argument: one or more group names (union for multi-group).
 */
function createPeopleSelector(contacts: ContactsProvider): TemplateFunction<FlattenedContact> {
    return {
        name: "PeopleSelector",

        describeInputs(ctx: TemplateContext): TemplateInput[] {
            if (!contacts.isAvailable()) {
                return []; // short-circuit
            }

            const arg = ctx.args[0];
            const groups = arg?.options ?? (arg?.value ? [arg.value] : contacts.listGroups());

            if (groups.length > 1) {
                // Multi-group: first pick group, then pick person
                return [
                    {
                        name: "group",
                        label: "Select group",
                        kind: "pick",
                        options: groups.map((g) => ({ value: g, label: g })),
                    },
                    {
                        name: "person",
                        label: "Select person",
                        kind: "pick",
                        resolveOptions(pickCtx: TemplateContext) {
                            const groupName = pickCtx.answers["group"] ?? groups[0];
                            return contacts.getGroupContacts(groupName).map((c) => ({
                                value: c.id,
                                label: c.fullName ?? c.nickname,
                                detail: c.title,
                            }));
                        },
                    },
                ];
            }

            // Single group
            const groupName = groups[0] ?? "";
            return [
                {
                    name: "person",
                    label: `Select person from ${groupName}`,
                    kind: "pick",
                    options: contacts.getGroupContacts(groupName).map((c) => ({
                        value: c.id,
                        label: c.fullName ?? c.nickname,
                        detail: c.title,
                    })),
                },
            ];
        },

        resolve(inputs: Record<string, string>, ctx: TemplateContext): FlattenedContact {
            if (!contacts.isAvailable()) {
                // Return an error sentinel that renders as a diagnostic
                throw new Error(
                    "⚠️ template: Contacts is unavailable — PeopleSelector/Me cannot resolve"
                );
            }

            const arg = ctx.args[0];
            const groups = arg?.options ?? (arg?.value ? [arg.value] : contacts.listGroups());
            const groupName = groups.length > 1
                ? (inputs["group"] ?? groups[0])
                : (groups[0] ?? "");

            const groupContacts = contacts.getGroupContacts(groupName);
            const personId = inputs["person"];

            if (!personId) {
                throw new Error(`PeopleSelector: no person selected from group "${groupName}"`);
            }

            const contact = groupContacts.find((c) => c.id === personId);
            if (!contact) {
                throw new Error(`PeopleSelector: person "${personId}" not found in group "${groupName}"`);
            }

            return flattenContact(contact, []);
        },

        display(result: FlattenedContact): string {
            return result.fullName ?? result.nickname ?? result.id;
        },
    };
}

// ── Me ────────────────────────────────────────────────────────────────────────

/**
 * Creates the Me() built-in function closed over a ContactsProvider.
 * No user inputs — reads from Me.md.
 */
function createMe(contacts: ContactsProvider): TemplateFunction<MeProfile> {
    return {
        name: "Me",

        describeInputs(): TemplateInput[] {
            return []; // no user inputs
        },

        async resolve(): Promise<MeProfile> {
            if (!contacts.isAvailable()) {
                throw new Error(
                    "⚠️ template: Contacts is unavailable — PeopleSelector/Me cannot resolve"
                );
            }

            const profile = await Promise.resolve(contacts.getMe());
            if (profile === null) {
                throw new Error(
                    "⚠️ template: Me.md not found — create it in the Contacts people folder"
                );
            }

            return profile;
        },

        display(result: MeProfile): string {
            return result["FullName"] ?? result["FirstName"] ?? result["Nickname"] ?? "(me)";
        },
    };
}

// ── DeadlineSelector ──────────────────────────────────────────────────────────

/**
 * Creates the DeadlineSelector(dur1, dur2, ...) built-in function.
 * Accepts d (days) and w (weeks) only — not M (months).
 * Reuses formatDueIn/formatDueBy from dateUtils.
 */
function createDeadlineSelector(): TemplateFunction<string> {
    return {
        name: "DeadlineSelector",

        describeInputs(ctx: TemplateContext): TemplateInput[] {
            const options = ctx.args
                .filter((a) => !a.options && a.value.trim())
                .map((a) => {
                    const raw = a.value.trim();
                    let days: number;
                    try {
                        days = parseDuration(raw, new Set(["d", "w"])).days;
                    } catch {
                        throw new Error(`DeadlineSelector: invalid duration "${raw}" — use d (days) or w (weeks) only`);
                    }
                    return {
                        value: String(days),
                        label: formatDueIn(days, ctx.now),
                    };
                });

            return [{
                name: "choice",
                label: "Select deadline",
                kind: "pick",
                options,
            }];
        },

        resolve(inputs: Record<string, string>, ctx: TemplateContext): string {
            const days = parseInt(inputs["choice"] ?? "0", 10);
            return formatDueBy(days, ctx.now);
        },
    };
}

// ── Factory ───────────────────────────────────────────────────────────────────

/**
 * Creates the host-registered built-in function pack closed over a ContactsProvider.
 * Returns [PeopleSelector, Me, DeadlineSelector].
 */
export function createPeopleFunctions(contacts: ContactsProvider): TemplateFunction[] {
    return [
        createPeopleSelector(contacts),
        createMe(contacts),
        createDeadlineSelector(),
    ];
}
