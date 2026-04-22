import * as vscode from "vscode";
import type { ManifestManager } from "../../blueprints/manifestManager";
import type { ContactGroup as BlueprintContactGroup } from "../../blueprints/types";
import { normalizePath } from "../../utils/path";
import {
    addContact as addContactToDocument,
    parseCareerLevelsDocument,
    parseCareerPathsDocument,
    parseContactGroupDocument,
    parseInterviewTypesDocument,
    parsePronounsDocument,
    removeContactById,
    serializeCareerLevelsDocument,
    serializeContactGroupDocument,
} from "./contactParser";
import {
    buildAutoMovedContact,
    buildResolvedContact,
    buildResolvedReferenceData,
    buildShortTitleLookup,
    compareText,
    createEmptyReferenceData,
    disposeAll,
    fileName,
    joinRelativePath,
    mergeMovedContact,
    splitRelativePath,
    stripMarkdownExtension,
    type ResolvedContact,
    type ResolvedContactsReferenceData,
} from "./contactUtils";
import {
    applyCareerLevelIntegrityCorrections,
    applyContactIntegrityCorrections,
    findCareerLevelIntegrityCorrections,
    findContactIntegrityCorrections,
} from "./integrityCheck";
import { generateTitle } from "./titleGenerator";
import type {
    CareerLevelReference,
    CareerPathReference,
    Contact,
    ContactGroupDocument,
    ContactKind,
    ContactsReferenceData,
    PronounsReference,
} from "./types";

export type {
    ResolvedCareerLevelReference,
    ResolvedContact,
    ResolvedContactsReferenceData,
} from "./contactUtils";

const decoder = new TextDecoder();
const encoder = new TextEncoder();

const DATA_TYPES_FOLDER = "DataTypes";
const PRONOUNS_FILE = "Pronouns.md";
const CAREER_LEVELS_FILE = "CareerLevels.md";
const CAREER_PATHS_FILE = "CareerPaths.md";
const INTERVIEW_TYPES_FILE = "InterviewTypes.md";
// Characters forbidden in group names — these are invalid in file names on Windows/macOS/Linux,
// and group names map directly to markdown file names on disk.
const INVALID_GROUP_NAME_RE = /[\\/:*?"<>|]/;

export const CONTACTS_INACTIVE_MESSAGE = "Memoria: Contacts is not enabled for this workspace.";

interface LoadedGroupState {
    file: string;
    name: string;
    type: ContactKind;
    isCustom: boolean;
    uri: vscode.Uri;
    document: ContactGroupDocument;
}

interface ContactLocation {
    group: LoadedGroupState;
    contact: Contact;
}

type UpdateListener = (snapshot: ContactsSnapshot) => void;
type FormRequestListener = (request: ContactsFormOpenRequest) => void;

export interface ContactGroupSummary {
    file: string;
    name: string;
    type: ContactKind;
    isCustom: boolean;
    contactCount: number;
}

export interface ContactsSnapshot {
    active: boolean;
    multiGroup: boolean;
    groups: ContactGroupSummary[];
    contacts: ResolvedContact[];
    referenceData: ResolvedContactsReferenceData;
}

export interface ContactsFormOpenRequest {
    mode: "add" | "edit" | "move";
    contactId?: string;
    targetGroupFile?: string;
    preferredGroupFile?: string;
}

export class ContactsFeature implements vscode.Disposable {
    private workspaceRoot: vscode.Uri | null = null;
    private peopleFolder: string | null = null;
    private blueprintGroups: BlueprintContactGroup[] = [];
    private groups: LoadedGroupState[] = [];
    private referenceData: ContactsReferenceData = createEmptyReferenceData();
    private watcher: vscode.FileSystemWatcher | null = null;
    private watcherSubscriptions: vscode.Disposable[] = [];
    private reloadTimer: ReturnType<typeof setTimeout> | null = null;
    private active = false;
    private readonly updateListeners = new Set<UpdateListener>();
    private readonly formRequestListeners = new Set<FormRequestListener>();

    constructor(
        private readonly manifest: ManifestManager,
        private readonly debounceMs: number = 500,
        private readonly fs: typeof vscode.workspace.fs = vscode.workspace.fs,
    ) {}

    async refresh(workspaceRoot: vscode.Uri | null, enabled: boolean): Promise<void> {
        if (!workspaceRoot || !enabled) {
            await this.stop();
            return;
        }

        await this.start(workspaceRoot);
    }

    async start(workspaceRoot: vscode.Uri): Promise<void> {
        await this.stop();

        const manifest = await this.manifest.readManifest(workspaceRoot);
        const contactsConfig = manifest?.contacts;
        if (!contactsConfig) {
            return;
        }

        this.workspaceRoot = workspaceRoot;
        this.peopleFolder = normalizePath(contactsConfig.peopleFolder);
        this.blueprintGroups = contactsConfig.groups.map((group) => ({
            file: normalizePath(group.file),
            type: group.type,
        }));
        this.active = true;

        try {
            await this.reloadFromDisk(true);
            this.installWatcher();
        } catch (error) {
            await this.stop();
            throw error;
        }
    }

    async stop(): Promise<void> {
        this.clearReloadTimer();
        disposeAll(this.watcherSubscriptions);
        this.watcherSubscriptions = [];
        this.watcher?.dispose();
        this.watcher = null;

        const hadState = this.active || this.groups.length > 0 || this.referenceData.pronouns.length > 0;

        this.active = false;
        this.workspaceRoot = null;
        this.peopleFolder = null;
        this.blueprintGroups = [];
        this.groups = [];
        this.referenceData = createEmptyReferenceData();

        await this.updateContextKeys();

        if (hadState) {
            this.emitUpdate();
        }
    }

    dispose(): void {
        void this.stop();
        this.updateListeners.clear();
        this.formRequestListeners.clear();
    }

    isActive(): boolean {
        return this.active;
    }

    hasMultipleGroups(): boolean {
        return this.groups.length > 1;
    }

    getAllContacts(): ResolvedContact[] {
        const shortTitleLookup = buildShortTitleLookup(this.referenceData);
        return this.groups.flatMap((group) =>
            group.document.contacts.map((contact) => buildResolvedContact(contact, group, this.referenceData, shortTitleLookup))
        );
    }

    getGroupSummaries(): ContactGroupSummary[] {
        return this.groups.map(toGroupSummary);
    }

    getContactById(contactId: string): ResolvedContact | null {
        const location = this.findContactLocation(contactId);
        if (!location) {
            return null;
        }

        return buildResolvedContact(
            location.contact,
            location.group,
            this.referenceData,
            buildShortTitleLookup(this.referenceData)
        );
    }

    getResolvedReferenceData(): ResolvedContactsReferenceData {
        return buildResolvedReferenceData(this.referenceData);
    }

    getSnapshot(): ContactsSnapshot {
        return {
            active: this.active,
            multiGroup: this.hasMultipleGroups(),
            groups: this.getGroupSummaries(),
            contacts: this.getAllContacts(),
            referenceData: this.getResolvedReferenceData(),
        };
    }

    onDidUpdate(listener: UpdateListener): vscode.Disposable {
        this.updateListeners.add(listener);
        return { dispose: () => this.updateListeners.delete(listener) };
    }

    onDidRequestFormOpen(listener: FormRequestListener): vscode.Disposable {
        this.formRequestListeners.add(listener);
        return { dispose: () => this.formRequestListeners.delete(listener) };
    }

    requestAddContactForm(preferredGroupFile?: string): void {
        this.emitFormRequest({
            mode: "add",
            preferredGroupFile,
        });
    }

    requestEditContactForm(contactId: string): void {
        this.emitFormRequest({
            mode: "edit",
            contactId,
        });
    }

    requestMoveContactForm(contactId: string, targetGroupFile: string): void {
        this.emitFormRequest({
            mode: "move",
            contactId,
            targetGroupFile,
        });
    }

    async createCustomGroup(name: string): Promise<ContactGroupSummary> {
        const { peopleRoot } = this.requireRuntimeContext();
        const file = toCustomGroupFileName(name);

        if (this.groups.some((group) => group.file.toLowerCase() === file.toLowerCase())) {
            throw new Error(`A contact group named "${stripMarkdownExtension(file)}" already exists.`);
        }

        await this.fs.createDirectory(peopleRoot);
        const uri = joinRelativePath(peopleRoot, file);
        await this.writeTextFile(uri, "");
        await this.reloadFromDisk(true);

        const createdGroup = this.groups.find((group) => group.file.toLowerCase() === file.toLowerCase());
        if (!createdGroup) {
            throw new Error(`Contact group "${stripMarkdownExtension(file)}" was created but could not be loaded.`);
        }

        return toGroupSummary(createdGroup);
    }

    async addContact(groupFile: string, contact: Contact): Promise<ResolvedContact> {
        const group = this.requireGroup(groupFile);
        const preparedContact = this.prepareContactForWrite(contact, group.type);
        this.assertUniqueContactId(preparedContact.id);

        const updatedDocument = addContactToDocument(group.document, preparedContact);
        await this.writeGroupDocument(group.file, updatedDocument);
        await this.reloadFromDisk(true);

        const added = this.getContactById(preparedContact.id);
        if (!added) {
            throw new Error(`Contact "${preparedContact.id}" was saved but could not be reloaded.`);
        }

        return added;
    }

    async editContact(contactId: string, groupFile: string, contact: Contact): Promise<ResolvedContact> {
        const source = this.requireContact(contactId);
        if (source.group.file !== groupFile) {
            throw new Error("Editing a contact into a different group is not supported. Use moveContact() instead.");
        }

        const preparedContact = this.prepareContactForWrite(contact, source.group.type);
        this.assertUniqueContactId(preparedContact.id, {
            groupFile: source.group.file,
            contactId: source.contact.id,
        });

        let updatedDocument = removeContactById(source.group.document, source.contact.id);
        updatedDocument = addContactToDocument(updatedDocument, preparedContact);

        await this.writeGroupDocument(source.group.file, updatedDocument);
        await this.reloadFromDisk(true);

        const updated = this.getContactById(preparedContact.id);
        if (!updated) {
            throw new Error(`Contact "${preparedContact.id}" was saved but could not be reloaded.`);
        }

        return updated;
    }

    async deleteContact(contactId: string): Promise<void> {
        const source = this.requireContact(contactId);
        const updatedDocument = removeContactById(source.group.document, source.contact.id);
        await this.writeGroupDocument(source.group.file, updatedDocument);
        await this.reloadFromDisk(true);
    }

    async moveContact(contactId: string, targetGroupFile: string, targetContact?: Contact): Promise<ResolvedContact> {
        const source = this.requireContact(contactId);
        const targetGroup = this.requireGroup(targetGroupFile);

        if (source.group.file === targetGroup.file) {
            throw new Error("Source and target contact groups are the same.");
        }

        const movedContact = this.prepareMovedContact(source.contact, targetGroup.type, targetContact);
        this.assertUniqueContactId(movedContact.id, {
            groupFile: source.group.file,
            contactId: source.contact.id,
        });

        const updatedSourceDocument = removeContactById(source.group.document, source.contact.id);
        const updatedTargetDocument = addContactToDocument(targetGroup.document, movedContact);

        await this.writeGroupDocument(targetGroup.file, updatedTargetDocument);
        await this.writeGroupDocument(source.group.file, updatedSourceDocument);
        await this.reloadFromDisk(true);

        const updated = this.getContactById(movedContact.id);
        if (!updated) {
            throw new Error(`Contact "${movedContact.id}" was moved but could not be reloaded.`);
        }

        return updated;
    }

    private installWatcher(): void {
        const { peopleRoot } = this.requireRuntimeContext();
        const pattern = new vscode.RelativePattern(peopleRoot, "**/*.md");
        this.watcher = vscode.workspace.createFileSystemWatcher(pattern);
        this.watcherSubscriptions = [
            this.watcher.onDidChange((uri) => this.scheduleReload(uri)),
            this.watcher.onDidCreate((uri) => this.scheduleReload(uri)),
            this.watcher.onDidDelete((uri) => this.scheduleReload(uri)),
        ];
    }

    private scheduleReload(_uri: vscode.Uri): void {
        if (!this.active) {
            return;
        }

        this.clearReloadTimer();
        this.reloadTimer = setTimeout(() => {
            this.reloadTimer = null;
            void this.reloadFromDisk(true);
        }, this.debounceMs);
    }

    private clearReloadTimer(): void {
        if (!this.reloadTimer) {
            return;
        }

        clearTimeout(this.reloadTimer);
        this.reloadTimer = null;
    }

    private async reloadFromDisk(showWarnings: boolean): Promise<void> {
        const { peopleRoot } = this.requireRuntimeContext();
        const [groups, loadedReferenceData] = await Promise.all([
            this.loadGroups(peopleRoot),
            this.loadReferenceData(peopleRoot),
        ]);

        let referenceData = loadedReferenceData;
        const careerLevelCorrections = findCareerLevelIntegrityCorrections(
            loadedReferenceData.careerLevels,
            loadedReferenceData.interviewTypes,
        );
        if (careerLevelCorrections.length > 0) {
            const correctedCareerLevels = applyCareerLevelIntegrityCorrections(
                loadedReferenceData.careerLevels,
                careerLevelCorrections,
            );
            await this.writeTextFile(
                vscode.Uri.joinPath(peopleRoot, DATA_TYPES_FOLDER, CAREER_LEVELS_FILE),
                serializeCareerLevelsDocument(correctedCareerLevels),
            );
            referenceData = {
                ...loadedReferenceData,
                careerLevels: correctedCareerLevels,
            };
        }

        const correctedGroups = await Promise.all(groups.map(async (group) => {
            const corrections = findContactIntegrityCorrections(group.document, referenceData);
            if (corrections.length === 0) {
                return { group, correctedContacts: 0 };
            }

            const correctedDocument = applyContactIntegrityCorrections(group.document, corrections);
            await this.writeGroupDocument(group.file, correctedDocument);

            return {
                group: {
                    ...group,
                    document: correctedDocument,
                },
                correctedContacts: new Set(corrections.map((correction) => correction.contactId)).size,
            };
        }));

        this.referenceData = referenceData;
        this.groups = correctedGroups.map((entry) => entry.group);

        await this.updateContextKeys();
        this.emitUpdate();

        if (showWarnings) {
            if (careerLevelCorrections.length > 0) {
                vscode.window.showWarningMessage(
                    `Memoria: ${careerLevelCorrections.length} career level(s) in ${CAREER_LEVELS_FILE} referenced missing interview types and were updated to defaults.`
                );
            }

            for (const entry of correctedGroups) {
                if (entry.correctedContacts === 0) {
                    continue;
                }

                vscode.window.showWarningMessage(
                    `Memoria: ${entry.correctedContacts} contact(s) in ${entry.group.file} referenced missing data types and were updated to defaults.`
                );
            }
        }
    }

    private async loadGroups(peopleRoot: vscode.Uri): Promise<LoadedGroupState[]> {
        const blueprintFiles = new Set(this.blueprintGroups.map((group) => group.file.toLowerCase()));
        const entries = await this.readDirectorySafe(peopleRoot);
        const customFiles = entries
            .filter(([name, type]) => type === vscode.FileType.File && name.toLowerCase().endsWith(".md"))
            .map(([name]) => normalizePath(name))
            .filter((name) => !blueprintFiles.has(name.toLowerCase()))
            .sort(compareText);

        const groupDefinitions = [
            ...this.blueprintGroups.map((group) => ({
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
            const text = await this.readTextFile(uri);

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

    private async loadReferenceData(peopleRoot: vscode.Uri): Promise<ContactsReferenceData> {
        const dataTypesRoot = vscode.Uri.joinPath(peopleRoot, DATA_TYPES_FOLDER);
        const [pronounsText, careerLevelsText, careerPathsText, interviewTypesText] = await Promise.all([
            this.readTextFile(vscode.Uri.joinPath(dataTypesRoot, PRONOUNS_FILE)),
            this.readTextFile(vscode.Uri.joinPath(dataTypesRoot, CAREER_LEVELS_FILE)),
            this.readTextFile(vscode.Uri.joinPath(dataTypesRoot, CAREER_PATHS_FILE)),
            this.readTextFile(vscode.Uri.joinPath(dataTypesRoot, INTERVIEW_TYPES_FILE)),
        ]);

        return {
            pronouns: parsePronounsDocument(pronounsText),
            careerLevels: parseCareerLevelsDocument(careerLevelsText),
            careerPaths: parseCareerPathsDocument(careerPathsText),
            interviewTypes: parseInterviewTypesDocument(interviewTypesText),
        };
    }

    private prepareContactForWrite(contact: Contact, expectedKind: ContactKind): Contact {
        if (contact.kind !== expectedKind) {
            throw new Error(`Expected a ${expectedKind} contact for this group.`);
        }

        const normalizedContact = structuredClone(contact);
        if (!normalizedContact.id.trim()) {
            throw new Error("Contact id is required.");
        }
        if (!normalizedContact.nickname.trim()) {
            throw new Error("Nickname is required.");
        }
        if (!normalizedContact.fullName.trim()) {
            throw new Error("Full name is required.");
        }
        if (!normalizedContact.careerPathKey.trim()) {
            throw new Error("Career path is required.");
        }
        if (!normalizedContact.pronounsKey.trim()) {
            throw new Error("Pronouns are required.");
        }

        const careerPath = this.requireCareerPath(normalizedContact.careerPathKey);
        this.requirePronouns(normalizedContact.pronounsKey);

        if (normalizedContact.kind === "report") {
            if (!normalizedContact.levelId.trim()) {
                throw new Error("LevelId is required for report contacts.");
            }
            if (!normalizedContact.levelStartDate.trim()) {
                throw new Error("LevelStartDate is required for report contacts.");
            }

            const careerLevel = this.requireCareerLevel(normalizedContact.levelId);
            if (careerLevel.id < careerPath.minimumCareerLevel) {
                throw new Error(`Career level "${careerLevel.key}" is below the minimum allowed for "${careerPath.name}".`);
            }

            if (!normalizedContact.title.trim()) {
                normalizedContact.title = generateTitle(careerPath, careerLevel).normal;
            }
        } else if (!normalizedContact.title.trim()) {
            throw new Error("Title is required for colleague contacts.");
        }

        return normalizedContact;
    }

    private prepareMovedContact(sourceContact: Contact, targetKind: ContactKind, targetContact?: Contact): Contact {
        const autoMovedContact = buildAutoMovedContact(sourceContact, targetKind, this.referenceData);
        const mergedContact = targetContact
            ? mergeMovedContact(autoMovedContact, targetContact)
            : autoMovedContact;

        return this.prepareContactForWrite(mergedContact, targetKind);
    }

    private assertUniqueContactId(candidateId: string, exclude?: { groupFile: string; contactId: string }): void {
        for (const group of this.groups) {
            for (const contact of group.document.contacts) {
                if (exclude && group.file === exclude.groupFile && contact.id === exclude.contactId) {
                    continue;
                }

                if (contact.id === candidateId) {
                    throw new Error(`A contact with id "${candidateId}" already exists.`);
                }
            }
        }
    }

    private requireContact(contactId: string): ContactLocation {
        const location = this.findContactLocation(contactId);
        if (!location) {
            throw new Error(`Contact "${contactId}" was not found.`);
        }

        return location;
    }

    private requireGroup(groupFile: string): LoadedGroupState {
        const group = this.groups.find((entry) => entry.file === groupFile);
        if (!group) {
            throw new Error(`Contact group "${groupFile}" was not found.`);
        }

        return group;
    }

    private findContactLocation(contactId: string): ContactLocation | null {
        for (const group of this.groups) {
            const contact = group.document.contacts.find((candidate) => candidate.id === contactId);
            if (contact) {
                return { group, contact };
            }
        }

        return null;
    }

    private requirePronouns(pronounsKey: string): PronounsReference {
        const match = this.referenceData.pronouns.find((entry) => entry.key === pronounsKey);
        if (!match) {
            throw new Error(`Pronouns "${pronounsKey}" do not exist.`);
        }

        return match;
    }

    private requireCareerPath(careerPathKey: string): CareerPathReference {
        const match = this.referenceData.careerPaths.find((entry) => entry.key === careerPathKey);
        if (!match) {
            throw new Error(`Career path "${careerPathKey}" does not exist.`);
        }

        return match;
    }

    private requireCareerLevel(levelId: string): CareerLevelReference {
        const match = this.referenceData.careerLevels.find((entry) => entry.key === levelId);
        if (!match) {
            throw new Error(`Career level "${levelId}" does not exist.`);
        }

        return match;
    }

    private requireRuntimeContext(): { workspaceRoot: vscode.Uri; peopleRoot: vscode.Uri } {
        if (!this.active || !this.workspaceRoot || !this.peopleFolder) {
            throw new Error(CONTACTS_INACTIVE_MESSAGE);
        }

        return {
            workspaceRoot: this.workspaceRoot,
            peopleRoot: joinRelativePath(this.workspaceRoot, this.peopleFolder),
        };
    }

    private async updateContextKeys(): Promise<void> {
        await vscode.commands.executeCommand("setContext", "memoria.contactsActive", this.active);
        await vscode.commands.executeCommand(
            "setContext",
            "memoria.contactsMultiGroup",
            this.active && this.groups.length > 1
        );
    }

    private emitUpdate(): void {
        const snapshot = this.getSnapshot();
        for (const listener of this.updateListeners) {
            try {
                listener(snapshot);
            } catch {
                // Listener errors must not break the feature runtime.
            }
        }
    }

    private emitFormRequest(request: ContactsFormOpenRequest): void {
        for (const listener of this.formRequestListeners) {
            try {
                listener({ ...request });
            } catch {
                // Listener errors must not break the feature runtime.
            }
        }
    }

    private async readTextFile(uri: vscode.Uri): Promise<string> {
        try {
            const bytes = await this.fs.readFile(uri);
            return decoder.decode(bytes);
        } catch {
            return "";
        }
    }

    private async writeGroupDocument(groupFile: string, document: ContactGroupDocument): Promise<void> {
        const { peopleRoot } = this.requireRuntimeContext();
        const segments = splitRelativePath(groupFile);
        if (segments.length > 1) {
            await this.fs.createDirectory(vscode.Uri.joinPath(peopleRoot, ...segments.slice(0, -1)));
        }

        await this.writeTextFile(vscode.Uri.joinPath(peopleRoot, ...segments), serializeContactGroupDocument(document));
    }

    private async writeTextFile(uri: vscode.Uri, text: string): Promise<void> {
        await this.fs.writeFile(uri, encoder.encode(text));
    }

    private async readDirectorySafe(uri: vscode.Uri): Promise<readonly [string, vscode.FileType][]> {
        try {
            return await this.fs.readDirectory(uri);
        } catch {
            return [];
        }
    }
}

function toGroupSummary(group: LoadedGroupState): ContactGroupSummary {
    return {
        file: group.file,
        name: group.name,
        type: group.type,
        isCustom: group.isCustom,
        contactCount: group.document.contacts.length,
    };
}

function toCustomGroupFileName(name: string): string {
    const trimmedName = name.trim();
    const baseName = trimmedName.toLowerCase().endsWith(".md")
        ? trimmedName.slice(0, -3).trim()
        : trimmedName;

    if (!baseName) {
        throw new Error("Group name is required.");
    }
    if (baseName === "." || baseName === "..") {
        throw new Error("Group name is invalid.");
    }
    if (INVALID_GROUP_NAME_RE.test(baseName)) {
        throw new Error("Group name contains invalid filename characters.");
    }

    return `${baseName}.md`;
}
