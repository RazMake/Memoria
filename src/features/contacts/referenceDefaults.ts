import type {
    CareerLevelReference,
    CareerPathReference,
    InterviewTypeReference,
    PronounsReference,
} from "./types";

export const UNKNOWN_REFERENCE_KEY = "unknown";

export const UNKNOWN_PRONOUNS: PronounsReference = {
    key: UNKNOWN_REFERENCE_KEY,
    subject: "they",
    object: "them",
    possessiveAdjective: "their",
    possessive: "theirs",
    reflexive: "themselves",
    extraFields: {},
};

export const UNKNOWN_CAREER_LEVEL: CareerLevelReference = {
    key: UNKNOWN_REFERENCE_KEY,
    id: 0,
    interviewType: UNKNOWN_REFERENCE_KEY,
    titlePattern: "{CareerPath}",
    extraFields: {},
};

export const UNKNOWN_INTERVIEW_TYPE: InterviewTypeReference = {
    key: UNKNOWN_REFERENCE_KEY,
    name: "Unknown",
    extraFields: {},
};

export const UNKNOWN_CAREER_PATH: CareerPathReference = {
    key: UNKNOWN_REFERENCE_KEY,
    name: "Unknown",
    short: "?",
    minimumCareerLevel: 0,
    extraFields: {},
};

export function isUnknownReferenceKey(key: string | null | undefined): boolean {
    return key === UNKNOWN_REFERENCE_KEY;
}

export function resolvePronouns(key: string | null | undefined, entries: readonly PronounsReference[]): PronounsReference {
    return resolveReference(key, entries, UNKNOWN_PRONOUNS);
}

export function resolveCareerLevel(key: string | null | undefined, entries: readonly CareerLevelReference[]): CareerLevelReference {
    return resolveReference(key, entries, UNKNOWN_CAREER_LEVEL);
}

export function resolveInterviewType(key: string | null | undefined, entries: readonly InterviewTypeReference[]): InterviewTypeReference {
    return resolveReference(key, entries, UNKNOWN_INTERVIEW_TYPE);
}

export function resolveCareerPath(key: string | null | undefined, entries: readonly CareerPathReference[]): CareerPathReference {
    return resolveReference(key, entries, UNKNOWN_CAREER_PATH);
}

function resolveReference<TReference extends { key: string }>(
    key: string | null | undefined,
    entries: readonly TReference[],
    fallback: TReference,
): TReference {
    if (!key || isUnknownReferenceKey(key)) {
        return fallback;
    }

    return entries.find((entry) => entry.key === key) ?? fallback;
}