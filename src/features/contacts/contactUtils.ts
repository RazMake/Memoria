import * as vscode from "vscode";
import { normalizePath } from "../../utils/path";
import {
    resolveCareerLevel,
    resolveCareerPath,
    resolveInterviewType,
    resolvePronouns,
} from "./referenceDefaults";
import { generateCanonicalTitlePairs, generateTitle } from "./titleGenerator";
import type {
    CareerLevelReference,
    CareerPathReference,
    ColleagueContact,
    Contact,
    ContactKind,
    ContactsReferenceData,
    ContactTitlePair,
    InterviewTypeReference,
    PronounsReference,
    ReportContact,
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

export function createEmptyReferenceData(): ContactsReferenceData {
    return {
        pronouns: [],
        careerLevels: [],
        careerPaths: [],
        interviewTypes: [],
    };
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

    if (contact.kind === "report") {
        const resolvedCareerLevel = structuredClone(resolveCareerLevel(contact.levelId, referenceData.careerLevels));
        const resolvedInterviewType = structuredClone(
            resolveInterviewType(resolvedCareerLevel.interviewType, referenceData.interviewTypes),
        );

        return {
            ...structuredClone(contact),
            groupFile: group.file,
            groupName: group.name,
            groupType: group.type,
            isCustomGroup: group.isCustom,
            shortTitle: shortTitleLookup.get(contact.title) ?? contact.title,
            resolvedPronouns,
            resolvedCareerPath,
            resolvedCareerLevel,
            resolvedInterviewType,
        };
    }

    return {
        ...structuredClone(contact),
        groupFile: group.file,
        groupName: group.name,
        groupType: group.type,
        isCustomGroup: group.isCustom,
        shortTitle: shortTitleLookup.get(contact.title) ?? contact.title,
        resolvedPronouns,
        resolvedCareerPath,
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

export function buildAutoMovedContact(
    sourceContact: Contact,
    targetKind: ContactKind,
    referenceData: ContactsReferenceData,
): Contact {
    if (sourceContact.kind === targetKind) {
        return structuredClone(sourceContact);
    }

    if (sourceContact.kind === "report") {
        const movedContact: ColleagueContact = {
            kind: "colleague",
            id: sourceContact.id,
            nickname: sourceContact.nickname,
            fullName: sourceContact.fullName,
            title: sourceContact.title,
            careerPathKey: sourceContact.careerPathKey,
            pronounsKey: sourceContact.pronounsKey,
            extraFields: structuredClone(sourceContact.extraFields),
            droppedFields: {
                ...structuredClone(sourceContact.droppedFields),
                LevelId: sourceContact.levelId,
                LevelStartDate: sourceContact.levelStartDate,
            },
        };
        return movedContact;
    }

    const levelId = sourceContact.droppedFields.LevelId;
    const levelStartDate = sourceContact.droppedFields.LevelStartDate;
    if (!levelId || !levelStartDate) {
        throw new Error("Moving this contact to a reports group requires LevelId and LevelStartDate.");
    }

    const nextDroppedFields = structuredClone(sourceContact.droppedFields);
    delete nextDroppedFields.LevelId;
    delete nextDroppedFields.LevelStartDate;

    const resolvedCareerPath = resolveCareerPath(sourceContact.careerPathKey, referenceData.careerPaths);
    const resolvedCareerLevel = resolveCareerLevel(levelId, referenceData.careerLevels);

    const movedContact: ReportContact = {
        kind: "report",
        id: sourceContact.id,
        nickname: sourceContact.nickname,
        fullName: sourceContact.fullName,
        title: generateTitle(resolvedCareerPath, resolvedCareerLevel).normal,
        careerPathKey: sourceContact.careerPathKey,
        levelId,
        levelStartDate,
        pronounsKey: sourceContact.pronounsKey,
        extraFields: structuredClone(sourceContact.extraFields),
        droppedFields: nextDroppedFields,
    };

    return movedContact;
}

export function mergeMovedContact(autoMovedContact: Contact, targetContact: Contact): Contact {
    if (autoMovedContact.kind !== targetContact.kind) {
        throw new Error("Target contact kind does not match the destination group.");
    }

    if (autoMovedContact.id !== targetContact.id) {
        throw new Error("Moving a contact cannot change its id.");
    }

    const clonedTarget = structuredClone(targetContact);
    if (autoMovedContact.kind === "report") {
        const reportAutoMovedContact = autoMovedContact;
        const reportTarget = clonedTarget as ReportContact;
        const mergedContact: ReportContact = {
            ...reportAutoMovedContact,
            ...reportTarget,
            extraFields: {
                ...reportAutoMovedContact.extraFields,
                ...reportTarget.extraFields,
            },
            droppedFields: {
                ...reportAutoMovedContact.droppedFields,
                ...reportTarget.droppedFields,
            },
        };
        return mergedContact;
    }

    const colleagueAutoMovedContact = autoMovedContact;
    const colleagueTarget = clonedTarget as ColleagueContact;
    const mergedContact: ColleagueContact = {
        ...colleagueAutoMovedContact,
        ...colleagueTarget,
        extraFields: {
            ...colleagueAutoMovedContact.extraFields,
            ...colleagueTarget.extraFields,
        },
        droppedFields: {
            ...colleagueAutoMovedContact.droppedFields,
            ...colleagueTarget.droppedFields,
        },
    };
    return mergedContact;
}

export function splitRelativePath(value: string): string[] {
    return normalizePath(value).split("/").filter(Boolean);
}

export function joinRelativePath(base: vscode.Uri, relativePath: string): vscode.Uri {
    const segments = splitRelativePath(relativePath);
    return segments.length === 0 ? base : vscode.Uri.joinPath(base, ...segments);
}

export function fileName(value: string): string {
    const segments = splitRelativePath(value);
    return segments.length === 0 ? value : segments[segments.length - 1];
}

export function stripMarkdownExtension(value: string): string {
    return value.replace(/\.md$/i, "");
}

export function compareText(left: string, right: string): number {
    return left.localeCompare(right, undefined, { sensitivity: "base" });
}

export function disposeAll(disposables: readonly vscode.Disposable[]): void {
    for (const disposable of disposables) {
        disposable.dispose();
    }
}
