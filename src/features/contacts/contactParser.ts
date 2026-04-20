import type {
    CareerLevelReference,
    CareerPathReference,
    ColleagueContact,
    Contact,
    ContactFieldMap,
    ContactGroupDocument,
    ContactKind,
    InterviewTypeReference,
    PronounsReference,
    ReportContact,
} from "./types";

interface ParsedMarkdownRecord {
    key: string;
    scalarFields: ContactFieldMap;
    nestedFields: Record<string, ContactFieldMap>;
}

const BLANK_LINE_RE = /^\s*$/;
const HEADING_RE = /^\s*#\s+(.+?)\s*$/;
const FIELD_RE = /^\s*-\s*([^:]+):\s*(.*)$/;
const NESTED_FIELD_RE = /^[ \t]{2,}-\s*([^:]+):\s*(.*)$/;
const DROPPED_FIELDS_KEY = "_droppedFields";

const REPORT_FIELD_ORDER = [
    "Nickname",
    "FullName",
    "Title",
    "CareerPathKey",
    "LevelId",
    "LevelStartDate",
    "PronounsKey",
] as const;

const COLLEAGUE_FIELD_ORDER = [
    "Nickname",
    "FullName",
    "Title",
    "CareerPathKey",
    "PronounsKey",
] as const;

const PRONOUN_FIELD_ORDER = [
    "Subject",
    "Object",
    "PossessiveAdjective",
    "Possessive",
    "Reflexive",
] as const;

const CAREER_LEVEL_FIELD_ORDER = [
    "Id",
    "InterviewType",
    "TitlePattern",
] as const;

const CAREER_PATH_FIELD_ORDER = [
    "Name",
    "Short",
    "MinimumCareerLevel",
] as const;

const INTERVIEW_TYPE_FIELD_ORDER = ["Name"] as const;

export function parseContactGroupDocument(text: string, kind: ContactKind): ContactGroupDocument {
    const records = parseMarkdownRecords(text);
    return {
        kind,
        contacts: records.map((record) => (kind === "report" ? toReportContact(record) : toColleagueContact(record))),
    };
}

export function serializeContactGroupDocument(document: ContactGroupDocument): string {
    return document.contacts.map(serializeContact).join("\n\n");
}

export function addContact<TContact extends Contact>(
    document: ContactGroupDocument<TContact>,
    contact: TContact,
): ContactGroupDocument<TContact> {
    return {
        kind: document.kind,
        contacts: [...document.contacts, cloneContact(contact)],
    };
}

export function removeContactById<TContact extends Contact>(
    document: ContactGroupDocument<TContact>,
    contactId: string,
): ContactGroupDocument<TContact> {
    return {
        kind: document.kind,
        contacts: document.contacts.filter((contact) => contact.id !== contactId),
    };
}

export function upsertContact<TContact extends Contact>(
    document: ContactGroupDocument<TContact>,
    contact: TContact,
): ContactGroupDocument<TContact> {
    const index = document.contacts.findIndex((candidate) => candidate.id === contact.id);
    if (index < 0) {
        return addContact(document, contact);
    }

    const contacts = [...document.contacts];
    contacts[index] = cloneContact(contact);
    return {
        kind: document.kind,
        contacts,
    };
}

export function findDuplicateContactIds(documents: readonly ContactGroupDocument[]): string[] {
    const seen = new Set<string>();
    const duplicates = new Set<string>();

    for (const document of documents) {
        for (const contact of document.contacts) {
            if (seen.has(contact.id)) {
                duplicates.add(contact.id);
                continue;
            }

            seen.add(contact.id);
        }
    }

    return [...duplicates];
}

export function parsePronounsDocument(text: string): PronounsReference[] {
    return parseMarkdownRecords(text).map((record) => {
        const knownKeys = new Set(PRONOUN_FIELD_ORDER);
        return {
            key: record.key,
            subject: record.scalarFields.Subject ?? "",
            object: record.scalarFields.Object ?? "",
            possessiveAdjective: record.scalarFields.PossessiveAdjective ?? "",
            possessive: record.scalarFields.Possessive ?? "",
            reflexive: record.scalarFields.Reflexive ?? "",
            extraFields: extractExtraFields(record.scalarFields, knownKeys),
        };
    });
}

export function serializePronounsDocument(entries: readonly PronounsReference[]): string {
    return entries.map((entry) => serializeReferenceEntry(entry.key, [
        ["Subject", entry.subject],
        ["Object", entry.object],
        ["PossessiveAdjective", entry.possessiveAdjective],
        ["Possessive", entry.possessive],
        ["Reflexive", entry.reflexive],
    ], entry.extraFields)).join("\n\n");
}

export function parseCareerLevelsDocument(text: string): CareerLevelReference[] {
    return parseMarkdownRecords(text).map((record) => {
        const knownKeys = new Set(CAREER_LEVEL_FIELD_ORDER);
        return {
            key: record.key,
            id: parseNumberField(record.scalarFields.Id),
            interviewType: record.scalarFields.InterviewType ?? "",
            titlePattern: record.scalarFields.TitlePattern ?? "",
            extraFields: extractExtraFields(record.scalarFields, knownKeys),
        };
    });
}

export function serializeCareerLevelsDocument(entries: readonly CareerLevelReference[]): string {
    return entries.map((entry) => serializeReferenceEntry(entry.key, [
        ["Id", String(entry.id)],
        ["InterviewType", entry.interviewType],
        ["TitlePattern", entry.titlePattern],
    ], entry.extraFields)).join("\n\n");
}

export function parseCareerPathsDocument(text: string): CareerPathReference[] {
    return parseMarkdownRecords(text).map((record) => {
        const knownKeys = new Set(CAREER_PATH_FIELD_ORDER);
        return {
            key: record.key,
            name: record.scalarFields.Name ?? "",
            short: record.scalarFields.Short ?? "",
            minimumCareerLevel: parseNumberField(record.scalarFields.MinimumCareerLevel),
            extraFields: extractExtraFields(record.scalarFields, knownKeys),
        };
    });
}

export function serializeCareerPathsDocument(entries: readonly CareerPathReference[]): string {
    return entries.map((entry) => serializeReferenceEntry(entry.key, [
        ["Name", entry.name],
        ["Short", entry.short],
        ["MinimumCareerLevel", String(entry.minimumCareerLevel)],
    ], entry.extraFields)).join("\n\n");
}

export function parseInterviewTypesDocument(text: string): InterviewTypeReference[] {
    return parseMarkdownRecords(text).map((record) => {
        const knownKeys = new Set(INTERVIEW_TYPE_FIELD_ORDER);
        return {
            key: record.key,
            name: record.scalarFields.Name ?? "",
            extraFields: extractExtraFields(record.scalarFields, knownKeys),
        };
    });
}

export function serializeInterviewTypesDocument(entries: readonly InterviewTypeReference[]): string {
    return entries.map((entry) => serializeReferenceEntry(entry.key, [["Name", entry.name]], entry.extraFields)).join("\n\n");
}

function parseMarkdownRecords(text: string): ParsedMarkdownRecord[] {
    const lines = text.split(/\r?\n/);
    const records: ParsedMarkdownRecord[] = [];
    let current: ParsedMarkdownRecord | null = null;

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
        const line = lines[lineIndex];
        const headingMatch = HEADING_RE.exec(line);
        if (headingMatch) {
            if (current) {
                records.push(current);
            }

            current = {
                key: headingMatch[1].trim(),
                scalarFields: {},
                nestedFields: {},
            };
            continue;
        }

        if (!current || BLANK_LINE_RE.test(line)) {
            continue;
        }

        const fieldMatch = FIELD_RE.exec(line);
        if (!fieldMatch) {
            continue;
        }

        const fieldKey = fieldMatch[1].trim();
        if (fieldKey === DROPPED_FIELDS_KEY) {
            const droppedFields: ContactFieldMap = {};

            for (lineIndex += 1; lineIndex < lines.length; lineIndex++) {
                const nestedLine = lines[lineIndex];
                if (BLANK_LINE_RE.test(nestedLine)) {
                    continue;
                }

                if (HEADING_RE.test(nestedLine)) {
                    lineIndex -= 1;
                    break;
                }

                const nestedFieldMatch = NESTED_FIELD_RE.exec(nestedLine);
                if (!nestedFieldMatch) {
                    lineIndex -= 1;
                    break;
                }

                droppedFields[nestedFieldMatch[1].trim()] = nestedFieldMatch[2].trim();
            }

            current.nestedFields[DROPPED_FIELDS_KEY] = droppedFields;
            continue;
        }

        current.scalarFields[fieldKey] = fieldMatch[2].trim();
    }

    if (current) {
        records.push(current);
    }

    return records;
}

function toReportContact(record: ParsedMarkdownRecord): ReportContact {
    const knownKeys = new Set(REPORT_FIELD_ORDER);
    return {
        kind: "report",
        id: record.key,
        nickname: record.scalarFields.Nickname ?? "",
        fullName: record.scalarFields.FullName ?? "",
        title: record.scalarFields.Title ?? "",
        careerPathKey: record.scalarFields.CareerPathKey ?? "",
        levelId: record.scalarFields.LevelId ?? "",
        levelStartDate: record.scalarFields.LevelStartDate ?? "",
        pronounsKey: record.scalarFields.PronounsKey ?? "",
        extraFields: extractExtraFields(record.scalarFields, knownKeys),
        droppedFields: cloneFieldMap(record.nestedFields[DROPPED_FIELDS_KEY] ?? {}),
    };
}

function toColleagueContact(record: ParsedMarkdownRecord): ColleagueContact {
    const knownKeys = new Set(COLLEAGUE_FIELD_ORDER);
    return {
        kind: "colleague",
        id: record.key,
        nickname: record.scalarFields.Nickname ?? "",
        fullName: record.scalarFields.FullName ?? "",
        title: record.scalarFields.Title ?? "",
        careerPathKey: record.scalarFields.CareerPathKey ?? "",
        pronounsKey: record.scalarFields.PronounsKey ?? "",
        extraFields: extractExtraFields(record.scalarFields, knownKeys),
        droppedFields: cloneFieldMap(record.nestedFields[DROPPED_FIELDS_KEY] ?? {}),
    };
}

function serializeContact(contact: Contact): string {
    const lines = [`# ${contact.id}`];
    const orderedFields = contact.kind === "report" ? REPORT_FIELD_ORDER : COLLEAGUE_FIELD_ORDER;
    const values = contact.kind === "report"
        ? {
            Nickname: contact.nickname,
            FullName: contact.fullName,
            Title: contact.title,
            CareerPathKey: contact.careerPathKey,
            LevelId: contact.levelId,
            LevelStartDate: contact.levelStartDate,
            PronounsKey: contact.pronounsKey,
        }
        : {
            Nickname: contact.nickname,
            FullName: contact.fullName,
            Title: contact.title,
            CareerPathKey: contact.careerPathKey,
            PronounsKey: contact.pronounsKey,
        };

    for (const fieldName of orderedFields) {
        lines.push(`- ${fieldName}: ${values[fieldName]}`);
    }

    appendFieldMap(lines, contact.extraFields);
    appendNestedFieldMap(lines, DROPPED_FIELDS_KEY, contact.droppedFields);

    return lines.join("\n");
}

function serializeReferenceEntry(
    key: string,
    orderedFields: ReadonlyArray<readonly [string, string]>,
    extraFields: ContactFieldMap,
): string {
    const lines = [`# ${key}`];
    for (const [fieldName, value] of orderedFields) {
        lines.push(`- ${fieldName}: ${value}`);
    }

    appendFieldMap(lines, extraFields);
    return lines.join("\n");
}

function appendFieldMap(lines: string[], fields: ContactFieldMap): void {
    for (const [fieldName, value] of Object.entries(fields)) {
        lines.push(`- ${fieldName}: ${value}`);
    }
}

function appendNestedFieldMap(lines: string[], fieldName: string, fields: ContactFieldMap): void {
    const entries = Object.entries(fields);
    if (entries.length === 0) {
        return;
    }

    lines.push(`- ${fieldName}:`);
    for (const [nestedFieldName, value] of entries) {
        lines.push(`  - ${nestedFieldName}: ${value}`);
    }
}

function extractExtraFields(fields: ContactFieldMap, knownKeys: ReadonlySet<string>): ContactFieldMap {
    const extraFields: ContactFieldMap = {};
    for (const [fieldName, value] of Object.entries(fields)) {
        if (!knownKeys.has(fieldName)) {
            extraFields[fieldName] = value;
        }
    }

    return extraFields;
}

function parseNumberField(value: string | undefined): number {
    const parsedValue = Number.parseInt(value ?? "", 10);
    return Number.isNaN(parsedValue) ? 0 : parsedValue;
}

function cloneFieldMap(fields: ContactFieldMap): ContactFieldMap {
    return { ...fields };
}

function cloneContact<TContact extends Contact>(contact: TContact): TContact {
    if (contact.kind === "report") {
        const clone: ReportContact = {
            ...contact,
            extraFields: cloneFieldMap(contact.extraFields),
            droppedFields: cloneFieldMap(contact.droppedFields),
        };
        return clone as TContact;
    }

    const clone: ColleagueContact = {
        ...contact,
        extraFields: cloneFieldMap(contact.extraFields),
        droppedFields: cloneFieldMap(contact.droppedFields),
    };
    return clone as TContact;
}