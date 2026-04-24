import * as vscode from "vscode";
import type { ContactGroup as BlueprintContactGroup } from "../../blueprints/types";
import { normalizePath } from "../../utils/path";
import {
    parseCareerLevelsDocument,
    parseCareerPathsDocument,
    parseContactGroupDocument,
    parseInterviewTypesDocument,
    parsePronounsDocument,
} from "./contactParser";
import { compareText, fileName, joinRelativePath, stripMarkdownExtension } from "./contactUtils";
import type { ContactGroupDocument, ContactKind, ContactsReferenceData } from "./types";

export const DATA_TYPES_FOLDER = "DataTypes";
export const PRONOUNS_FILE = "Pronouns.md";
export const CAREER_LEVELS_FILE = "CareerLevels.md";
export const CAREER_PATHS_FILE = "CareerPaths.md";
export const INTERVIEW_TYPES_FILE = "InterviewTypes.md";

export interface LoadedGroupState {
    file: string;
    name: string;
    type: ContactKind;
    isCustom: boolean;
    uri: vscode.Uri;
    document: ContactGroupDocument;
}

const decoder = new TextDecoder();

export async function readTextFile(fs: typeof vscode.workspace.fs, uri: vscode.Uri): Promise<string> {
    try {
        const bytes = await fs.readFile(uri);
        return decoder.decode(bytes);
    } catch {
        return "";
    }
}

export async function readDirectorySafe(
    fs: typeof vscode.workspace.fs,
    uri: vscode.Uri,
): Promise<readonly [string, vscode.FileType][]> {
    try {
        return await fs.readDirectory(uri);
    } catch {
        return [];
    }
}

export async function loadGroups(
    fs: typeof vscode.workspace.fs,
    peopleRoot: vscode.Uri,
    blueprintGroups: readonly BlueprintContactGroup[],
): Promise<LoadedGroupState[]> {
    const blueprintFiles = new Set(blueprintGroups.map((group) => group.file.toLowerCase()));
    const entries = await readDirectorySafe(fs, peopleRoot);
    const customFiles = entries
        .filter(([name, type]) => type === vscode.FileType.File && name.toLowerCase().endsWith(".md"))
        .map(([name]) => normalizePath(name))
        .filter((name) => !blueprintFiles.has(name.toLowerCase()))
        .sort(compareText);

    const groupDefinitions = [
        ...blueprintGroups.map((group) => ({
            file: group.file,
            type: group.type,
            isCustom: false,
        })),
        ...customFiles.map((file) => ({
            file,
            type: "colleague" as const,
            isCustom: true,
        })),
    ];

    return Promise.all(groupDefinitions.map(async (definition) => {
        const uri = joinRelativePath(peopleRoot, definition.file);
        const text = await readTextFile(fs, uri);

        return {
            file: definition.file,
            name: stripMarkdownExtension(fileName(definition.file)),
            type: definition.type,
            isCustom: definition.isCustom,
            uri,
            document: parseContactGroupDocument(text, definition.type),
        };
    }));
}

export async function loadReferenceData(
    fs: typeof vscode.workspace.fs,
    peopleRoot: vscode.Uri,
): Promise<ContactsReferenceData> {
    const dataTypesRoot = vscode.Uri.joinPath(peopleRoot, DATA_TYPES_FOLDER);
    const [pronounsText, careerLevelsText, careerPathsText, interviewTypesText] = await Promise.all([
        readTextFile(fs, vscode.Uri.joinPath(dataTypesRoot, PRONOUNS_FILE)),
        readTextFile(fs, vscode.Uri.joinPath(dataTypesRoot, CAREER_LEVELS_FILE)),
        readTextFile(fs, vscode.Uri.joinPath(dataTypesRoot, CAREER_PATHS_FILE)),
        readTextFile(fs, vscode.Uri.joinPath(dataTypesRoot, INTERVIEW_TYPES_FILE)),
    ]);

    return {
        pronouns: parsePronounsDocument(pronounsText),
        careerLevels: parseCareerLevelsDocument(careerLevelsText),
        careerPaths: parseCareerPathsDocument(careerPathsText),
        interviewTypes: parseInterviewTypesDocument(interviewTypesText),
    };
}
