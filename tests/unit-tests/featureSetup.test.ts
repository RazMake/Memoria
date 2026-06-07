import { describe, it, expect, vi, beforeEach } from "vitest";

// ────────────────────────────────────────────────────────────────────────────
// Hoisted shared mock state
// ────────────────────────────────────────────────────────────────────────────
const executeCommand = vi.fn();
const registerCompletionItemProvider = vi.fn(() => ({ dispose: vi.fn() }));
const registerHoverProvider = vi.fn(() => ({ dispose: vi.fn() }));
const registerCommand = vi.fn(() => ({ dispose: vi.fn() }));

const contactsViewRegister = vi.fn(() => ({ dispose: vi.fn() }));

vi.mock("vscode", () => ({
    commands: {
        executeCommand: (...a: any[]) => executeCommand(...a),
        registerCommand: (...a: any[]) => registerCommand(...a),
    },
    languages: {
        registerCompletionItemProvider: (...a: any[]) => registerCompletionItemProvider(...a),
        registerHoverProvider: (...a: any[]) => registerHoverProvider(...a),
    },
    Disposable: {
        from: (...items: any[]) => ({ dispose: () => items.forEach((i) => i?.dispose?.()) }),
    },
}));

vi.mock("../../src/blueprints/workspaceUtils", () => ({
    getWorkspaceRoots: () => [{ fsPath: "/workspace" }],
}));

vi.mock("../../src/features/contacts/contactsViewProvider", () => ({
    ContactsViewProvider: class {
        static register = (...a: any[]) => contactsViewRegister(...a);
        dispose = vi.fn();
    },
}));

vi.mock("../../src/features/snippets/snippetCompletionProvider", () => ({
    SnippetCompletionProvider: class {},
}));

vi.mock("../../src/features/snippets/snippetHoverProvider", () => ({
    SnippetHoverProvider: class {
        showDetailedHover = vi.fn();
    },
}));

import { registerFeatureHandlers } from "../../src/featureSetup";

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────
function makeFeatureManager() {
    const handlers = new Map<string, (root: any, enabled: boolean) => any>();
    return {
        register: vi.fn((id: string, cb: any) => handlers.get(id) ?? handlers.set(id, cb)),
        handlers,
        invoke: (id: string, root: any, enabled: boolean) => handlers.get(id)!(root, enabled),
    };
}

const ROOT = { fsPath: "/workspace" } as any;

describe("registerFeatureHandlers", () => {
    let context: any;
    let featureManager: ReturnType<typeof makeFeatureManager>;
    let decorationProvider: any;
    let taskCollectorFeature: any;
    let contactsFeature: any;
    let snippetsFeature: any;
    let backupFeature: any;

    beforeEach(() => {
        vi.clearAllMocks();
        context = { subscriptions: [], extensionUri: { fsPath: "/ext" } };
        featureManager = makeFeatureManager();
        decorationProvider = { refresh: vi.fn() };
        taskCollectorFeature = { refresh: vi.fn().mockResolvedValue(undefined) };
        contactsFeature = { refresh: vi.fn().mockResolvedValue(undefined) };
        snippetsFeature = { refresh: vi.fn().mockResolvedValue(undefined) };
        backupFeature = { refresh: vi.fn().mockResolvedValue(undefined) };

        registerFeatureHandlers(
            context,
            featureManager as any,
            decorationProvider,
            taskCollectorFeature,
            contactsFeature,
            snippetsFeature,
            backupFeature,
        );
    });

    it("registers a handler for every feature and adds toggle disposables", () => {
        for (const id of ["decorations", "taskCollector", "contacts", "snippets", "backup"]) {
            expect(featureManager.handlers.has(id)).toBe(true);
        }
        expect(context.subscriptions).toHaveLength(2);
    });

    it("decorations handler refreshes the provider", () => {
        featureManager.invoke("decorations", ROOT, true);
        expect(decorationProvider.refresh).toHaveBeenCalledWith(ROOT, true, expect.any(Array));
    });

    it("taskCollector handler refreshes the feature", async () => {
        await featureManager.invoke("taskCollector", ROOT, true);
        expect(taskCollectorFeature.refresh).toHaveBeenCalledWith(ROOT, true, expect.any(Array));
    });

    it("contacts handler enables the view provider when enabled", async () => {
        await featureManager.invoke("contacts", ROOT, true);
        expect(contactsFeature.refresh).toHaveBeenCalledWith(ROOT, true);
        expect(contactsViewRegister).toHaveBeenCalledTimes(1);
    });

    it("contacts handler only registers the view provider once across repeated enables", async () => {
        await featureManager.invoke("contacts", ROOT, true);
        await featureManager.invoke("contacts", ROOT, true);
        expect(contactsViewRegister).toHaveBeenCalledTimes(1);
    });

    it("contacts handler disables the view provider when disabled", async () => {
        await featureManager.invoke("contacts", ROOT, true);
        await featureManager.invoke("contacts", ROOT, false);
        // Re-enabling registers again after a disable.
        await featureManager.invoke("contacts", ROOT, true);
        expect(contactsViewRegister).toHaveBeenCalledTimes(2);
    });

    it("snippets handler enables providers and sets the active context", async () => {
        await featureManager.invoke("snippets", ROOT, true);
        expect(snippetsFeature.refresh).toHaveBeenCalledWith(ROOT, true);
        expect(executeCommand).toHaveBeenCalledWith("setContext", "memoria.snippetsActive", true);
        expect(registerCompletionItemProvider).toHaveBeenCalledTimes(1);
        expect(registerHoverProvider).toHaveBeenCalledTimes(1);
        expect(registerCommand).toHaveBeenCalledWith("memoria.showDetailedContactHover", expect.any(Function));
    });

    it("snippets handler marks context inactive when root is null", async () => {
        await featureManager.invoke("snippets", null, true);
        expect(executeCommand).toHaveBeenCalledWith("setContext", "memoria.snippetsActive", false);
    });

    it("snippets handler disables providers when disabled", async () => {
        await featureManager.invoke("snippets", ROOT, true);
        await featureManager.invoke("snippets", ROOT, false);
        await featureManager.invoke("snippets", ROOT, true);
        expect(registerCompletionItemProvider).toHaveBeenCalledTimes(2);
    });

    it("backup handler refreshes the feature", async () => {
        await featureManager.invoke("backup", ROOT, true);
        expect(backupFeature.refresh).toHaveBeenCalledWith(ROOT, true);
    });

    it("toggle disposables dispose the underlying registrations without throwing", async () => {
        await featureManager.invoke("contacts", ROOT, true);
        await featureManager.invoke("snippets", ROOT, true);
        expect(() => context.subscriptions.forEach((s: any) => s.dispose())).not.toThrow();
    });
});
