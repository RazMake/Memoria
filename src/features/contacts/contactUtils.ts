import * as vscode from "vscode";
import { normalizePath } from "../../utils/path";
import {
    resolveCareerLevel,
    resolveCareerPath,
} from "./referenceDefaults";
import { generateCanonicalTitlePairs, generateTitle } from "./titleGenerator";
import type {
    CareerPathReference,
    ColleagueContact,
    Contact,
    ContactKind,
    ContactsReferenceData,
    ReportContact,
} from "./types";

// Re-export pure resolution types and functions from contactResolution.ts for backward compat.
export type {
    ContactGroupInfo,
    ResolvedCareerLevelReference,
    ResolvedContact,
    ResolvedContactsReferenceData,
} from "./contactResolution";
export {
    buildResolvedContact,
    buildResolvedReferenceData,
    buildShortTitleLookup,
} from "./contactResolution";

export function createEmptyReferenceData(): ContactsReferenceData {
    return {
        pronouns: [],
        careerLevels: [],
        careerPaths: [],
        interviewTypes: [],
    };
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
                ...(sourceContact.employeeId ? { EmployeeId: sourceContact.employeeId } : {}),
                ...(sourceContact.bandRank ? { BandRank: sourceContact.bandRank } : {}),
                ...(sourceContact.overallRank ? { OverallRank: sourceContact.overallRank } : {}),
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
    const employeeId = sourceContact.droppedFields.EmployeeId ?? "";
    const bandRank = sourceContact.droppedFields.BandRank ?? "";
    const overallRank = sourceContact.droppedFields.OverallRank ?? "";
    delete nextDroppedFields.EmployeeId;
    delete nextDroppedFields.BandRank;
    delete nextDroppedFields.OverallRank;

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
        employeeId,
        bandRank,
        overallRank,
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
