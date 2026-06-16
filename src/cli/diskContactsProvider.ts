/**
 * DiskContactsProvider — CLI implementation of ContactsProvider.
 * Reads contact files from disk using the pure parsers and contactResolution.
 * No vscode imports.
 */

import * as fs from "fs";
import * as path from "path";
import type { ContactsProvider, MeProfile, ResolvedContact } from "../features/snippets/contactsProvider";
import { parseContactGroupDocument, parseMeProfileDocument } from "../features/contacts/contactParser";
import {
    parsePronounsDocument,
    parseCareerLevelsDocument,
    parseCareerPathsDocument,
    parseInterviewTypesDocument,
} from "../features/contacts/contactParser";
import {
    buildResolvedContact,
    buildShortTitleLookup,
    type ContactGroupInfo,
} from "../features/contacts/contactResolution";
import type { ContactKind, ContactsReferenceData, CareerLevelReference } from "../features/contacts/types";

interface GroupConfig {
    file: string;
    type: ContactKind;
}

export class DiskContactsProvider implements ContactsProvider {
    private groupContacts: Map<string, ResolvedContact[]> = new Map();
    private meProfile: MeProfile | null = null;
    private available = false;
    private groupNames: string[] = [];
    private referenceData: ContactsReferenceData | null = null;

    constructor(
        private readonly workspaceRoot: string,
        private readonly peopleFolder: string,
        private readonly groups: GroupConfig[],
    ) {}

    async load(): Promise<void> {
        try {
            const referenceData = this.loadReferenceData();
            this.referenceData = referenceData;
            const shortTitleLookup = buildShortTitleLookup(referenceData);

            for (const group of this.groups) {
                const filePath = path.join(this.workspaceRoot, this.peopleFolder, group.file);
                if (!fs.existsSync(filePath)) continue;

                const text = fs.readFileSync(filePath, "utf-8");
                const doc = parseContactGroupDocument(text, group.type);
                const groupName = group.file.replace(/\.md$/i, "");

                const groupInfo: ContactGroupInfo = {
                    file: group.file,
                    name: groupName,
                    type: group.type,
                    isCustom: false,
                };

                const resolved = doc.contacts.map((c) =>
                    buildResolvedContact(c, groupInfo, referenceData, shortTitleLookup)
                );
                this.groupContacts.set(groupName, resolved);
                this.groupNames.push(groupName);
            }

            // Load Me.md
            const mePath = path.join(this.workspaceRoot, this.peopleFolder, "Me.md");
            if (fs.existsSync(mePath)) {
                const text = fs.readFileSync(mePath, "utf-8");
                this.meProfile = parseMeProfileDocument(text);
            }

            this.available = true;
        } catch {
            this.available = false;
        }
    }

    isAvailable(): boolean {
        return this.available;
    }

    listGroups(): string[] {
        return this.groupNames;
    }

    getGroupContacts(groupName: string): ResolvedContact[] {
        return this.groupContacts.get(groupName) ?? [];
    }

    getMe(): MeProfile | null {
        return this.meProfile;
    }

    getCareerLevel(levelId: string): CareerLevelReference | null {
        return this.referenceData.careerLevels.find((cl) => cl.key === levelId) ?? null;
    }

    getCareerLevelByNumericId(id: number): CareerLevelReference | null {
        return this.referenceData.careerLevels.find((cl) => cl.id === id) ?? null;
    }

    private loadReferenceData(): ContactsReferenceData {
        const dataTypesPath = path.join(this.workspaceRoot, this.peopleFolder, "DataTypes");

        const tryParse = <T>(fileName: string, parser: (text: string) => T[]): T[] => {
            const filePath = path.join(dataTypesPath, fileName);
            if (!fs.existsSync(filePath)) return [];
            try {
                return parser(fs.readFileSync(filePath, "utf-8"));
            } catch {
                return [];
            }
        };

        return {
            pronouns: tryParse("Pronouns.md", parsePronounsDocument),
            careerLevels: tryParse("CareerLevels.md", parseCareerLevelsDocument),
            careerPaths: tryParse("CareerPaths.md", parseCareerPathsDocument),
            interviewTypes: tryParse("InterviewTypes.md", parseInterviewTypesDocument),
        };
    }

    static fromBlueprintManifest(workspaceRoot: string): DiskContactsProvider | null {
        const manifestPath = path.join(workspaceRoot, ".memoria", "blueprint.json");
        if (!fs.existsSync(manifestPath)) return null;

        try {
            const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
            const contacts = manifest?.contacts;
            if (!contacts?.peopleFolder) return null;

            return new DiskContactsProvider(
                workspaceRoot,
                contacts.peopleFolder,
                contacts.groups ?? [],
            );
        } catch {
            return null;
        }
    }
}
