import type {
    Contact,
    ContactKind,
    ContactsViewContact,
    ContactsViewFormRequest,
    ContactsViewSnapshot,
    ContactsViewToExtensionMessage,
    ContactsViewToWebviewMessage,
} from "../types";

declare function acquireVsCodeApi<TState = unknown>(): {
    postMessage(message: unknown): void;
    setState(state: TState): TState;
    getState(): TState | undefined;
};

export type { Contact, ContactKind, ContactsViewContact, ContactsViewFormRequest, ContactsViewSnapshot, ContactsViewToExtensionMessage, ContactsViewToWebviewMessage };

export interface PersistedContactsState {
    search: string;
    expandedGroups: string[];
}

export interface ContactsBannerState {
    tone: "error" | "info";
    message: string;
}

export interface ContactsFormState {
    mode: ContactsViewFormRequest["mode"];
    sourceContactId: string | null;
    sourceGroupFile: string | null;
    selectedGroupFile: string;
    useNewGroup: boolean;
    newGroupName: string;
    draft: Contact;
    levelStartDateDisplay: string;
    reportTitleMode: "generated" | "custom";
    customReportTitle: string | null;
    errors: Record<string, string>;
}

export interface ContactsUiState {
    snapshot: ContactsViewSnapshot | null;
    search: string;
    expandedGroups: Set<string>;
    activeForm: ContactsFormState | null;
    pendingDeleteContactId: string | null;
    submitting: boolean;
    banner: ContactsBannerState | null;
}

export type VsCodeApi = ReturnType<typeof acquireVsCodeApi<PersistedContactsState>>;

export function getVsCodeApi(): VsCodeApi {
    return acquireVsCodeApi<PersistedContactsState>();
}