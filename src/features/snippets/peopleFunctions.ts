/**
 * Host-registered adapter built-in functions: PeopleSelector, Me, DeadlineSelector.
 * Closes over a ContactsProvider; no vscode import; no direct Contacts coupling in the engine core.
 */

import type { TemplateFunction, TemplateContext, TemplateInput } from "./templates/templateTypes";
import type { ContactsProvider, MeProfile, ResolvedContact } from "./contactsProvider";
import type { CareerLevelReference, PronounsReference } from "../contacts/types";
import { formatDueIn, formatDueBy } from "../../utils/dateUtils";
import { parseDuration } from "./templates/templateParser";

// Re-export for convenience
export type { ResolvedContact, MeProfile };

// ── Constants ────────────────────────────────────────────────────────────────

/**
 * Mapping from camelCase ResolvedContact property names to their PascalCase aliases,
 * exposed on the flattened contact for template expressions (e.g. {{candidate.FullName}}).
 */
const CAMEL_TO_PASCAL_CONTACT_PROPS: ReadonlyMap<string, string> = new Map([
    ["kind", "Kind"],
    ["id", "Id"],
    ["nickname", "Nickname"],
    ["fullName", "FullName"],
    ["title", "Title"],
    ["careerPathKey", "CareerPathKey"],
    ["pronounsKey", "PronounsKey"],
    ["extraFields", "ExtraFields"],
    ["droppedFields", "DroppedFields"],
    ["levelStartDate", "LevelStartDate"],
    ["employeeId", "EmployeeId"],
    ["bandRank", "BandRank"],
    ["overallRank", "OverallRank"],
    ["groupFile", "GroupFile"],
    ["groupName", "GroupName"],
    ["groupType", "GroupType"],
    ["isCustomGroup", "IsCustomGroup"],
    ["shortTitle", "ShortTitle"],
    ["resolvedPronouns", "ResolvedPronouns"],
    ["resolvedCareerPath", "ResolvedCareerPath"],
    ["resolvedCareerLevel", "ResolvedCareerLevel"],
    ["resolvedInterviewType", "ResolvedInterviewType"],
]);

/** All known ResolvedContact property names (camelCase and PascalCase) — used to prevent flattening collisions. */
const KNOWN_CONTACT_PROPS = new Set([
    ...CAMEL_TO_PASCAL_CONTACT_PROPS.keys(),
    ...CAMEL_TO_PASCAL_CONTACT_PROPS.values(),
    "levelId", "LevelId",
    "pronouns", "Pronouns",
    "level", "Level",
    "nextLevel", "NextLevel",
]);

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Returns a copy of a CareerLevelReference with PascalCase property aliases added. */
function flattenCareerLevelRef(level: CareerLevelReference): CareerLevelReference & Record<string, unknown> {
    return {
        ...level,
        Key: level.key,
        Id: level.id,
        InterviewType: level.interviewType,
        TitlePattern: level.titlePattern,
        ExtraFields: level.extraFields,
    };
}

/** Returns a copy of a PronounsReference with PascalCase property aliases added. */
function flattenPronounsRef(pronouns: PronounsReference): PronounsReference & Record<string, unknown> {
    return {
        ...pronouns,
        Key: pronouns.key,
        Subject: pronouns.subject,
        Object: pronouns.object,
        PossessiveAdjective: pronouns.possessiveAdjective,
        Possessive: pronouns.possessive,
        Reflexive: pronouns.reflexive,
        ExtraFields: pronouns.extraFields,
    };
}

// ── Flattened contact type ────────────────────────────────────────────────────

export type FlattenedContact = ResolvedContact & Record<string, unknown>;

/** Flattens a contact's extraFields to top-level properties, skipping known property names.
 *  Also adds PascalCase aliases, pronouns/level short aliases, and nextLevel lookup. */
function flattenContact(
    contact: ResolvedContact,
    diagnostics: string[],
    getCareerLevel: (levelId: string) => CareerLevelReference | null,
    getCareerLevelByNumericId: (id: number) => CareerLevelReference | null,
): FlattenedContact {
    const flat: Record<string, unknown> = { ...contact };

    // Remove raw levelId — superseded by level.key
    delete flat["levelId"];

    // Add PascalCase aliases for all known camelCase properties
    for (const [camel, pascal] of CAMEL_TO_PASCAL_CONTACT_PROPS) {
        if (Object.hasOwn(flat, camel)) {
            flat[pascal] = flat[camel];
        }
    }

    // Add short aliases for the resolved reference objects
    if (contact.resolvedPronouns !== undefined) {
        const flatPronouns = flattenPronounsRef(contact.resolvedPronouns);
        flat["pronouns"] = flatPronouns;
        flat["Pronouns"] = flatPronouns;
    }
    if (contact.resolvedCareerLevel !== undefined) {
        const flatLevel = contact.resolvedCareerLevel !== null ? flattenCareerLevelRef(contact.resolvedCareerLevel) : null;
        flat["level"] = flatLevel;
        flat["Level"] = flatLevel;
    }

    // Add nextLevel / NextLevel by looking up the level whose numeric id is currentLevel.id + 1
    if (contact.resolvedCareerLevel !== null && contact.resolvedCareerLevel !== undefined) {
        const nextLevelRaw = getCareerLevelByNumericId(contact.resolvedCareerLevel.id + 1);
        const nextLevel = nextLevelRaw !== null ? flattenCareerLevelRef(nextLevelRaw) : null;
        flat["nextLevel"] = nextLevel;
        flat["NextLevel"] = nextLevel;
    }

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

            const hasLabel = ctx.args[0]?.isQuoted === true;
            const inputLabel = hasLabel ? ctx.args[0].value : undefined;
            const groupArg = ctx.args[hasLabel ? 1 : 0];
            const groups = groupArg?.options ?? (groupArg?.value ? [groupArg.value] : contacts.listGroups());

            if (groups.length > 1) {
                // Multi-group: first pick group, then pick person
                return [
                    {
                        name: "group",
                        label: inputLabel ?? "Select group",
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
                    label: inputLabel ?? `Select person from ${groupName}`,
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
                throw new Error(
                    "Contacts is unavailable — enable contacts in your workspace blueprint to use PeopleSelector()"
                );
            }

            const hasLabel = ctx.args[0]?.isQuoted === true;
            const groupArg = ctx.args[hasLabel ? 1 : 0];
            const groups = groupArg?.options ?? (groupArg?.value ? [groupArg.value] : contacts.listGroups());
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

            return flattenContact(contact, [], contacts.getCareerLevel.bind(contacts), contacts.getCareerLevelByNumericId.bind(contacts));
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
                    "Contacts is unavailable — enable contacts in your workspace blueprint to use Me()"
                );
            }

            const profile = await Promise.resolve(contacts.getMe());
            if (profile === null) {
                throw new Error(
                    "Me.md not found — create Me.md in your contacts people folder"
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
            const hasLabel = ctx.args[0]?.isQuoted === true;
            const inputLabel = hasLabel ? ctx.args[0].value : undefined;
            const durationArgs = hasLabel ? ctx.args.slice(1) : ctx.args;

            const options = durationArgs
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
                label: inputLabel ?? "Select deadline",
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
