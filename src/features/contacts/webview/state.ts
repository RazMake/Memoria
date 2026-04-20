import { getVsCodeApi, type ContactsBannerState, type ContactsFormState, type ContactsUiState, type ContactsViewSnapshot, type PersistedContactsState, type VsCodeApi } from "./types";

export const vscode: VsCodeApi = getVsCodeApi();

const persistedState = sanitizePersistedState(vscode.getState());

const state: ContactsUiState = {
    snapshot: null,
    search: persistedState.search,
    expandedGroups: new Set(persistedState.expandedGroups),
    activeForm: null,
    pendingDeleteContactId: null,
    submitting: false,
    banner: null,
};

export function getState(): ContactsUiState {
    return state;
}

export function setSnapshot(snapshot: ContactsViewSnapshot): void {
    state.snapshot = snapshot;

    const availableGroups = new Set(snapshot.groups.map((group) => group.file));
    for (const expandedGroup of [...state.expandedGroups]) {
        if (!availableGroups.has(expandedGroup)) {
            state.expandedGroups.delete(expandedGroup);
        }
    }

    if (snapshot.groups.length > 0 && state.expandedGroups.size === 0) {
        for (const group of snapshot.groups) {
            state.expandedGroups.add(group.file);
        }
    }

    if (state.pendingDeleteContactId && !snapshot.contacts.some((contact) => contact.id === state.pendingDeleteContactId)) {
        state.pendingDeleteContactId = null;
    }

    if (state.activeForm && state.activeForm.mode !== "add" && state.activeForm.sourceContactId) {
        const contactStillExists = snapshot.contacts.some((contact) => contact.id === state.activeForm?.sourceContactId);
        if (!contactStillExists) {
            state.activeForm = null;
            state.submitting = false;
        }
    }

    persist();
}

export function setSearch(value: string): void {
    state.search = value;
    persist();
}

export function setGroupExpanded(groupFile: string, expanded: boolean): void {
    if (expanded) {
        state.expandedGroups.add(groupFile);
    } else {
        state.expandedGroups.delete(groupFile);
    }

    persist();
}

export function openForm(form: ContactsFormState): void {
    state.activeForm = form;
    state.pendingDeleteContactId = null;
    state.submitting = false;
    state.banner = null;
}

export function closeForm(): void {
    state.activeForm = null;
    state.submitting = false;
    state.banner = null;
}

export function updateActiveForm(mutator: (form: ContactsFormState) => void): void {
    if (!state.activeForm) {
        return;
    }

    mutator(state.activeForm);
}

export function setPendingDeleteContactId(contactId: string | null): void {
    state.pendingDeleteContactId = contactId;
}

export function setSubmitting(submitting: boolean): void {
    state.submitting = submitting;
}

export function setBanner(banner: ContactsBannerState | null): void {
    state.banner = banner;
}

export function clearBanner(): void {
    state.banner = null;
}

function persist(): void {
    vscode.setState({
        search: state.search,
        expandedGroups: [...state.expandedGroups],
    });
}

function sanitizePersistedState(value: PersistedContactsState | undefined): PersistedContactsState {
    if (!value || typeof value.search !== "string" || !Array.isArray(value.expandedGroups)) {
        return {
            search: "",
            expandedGroups: [],
        };
    }

    return {
        search: value.search,
        expandedGroups: value.expandedGroups.filter((entry): entry is string => typeof entry === "string"),
    };
}