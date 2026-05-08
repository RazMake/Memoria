import * as vscode from "vscode";
import type { ManifestManager } from "../../blueprints/manifestManager";
import type { ContactGroup as BlueprintContactGroup } from "../../blueprints/types";
import { normalizePath } from "../../utils/path";
import { DebouncedFileWatcher } from "../../utils/debouncedFileWatcher";
import {
    addContact as addContactToDocument,
    removeContactById,
    serializeCareerLevelsDocument,
} from "./contactParser";
import {
    CAREER_LEVELS_FILE,
    DATA_TYPES_FOLDER,
    loadGroups,
    loadReferenceData,
    type LoadedGroupState,
} from "./contactFileLoader";
import {
    assertUniqueContactId,
    findContactLocation,
    prepareContactForWrite,
    prepareMovedContact,
    requireContact,
    requireGroup,
    toCustomGroupFileName,
    writeGroupDocument,
} from "./contactMutations";
import { writeTextFile } from "../../utils/filesystem";
import {
    buildResolvedContact,
    buildResolvedReferenceData,
    buildShortTitleLookup,
    createEmptyReferenceData,
    joinRelativePath,
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
import type {
    Contact,
    ContactKind,
    ContactsReferenceData,
} from "./types";

export type {
    ResolvedCareerLevelReference,
    ResolvedContact,
    ResolvedContactsReferenceData,
} from "./contactUtils";

export const CONTACTS_INACTIVE_MESSAGE = "Memoria: Contacts is not enabled for this workspace.";

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
    private fileWatcher: DebouncedFileWatcher | null = null;
    private active = false;
    private readonly _onDidUpdate = new vscode.EventEmitter<ContactsSnapshot>();
    readonly onDidUpdate = this._onDidUpdate.event;
    private readonly _onDidRequestFormOpen = new vscode.EventEmitter<ContactsFormOpenRequest>();
    readonly onDidRequestFormOpen = this._onDidRequestFormOpen.event;

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
        this.fileWatcher?.dispose();
        this.fileWatcher = null;

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
        this._onDidUpdate.dispose();
        this._onDidRequestFormOpen.dispose();
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
        const location = findContactLocation(this.groups, contactId);
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
        await writeTextFile(this.fs, uri, "");
        await this.reloadFromDisk(true);

        const createdGroup = this.groups.find((group) => group.file.toLowerCase() === file.toLowerCase());
        if (!createdGroup) {
            throw new Error(`Contact group "${stripMarkdownExtension(file)}" was created but could not be loaded.`);
        }

        return toGroupSummary(createdGroup);
    }

    async addContact(groupFile: string, contact: Contact): Promise<ResolvedContact> {
        const { peopleRoot } = this.requireRuntimeContext();
        const group = requireGroup(this.groups, groupFile);
        const preparedContact = prepareContactForWrite(contact, group.type, this.referenceData);
        assertUniqueContactId(this.groups, preparedContact.id);

        const updatedDocument = addContactToDocument(group.document, preparedContact);
        await writeGroupDocument(this.fs, peopleRoot, group.file, updatedDocument);
        return this.persistAndVerify(preparedContact.id);
    }

    async editContact(contactId: string, groupFile: string, contact: Contact): Promise<ResolvedContact> {
        const { peopleRoot } = this.requireRuntimeContext();
        const source = requireContact(this.groups, contactId);
        if (source.group.file !== groupFile) {
            throw new Error("Editing a contact into a different group is not supported. Use moveContact() instead.");
        }

        const preparedContact = prepareContactForWrite(contact, source.group.type, this.referenceData);
        assertUniqueContactId(this.groups, preparedContact.id, {
            groupFile: source.group.file,
            contactId: source.contact.id,
        });

        let updatedDocument = removeContactById(source.group.document, source.contact.id);
        updatedDocument = addContactToDocument(updatedDocument, preparedContact);

        await writeGroupDocument(this.fs, peopleRoot, source.group.file, updatedDocument);
        return this.persistAndVerify(preparedContact.id);
    }

    async deleteContact(contactId: string): Promise<void> {
        const { peopleRoot } = this.requireRuntimeContext();
        const source = requireContact(this.groups, contactId);
        const updatedDocument = removeContactById(source.group.document, source.contact.id);
        await writeGroupDocument(this.fs, peopleRoot, source.group.file, updatedDocument);
        await this.reloadFromDisk(true);
    }

    async moveContact(contactId: string, targetGroupFile: string, targetContact?: Contact): Promise<ResolvedContact> {
        const { peopleRoot } = this.requireRuntimeContext();
        const source = requireContact(this.groups, contactId);
        const targetGroup = requireGroup(this.groups, targetGroupFile);

        if (source.group.file === targetGroup.file) {
            throw new Error("Source and target contact groups are the same.");
        }

        const movedContact = prepareMovedContact(source.contact, targetGroup.type, this.referenceData, targetContact);
        assertUniqueContactId(this.groups, movedContact.id, {
            groupFile: source.group.file,
            contactId: source.contact.id,
        });

        const updatedSourceDocument = removeContactById(source.group.document, source.contact.id);
        const updatedTargetDocument = addContactToDocument(targetGroup.document, movedContact);

        await writeGroupDocument(this.fs, peopleRoot, targetGroup.file, updatedTargetDocument);
        await writeGroupDocument(this.fs, peopleRoot, source.group.file, updatedSourceDocument);
        return this.persistAndVerify(movedContact.id);
    }

    private async persistAndVerify(contactId: string): Promise<ResolvedContact> {
        await this.reloadFromDisk(true);
        const contact = this.getContactById(contactId);
        if (!contact) {
            throw new Error(`Contact "${contactId}" was saved but could not be reloaded.`);
        }
        return contact;
    }

    // Uses a scoped FileSystemWatcher rather than workspace-level save events because contacts
    // are confined to a single folder tree (the blueprint's people folder).
    private installWatcher(): void {
        const { peopleRoot } = this.requireRuntimeContext();
        this.fileWatcher = new DebouncedFileWatcher(this.debounceMs, () => {
            if (this.active) {
                void this.reloadFromDisk(true);
            }
        });
        this.fileWatcher.watch(new vscode.RelativePattern(peopleRoot, "**/*.md"));
    }

    private async reloadFromDisk(showWarnings: boolean): Promise<void> {
        const { peopleRoot } = this.requireRuntimeContext();
        const [groups, loadedReferenceData] = await Promise.all([
            loadGroups(this.fs, peopleRoot, this.blueprintGroups),
            loadReferenceData(this.fs, peopleRoot),
        ]);

        const { referenceData, correctedGroups, warnings } =
            await this.enforceIntegrity(peopleRoot, groups, loadedReferenceData);

        this.referenceData = referenceData;
        this.groups = correctedGroups.map((entry) => entry.group);

        await this.updateContextKeys();
        this.emitUpdate();

        if (showWarnings) {
            for (const message of warnings) {
                vscode.window.showWarningMessage(message);
            }
        }
    }

    /** Runs integrity checks on career levels and contacts, auto-correcting invalid references. */
    private async enforceIntegrity(
        peopleRoot: vscode.Uri,
        groups: LoadedGroupState[],
        loadedReferenceData: ContactsReferenceData,
    ): Promise<{
        referenceData: ContactsReferenceData;
        correctedGroups: Array<{ group: LoadedGroupState; correctedContacts: number }>;
        warnings: string[];
    }> {
        const warnings: string[] = [];
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
            await writeTextFile(
                this.fs,
                vscode.Uri.joinPath(peopleRoot, DATA_TYPES_FOLDER, CAREER_LEVELS_FILE),
                serializeCareerLevelsDocument(correctedCareerLevels),
            );
            referenceData = {
                ...loadedReferenceData,
                careerLevels: correctedCareerLevels,
            };
            warnings.push(
                `Memoria: ${careerLevelCorrections.length} career level(s) in ${CAREER_LEVELS_FILE} referenced missing interview types and were updated to defaults.`
            );
        }

        const correctedGroups = await Promise.all(groups.map(async (group) => {
            const corrections = findContactIntegrityCorrections(group.document, referenceData);
            if (corrections.length === 0) {
                return { group, correctedContacts: 0 };
            }

            const correctedDocument = applyContactIntegrityCorrections(group.document, corrections);
            await writeGroupDocument(this.fs, peopleRoot, group.file, correctedDocument);

            const correctedContacts = new Set(corrections.map((correction) => correction.contactId)).size;
            warnings.push(
                `Memoria: ${correctedContacts} contact(s) in ${group.file} referenced missing data types and were updated to defaults.`
            );

            return {
                group: { ...group, document: correctedDocument },
                correctedContacts,
            };
        }));

        return { referenceData, correctedGroups, warnings };
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
        this._onDidUpdate.fire(this.getSnapshot());
    }

    private emitFormRequest(request: ContactsFormOpenRequest): void {
        this._onDidRequestFormOpen.fire({ ...request });
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
