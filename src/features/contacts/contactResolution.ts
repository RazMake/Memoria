/**
 * Pure contact resolution functions — no vscode import.
 * These are used by both the VS Code extension (via contactUtils.ts re-exports)
 * and the CLI's DiskContactsProvider.
 */

import {
    resolveCareerLevel,
    resolveCareerPath,
    resolveInterviewType,
    resolvePronouns,
} from "./referenceDefaults";
import { generateCanonicalTitlePairs } from "./titleGenerator";
import type {
    CareerLevelReference,
    CareerPathReference,
    Contact,
    ContactKind,
    ContactsReferenceData,
    ContactTitlePair,
    InterviewTypeReference,
    PronounsReference,
} from "./types";

export interface ContactGroupInfo {
    file: string;
    name: string;
    type: ContactKind;
    isCustom: boolean;
}

export interface ResolvedCareerLevelReference extends CareerLevelReference {
    resolvedInterviewType: InterviewTypeReference;
}

export type ResolvedContact = Contact & {
    groupFile: string;
    groupName: string;
    groupType: ContactKind;
    isCustomGroup: boolean;
    shortTitle: string;
    resolvedPronouns: PronounsReference;
    resolvedCareerPath: CareerPathReference;
    resolvedCareerLevel: CareerLevelReference | null;
    resolvedInterviewType: InterviewTypeReference | null;
};

export interface ResolvedContactsReferenceData {
    pronouns: PronounsReference[];
    careerLevels: ResolvedCareerLevelReference[];
    careerPaths: CareerPathReference[];
    interviewTypes: InterviewTypeReference[];
    canonicalTitles: ContactTitlePair[];
}

export function buildResolvedReferenceData(referenceData: ContactsReferenceData): ResolvedContactsReferenceData {
    const canonicalTitles = structuredClone(
        generateCanonicalTitlePairs(referenceData.careerPaths, referenceData.careerLevels),
    );

    return {
        pronouns: structuredClone(referenceData.pronouns),
        careerLevels: referenceData.careerLevels.map((careerLevel) => ({
            ...structuredClone(careerLevel),
            resolvedInterviewType: structuredClone(
                resolveInterviewType(careerLevel.interviewType, referenceData.interviewTypes),
            ),
        })),
        careerPaths: structuredClone(referenceData.careerPaths),
        interviewTypes: structuredClone(referenceData.interviewTypes),
        canonicalTitles,
    };
}

export function buildResolvedContact(
    contact: Contact,
    group: ContactGroupInfo,
    referenceData: ContactsReferenceData,
    shortTitleLookup: ReadonlyMap<string, string>,
): ResolvedContact {
    const resolvedCareerPath = structuredClone(resolveCareerPath(contact.careerPathKey, referenceData.careerPaths));
    const resolvedPronouns = structuredClone(resolvePronouns(contact.pronounsKey, referenceData.pronouns));

    const base = {
        ...structuredClone(contact),
        groupFile: group.file,
        groupName: group.name,
        groupType: group.type,
        isCustomGroup: group.isCustom,
        shortTitle: shortTitleLookup.get(contact.title) ?? contact.title,
        resolvedPronouns,
        resolvedCareerPath,
    };

    if (contact.kind === "report") {
        const resolvedCareerLevel = structuredClone(resolveCareerLevel(contact.levelId, referenceData.careerLevels));
        const resolvedInterviewType = structuredClone(
            resolveInterviewType(resolvedCareerLevel.interviewType, referenceData.interviewTypes),
        );

        return {
            ...base,
            resolvedCareerLevel,
            resolvedInterviewType,
        };
    }

    return {
        ...base,
        resolvedCareerLevel: null,
        resolvedInterviewType: null,
    };
}

export function buildShortTitleLookup(referenceData: ContactsReferenceData): Map<string, string> {
    return new Map(
        generateCanonicalTitlePairs(referenceData.careerPaths, referenceData.careerLevels)
            .map((pair) => [pair.normal, pair.short] as const),
    );
}
