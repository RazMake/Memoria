import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

interface MockUri {
    path: string;
    toString(): string;
}

interface MockWatcher {
    pattern: unknown;
    dispose: ReturnType<typeof vi.fn>;
    onDidChange(listener: (uri: MockUri) => void): { dispose(): void };
    onDidCreate(listener: (uri: MockUri) => void): { dispose(): void };
    onDidDelete(listener: (uri: MockUri) => void): { dispose(): void };
    fireChange(uri: MockUri): void;
    fireCreate(uri: MockUri): void;
    fireDelete(uri: MockUri): void;
}

const fileContents = new Map<string, string>();
const directories = new Set<string>();
const createdWatchers: MockWatcher[] = [];

const mockExecuteCommand = vi.fn(async () => undefined);
const mockShowWarningMessage = vi.fn();
const mockShowInformationMessage = vi.fn();
const mockShowErrorMessage = vi.fn();

const mockReadFile = vi.fn(async (uri: MockUri) => {
    const text = fileContents.get(normalizeTestPath(uri.path));
    if (text === undefined) {
        throw new Error("not found");
    }

    return encoder.encode(text);
});

const mockWriteFile = vi.fn(async (uri: MockUri, bytes: Uint8Array) => {
    const path = normalizeTestPath(uri.path);
    ensureParentDirectories(path);
    fileContents.set(path, decoder.decode(bytes));
});

const mockReadDirectory = vi.fn(async (uri: MockUri) => listDirectoryEntries(normalizeTestPath(uri.path)));
const mockCreateDirectory = vi.fn(async (uri: MockUri) => {
    ensureDirectory(normalizeTestPath(uri.path));
});
const mockStat = vi.fn(async (uri: MockUri) => {
    const path = normalizeTestPath(uri.path);
    if (fileContents.has(path)) {
        return { type: 1 };
    }
    if (directories.has(path)) {
        return { type: 2 };
    }
    throw new Error("not found");
});
const mockCreateFileSystemWatcher = vi.fn((pattern: unknown) => createWatcher(pattern));

const renameListeners: Array<(event: { files: ReadonlyArray<{ oldUri: MockUri; newUri: MockUri }> }) => void> = [];
function fireRename(files: ReadonlyArray<{ oldUri: MockUri; newUri: MockUri }>): void {
    for (const listener of [...renameListeners]) {
        listener({ files });
    }
}

vi.mock("vscode", () => {
    class RelativePattern {
        constructor(
            public readonly base: unknown,
            public readonly pattern: string,
        ) {}
    }

    class Disposable {
        constructor(private readonly callback?: () => void) {}

        dispose(): void {
            this.callback?.();
        }
    }

    class EventEmitter {
        private listeners: Array<(...args: unknown[]) => void> = [];
        event = (listener: (...args: unknown[]) => void) => {
            this.listeners.push(listener);
            return { dispose: () => { this.listeners = this.listeners.filter((l) => l !== listener); } };
        };
        fire(...args: unknown[]) {
            for (const l of this.listeners) l(...args);
        }
        dispose() {
            this.listeners = [];
        }
    }

    return {
        EventEmitter,
        FileType: {
            File: 1,
            Directory: 2,
        },
        workspace: {
            fs: {
                readFile: (...args: [MockUri]) => mockReadFile(...args),
                writeFile: (...args: [MockUri, Uint8Array]) => mockWriteFile(...args),
                readDirectory: (...args: [MockUri]) => mockReadDirectory(...args),
                createDirectory: (...args: [MockUri]) => mockCreateDirectory(...args),
                stat: (...args: [MockUri]) => mockStat(...args),
            },
            createFileSystemWatcher: (...args: [unknown]) => mockCreateFileSystemWatcher(...args),
            onDidRenameFiles: (listener: (event: { files: ReadonlyArray<{ oldUri: MockUri; newUri: MockUri }> }) => void) => {
                renameListeners.push(listener);
                return { dispose: () => { const i = renameListeners.indexOf(listener); if (i >= 0) renameListeners.splice(i, 1); } };
            },
        },
        commands: {
            executeCommand: (...args: [string, string, boolean]) => mockExecuteCommand(...args),
        },
        window: {
            showWarningMessage: (...args: [string]) => mockShowWarningMessage(...args),
            showInformationMessage: (...args: [string]) => mockShowInformationMessage(...args),
            showErrorMessage: (...args: [string]) => mockShowErrorMessage(...args),
        },
        Uri: {
            joinPath: (base: MockUri, ...segments: string[]) => createUri(joinPaths(base.path, ...segments)),
        },
        RelativePattern,
        Disposable,
    };
});

import { ContactsFeature } from "../../../../src/features/contacts/contactsFeature";
import type { Contact } from "../../../../src/features/contacts/types";

const workspaceRoot = createUri("/workspace");

describe("ContactsFeature", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.useRealTimers();
        fileContents.clear();
        directories.clear();
        createdWatchers.length = 0;
        renameListeners.length = 0;
        ensureDirectory("/");
        ensureDirectory("/workspace");
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("should load contacts from the manifest, discover custom groups, and update context keys", async () => {
        seedReferenceData("/workspace/05-Contacts");
        setFile("/workspace/05-Contacts/Colleagues.md", colleagueDocument([
            makeColleagueContact("alias1", "Alice Anderson", "Senior Software Engineer"),
        ]));
        setFile("/workspace/05-Contacts/Partners.md", colleagueDocument([
            makeColleagueContact("alias2", "Bob Baker", "Principal Program Manager", "pm", "he/him"),
        ]));

        const feature = new ContactsFeature(createManifest("05-Contacts/", [
            { file: "Colleagues.md", type: "colleague" },
        ]));

        await feature.start(workspaceRoot as any);

        expect(feature.isActive()).toBe(true);
        expect(feature.hasMultipleGroups()).toBe(true);
        expect(feature.getGroupSummaries()).toEqual([
            { file: "Colleagues.md", name: "Colleagues", type: "colleague", isCustom: false, contactCount: 1 },
            { file: "Partners.md", name: "Partners", type: "colleague", isCustom: true, contactCount: 1 },
        ]);
        expect(feature.getContactById("alias1")?.shortTitle).toBe("Senior SDE");
        expect(mockExecuteCommand).toHaveBeenCalledWith("setContext", "memoria.contactsActive", true);
        expect(mockExecuteCommand).toHaveBeenCalledWith("setContext", "memoria.contactsMultiGroup", true);
    });

    it("should rewrite contacts with missing references to unknown defaults during load", async () => {
        seedReferenceData("/workspace/05-Contacts");
        setFile("/workspace/05-Contacts/Colleagues.md", colleagueDocument([
            makeColleagueContact("alias1", "Alice Anderson", "Senior Software Engineer", "sde", "xe/xem"),
        ]));

        const feature = new ContactsFeature(createManifest("05-Contacts/", [
            { file: "Colleagues.md", type: "colleague" },
        ]));

        await feature.start(workspaceRoot as any);

        expect(fileContents.get("/workspace/05-Contacts/Colleagues.md")).toContain("PronounsKey: unknown");
        expect(feature.getContactById("alias1")?.pronounsKey).toBe("unknown");
        expect(mockShowWarningMessage).toHaveBeenCalledWith(expect.stringContaining("Colleagues.md"));
    });

    it("should add, edit, delete contacts and create custom groups", async () => {
        seedReferenceData("/workspace/05-Contacts");
        setFile("/workspace/05-Contacts/Colleagues.md", "");

        const feature = new ContactsFeature(createManifest("05-Contacts/", [
            { file: "Colleagues.md", type: "colleague" },
        ]));

        await feature.start(workspaceRoot as any);

        await feature.addContact("Colleagues.md", makeColleagueContact("alias1", "Alice Anderson", "Senior Software Engineer"));
        expect(fileContents.get("/workspace/05-Contacts/Colleagues.md")).toContain("# alias1");

        await expect(
            feature.addContact("Colleagues.md", makeColleagueContact("alias1", "Alice Anderson", "Senior Software Engineer"))
        ).rejects.toThrow("already exists");

        await feature.editContact(
            "alias1",
            "Colleagues.md",
            makeColleagueContact("alias1", "Alice Anderson", "CVP")
        );
        expect(fileContents.get("/workspace/05-Contacts/Colleagues.md")).toContain("Title: CVP");

        const createdGroup = await feature.createCustomGroup("Partners");
        expect(createdGroup).toEqual({
            file: "Partners.md",
            name: "Partners",
            type: "colleague",
            isCustom: true,
            contactCount: 0,
        });
        expect(fileContents.has("/workspace/05-Contacts/Partners.md")).toBe(true);

        await feature.deleteContact("alias1");
        expect(fileContents.get("/workspace/05-Contacts/Colleagues.md")).toBe("");
    });

    it("should preserve and restore dropped fields when moving between report and colleague groups", async () => {
        seedReferenceData("/workspace/06-Contacts");
        setFile("/workspace/06-Contacts/Team.md", reportDocument([
            makeReportContact("alias1", "Alice Anderson", "Senior Software Engineer"),
        ]));
        setFile("/workspace/06-Contacts/Colleagues.md", "");

        const feature = new ContactsFeature(createManifest("06-Contacts/", [
            { file: "Team.md", type: "report" },
            { file: "Colleagues.md", type: "colleague" },
        ]));

        await feature.start(workspaceRoot as any);

        await feature.moveContact("alias1", "Colleagues.md");
        expect(fileContents.get("/workspace/06-Contacts/Team.md")).toBe("");
        expect(fileContents.get("/workspace/06-Contacts/Colleagues.md")).toContain("_droppedFields:");
        expect(fileContents.get("/workspace/06-Contacts/Colleagues.md")).toContain("LevelId: l5");
        expect(fileContents.get("/workspace/06-Contacts/Colleagues.md")).toContain("LevelStartDate: 2024-11-15");

        await feature.moveContact("alias1", "Team.md");
        expect(fileContents.get("/workspace/06-Contacts/Colleagues.md")).toBe("");
        expect(fileContents.get("/workspace/06-Contacts/Team.md")).toContain("LevelId: l5");
        expect(fileContents.get("/workspace/06-Contacts/Team.md")).not.toContain("_droppedFields:");
    });

    it("should debounce watcher-driven reloads on contact markdown changes", async () => {
        vi.useFakeTimers();
        seedReferenceData("/workspace/05-Contacts");
        setFile("/workspace/05-Contacts/Colleagues.md", colleagueDocument([
            makeColleagueContact("alias1", "Alice Anderson", "Senior Software Engineer"),
        ]));

        const feature = new ContactsFeature(createManifest("05-Contacts/", [
            { file: "Colleagues.md", type: "colleague" },
        ]));
        const onDidUpdate = vi.fn();
        feature.onDidUpdate(onDidUpdate);

        await feature.start(workspaceRoot as any);
        onDidUpdate.mockClear();

        setFile("/workspace/05-Contacts/Colleagues.md", colleagueDocument([
            makeColleagueContact("alias1", "Alice Anderson", "Senior Software Engineer"),
            makeColleagueContact("alias2", "Bob Baker", "Principal Program Manager", "pm", "he/him"),
        ]));

        createdWatchers[0].fireChange(createUri("/workspace/05-Contacts/Colleagues.md"));
        createdWatchers[0].fireChange(createUri("/workspace/05-Contacts/Colleagues.md"));

        await vi.advanceTimersByTimeAsync(499);
        expect(onDidUpdate).not.toHaveBeenCalled();

        await vi.advanceTimersByTimeAsync(1);
        expect(onDidUpdate).toHaveBeenCalledOnce();
        expect(feature.getAllContacts()).toHaveLength(2);
    });

    it("should surface a missing-folder state when the people folder does not exist", async () => {
        const feature = new ContactsFeature(createManifest("05-Contacts/", [
            { file: "Colleagues.md", type: "colleague" },
        ]));

        await feature.start(workspaceRoot as any);

        expect(feature.isActive()).toBe(true);
        expect(feature.getSnapshot().folderMissing).toBe(true);
        expect(feature.getAllContacts()).toEqual([]);
        expect(mockShowWarningMessage).toHaveBeenCalledWith(expect.stringContaining("was not found"));
    });

    it("should skip integrity correction when the DataTypes folder is absent", async () => {
        setFile("/workspace/05-Contacts/Colleagues.md", colleagueDocument([
            makeColleagueContact("alias1", "Alice Anderson", "Senior Software Engineer", "sde", "xe/xem"),
        ]));

        const feature = new ContactsFeature(createManifest("05-Contacts/", [
            { file: "Colleagues.md", type: "colleague" },
        ]));

        await feature.start(workspaceRoot as any);

        // With no reference data on disk, the invalid pronounsKey must be left intact rather than
        // overwritten to "unknown" — the absence of DataTypes is a relocation, not invalid data.
        expect(feature.getSnapshot().folderMissing).toBe(false);
        expect(fileContents.get("/workspace/05-Contacts/Colleagues.md")).toContain("PronounsKey: xe/xem");
        expect(feature.getContactById("alias1")?.pronounsKey).toBe("xe/xem");
        expect(mockShowWarningMessage).toHaveBeenCalledWith(expect.stringContaining("DataTypes"));
    });

    it("should follow a people-folder rename and persist the new path", async () => {
        seedReferenceData("/workspace/05-Contacts");
        setFile("/workspace/05-Contacts/Colleagues.md", colleagueDocument([
            makeColleagueContact("alias1", "Alice Anderson", "Senior Software Engineer"),
        ]));

        const manifest = createManifest("05-Contacts/", [
            { file: "Colleagues.md", type: "colleague" },
        ]);
        const feature = new ContactsFeature(manifest as any);

        await feature.start(workspaceRoot as any);

        moveTree("/workspace/05-Contacts", "/workspace/Contacts");
        fireRename([{ oldUri: createUri("/workspace/05-Contacts"), newUri: createUri("/workspace/Contacts") }]);
        await flushReconcile();

        expect(feature.getSnapshot().folderMissing).toBe(false);
        expect(feature.getContactById("alias1")).not.toBeNull();
        expect(manifest.writeManifest).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({ contacts: expect.objectContaining({ peopleFolder: "Contacts" }) }),
        );
    });

    it("should preserve a blueprint group's type when its file is renamed", async () => {
        seedReferenceData("/workspace/05-Contacts");
        setFile("/workspace/05-Contacts/Team.md", reportDocument([
            makeReportContact("alias1", "Alice Anderson", "Senior Software Engineer"),
        ]));

        const manifest = createManifest("05-Contacts/", [
            { file: "Team.md", type: "report" },
        ]);
        const feature = new ContactsFeature(manifest as any);

        await feature.start(workspaceRoot as any);

        moveFile("/workspace/05-Contacts/Team.md", "/workspace/05-Contacts/Squad.md");
        fireRename([{ oldUri: createUri("/workspace/05-Contacts/Team.md"), newUri: createUri("/workspace/05-Contacts/Squad.md") }]);
        await flushReconcile();

        expect(feature.getGroupSummaries()).toEqual([
            { file: "Squad.md", name: "Squad", type: "report", isCustom: false, contactCount: 1 },
        ]);
        expect(manifest.writeManifest).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({
                contacts: expect.objectContaining({ groups: [{ file: "Squad.md", type: "report" }] }),
            }),
        );
    });

    it("should re-point to a relocated folder via repairLocation", async () => {
        seedReferenceData("/workspace/05-Contacts");
        setFile("/workspace/05-Contacts/Colleagues.md", colleagueDocument([
            makeColleagueContact("alias1", "Alice Anderson", "Senior Software Engineer"),
        ]));

        const manifest = createManifest("05-Contacts/", [
            { file: "Colleagues.md", type: "colleague" },
        ]);
        const feature = new ContactsFeature(manifest as any);

        await feature.start(workspaceRoot as any);

        // Out-of-band move (e.g. terminal) — no rename event is fired.
        moveTree("/workspace/05-Contacts", "/workspace/people/Contacts");

        await feature.repairLocation(createUri("/workspace/people/Contacts") as any);

        expect(feature.getSnapshot().folderMissing).toBe(false);
        expect(feature.getContactById("alias1")).not.toBeNull();
        expect(manifest.writeManifest).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({ contacts: expect.objectContaining({ peopleFolder: "people/Contacts" }) }),
        );
    });

    it("should reject repairLocation for a folder outside the workspace", async () => {
        setFile("/workspace/05-Contacts/Colleagues.md", "");

        const feature = new ContactsFeature(createManifest("05-Contacts/", [
            { file: "Colleagues.md", type: "colleague" },
        ]));

        await feature.start(workspaceRoot as any);

        await expect(feature.repairLocation(createUri("/other/Contacts") as any))
            .rejects.toThrow("inside the current workspace");
    });
});

function createManifest(
    peopleFolder: string,
    groups: Array<{ file: string; type: "report" | "colleague" }>,
): { readManifest: ReturnType<typeof vi.fn>; writeManifest: ReturnType<typeof vi.fn> } {
    let stored: { contacts: { peopleFolder: string; groups: Array<{ file: string; type: "report" | "colleague" }> } } = {
        contacts: { peopleFolder, groups },
    };
    return {
        readManifest: vi.fn(async () => structuredClone(stored)),
        writeManifest: vi.fn(async (_root: unknown, manifest: typeof stored) => {
            stored = structuredClone(manifest);
        }),
    };
}

function seedReferenceData(peopleRoot: string): void {
    setFile(`${peopleRoot}/DataTypes/Pronouns.md`, [
        "# he/him",
        "- Subject: he",
        "- Object: him",
        "- PossessiveAdjective: his",
        "- Possessive: his",
        "- Reflexive: himself",
        "",
        "# they/them",
        "- Subject: they",
        "- Object: them",
        "- PossessiveAdjective: their",
        "- Possessive: theirs",
        "- Reflexive: themselves",
    ].join("\n"));
    setFile(`${peopleRoot}/DataTypes/CareerPaths.md`, [
        "# sde",
        "- Name: Software Engineer",
        "- Short: SDE",
        "- MinimumCareerLevel: 0",
        "",
        "# pm",
        "- Name: Program Manager",
        "- Short: PM",
        "- MinimumCareerLevel: 0",
    ].join("\n"));
    setFile(`${peopleRoot}/DataTypes/CareerLevels.md`, [
        "# l5",
        "- Id: 5",
        "- InterviewType: senior",
        "- TitlePattern: Senior {CareerPath}",
        "",
        "# l7",
        "- Id: 7",
        "- InterviewType: senior",
        "- TitlePattern: Principal {CareerPath}",
    ].join("\n"));
    setFile(`${peopleRoot}/DataTypes/InterviewTypes.md`, [
        "# senior",
        "- Name: Senior",
    ].join("\n"));
}

function makeColleagueContact(
    id: string,
    fullName: string,
    title: string,
    careerPathKey = "sde",
    pronounsKey = "they/them",
): Contact {
    return {
        kind: "colleague",
        id,
        nickname: fullName.split(" ")[0],
        fullName,
        title,
        careerPathKey,
        pronounsKey,
        extraFields: {},
        droppedFields: {},
    };
}

function makeReportContact(
    id: string,
    fullName: string,
    title: string,
    careerPathKey = "sde",
    pronounsKey = "they/them",
): Contact {
    return {
        kind: "report",
        id,
        nickname: fullName.split(" ")[0],
        fullName,
        title,
        careerPathKey,
        levelId: "l5",
        levelStartDate: "2024-11-15",
        pronounsKey,
        extraFields: {},
        droppedFields: {},
    };
}

function colleagueDocument(contacts: Contact[]): string {
    return contacts.map((contact) => [
        `# ${contact.id}`,
        `- Nickname: ${contact.nickname}`,
        `- FullName: ${contact.fullName}`,
        `- Title: ${contact.title}`,
        `- CareerPathKey: ${contact.careerPathKey}`,
        `- PronounsKey: ${contact.pronounsKey}`,
        ...serializeDroppedFields(contact),
    ].filter(Boolean).join("\n")).join("\n\n");
}

function reportDocument(contacts: Contact[]): string {
    return contacts.map((contact) => {
        if (contact.kind !== "report") {
            throw new Error("Expected a report contact.");
        }

        return [
            `# ${contact.id}`,
            `- Nickname: ${contact.nickname}`,
            `- FullName: ${contact.fullName}`,
            `- Title: ${contact.title}`,
            `- CareerPathKey: ${contact.careerPathKey}`,
            `- LevelId: ${contact.levelId}`,
            `- LevelStartDate: ${contact.levelStartDate}`,
            `- PronounsKey: ${contact.pronounsKey}`,
            ...serializeDroppedFields(contact),
        ].filter(Boolean).join("\n");
    }).join("\n\n");
}

function serializeDroppedFields(contact: Contact): string[] {
    const droppedEntries = Object.entries(contact.droppedFields);
    if (droppedEntries.length === 0) {
        return [];
    }

    return [
        "- _droppedFields:",
        ...droppedEntries.map(([key, value]) => `  - ${key}: ${value}`),
    ];
}

function setFile(path: string, content: string): void {
    const normalizedPath = normalizeTestPath(path);
    ensureParentDirectories(normalizedPath);
    fileContents.set(normalizedPath, content);
}

/** Relocates every file and directory under `oldRoot` to `newRoot` in the mock filesystem. */
function moveTree(oldRoot: string, newRoot: string): void {
    const from = normalizeTestPath(oldRoot);
    const to = normalizeTestPath(newRoot);

    for (const [path, content] of [...fileContents]) {
        if (path === from || path.startsWith(`${from}/`)) {
            fileContents.delete(path);
            const next = to + path.slice(from.length);
            ensureParentDirectories(next);
            fileContents.set(next, content);
        }
    }
    for (const directory of [...directories]) {
        if (directory === from || directory.startsWith(`${from}/`)) {
            directories.delete(directory);
            directories.add(to + directory.slice(from.length));
        }
    }
    ensureDirectory(to);
}

/** Relocates a single file in the mock filesystem. */
function moveFile(oldPath: string, newPath: string): void {
    const from = normalizeTestPath(oldPath);
    const to = normalizeTestPath(newPath);
    const content = fileContents.get(from);
    if (content !== undefined) {
        fileContents.delete(from);
        ensureParentDirectories(to);
        fileContents.set(to, content);
    }
}

/**
 * Settles the fire-and-forget reconciliation promise. A single macrotask tick runs only after the
 * microtask queue has fully drained, so the entire await chain settles regardless of its depth —
 * unlike a fixed-count microtask drain, which silently under-waits if the chain grows.
 */
function flushReconcile(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 0));
}

function createWatcher(pattern: unknown): MockWatcher {
    const changeListeners: Array<(uri: MockUri) => void> = [];
    const createListeners: Array<(uri: MockUri) => void> = [];
    const deleteListeners: Array<(uri: MockUri) => void> = [];

    const watcher: MockWatcher = {
        pattern,
        dispose: vi.fn(),
        onDidChange(listener) {
            changeListeners.push(listener);
            return { dispose: () => removeListener(changeListeners, listener) };
        },
        onDidCreate(listener) {
            createListeners.push(listener);
            return { dispose: () => removeListener(createListeners, listener) };
        },
        onDidDelete(listener) {
            deleteListeners.push(listener);
            return { dispose: () => removeListener(deleteListeners, listener) };
        },
        fireChange(uri) {
            for (const listener of changeListeners) {
                listener(uri);
            }
        },
        fireCreate(uri) {
            for (const listener of createListeners) {
                listener(uri);
            }
        },
        fireDelete(uri) {
            for (const listener of deleteListeners) {
                listener(uri);
            }
        },
    };

    createdWatchers.push(watcher);
    return watcher;
}

function removeListener<T>(listeners: T[], listener: T): void {
    const index = listeners.indexOf(listener);
    if (index >= 0) {
        listeners.splice(index, 1);
    }
}

function createUri(path: string): MockUri {
    const normalizedPath = normalizeTestPath(path);
    return {
        path: normalizedPath,
        toString: () => normalizedPath,
    };
}

function normalizeTestPath(value: string): string {
    const normalized = value.replace(/\\/g, "/").replace(/\/+/g, "/");
    return normalized.startsWith("/") ? normalized : `/${normalized}`;
}

function joinPaths(base: string, ...segments: string[]): string {
    return normalizeTestPath([base, ...segments].join("/"));
}

function ensureParentDirectories(path: string): void {
    ensureDirectory(parentPath(path));
}

function ensureDirectory(path: string): void {
    const normalizedPath = normalizeTestPath(path);
    directories.add("/");

    const segments = normalizedPath.split("/").filter(Boolean);
    let currentPath = "";
    for (const segment of segments) {
        currentPath += `/${segment}`;
        directories.add(currentPath);
    }
}

function parentPath(path: string): string {
    const normalizedPath = normalizeTestPath(path);
    const index = normalizedPath.lastIndexOf("/");
    return index <= 0 ? "/" : normalizedPath.slice(0, index);
}

function listDirectoryEntries(path: string): Array<[string, number]> {
    const normalizedPath = normalizeTestPath(path).replace(/\/$/, "") || "/";
    const prefix = normalizedPath === "/" ? "/" : `${normalizedPath}/`;
    const entries = new Map<string, number>();

    for (const directory of directories) {
        if (directory === normalizedPath || !directory.startsWith(prefix)) {
            continue;
        }

        const relativePath = directory.slice(prefix.length);
        if (!relativePath || relativePath.includes("/")) {
            continue;
        }

        entries.set(relativePath, 2);
    }

    for (const filePath of fileContents.keys()) {
        if (!filePath.startsWith(prefix)) {
            continue;
        }

        const relativePath = filePath.slice(prefix.length);
        if (!relativePath || relativePath.includes("/")) {
            continue;
        }

        entries.set(relativePath, 1);
    }

    return [...entries.entries()];
}