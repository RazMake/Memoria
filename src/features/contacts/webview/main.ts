import { createFormState } from "./formModel";
import {
    clearBanner,
    closeForm,
    getState,
    openForm,
    setBanner,
    setGroupExpanded,
    setPendingDeleteContactId,
    setSearch,
    setSnapshot,
    setSubmitting,
    vscode,
} from "./state";
import { createModifierKeyTracker } from "./modifierKeys";
import { injectStyles } from "./styles";
import { el, clearElement } from "./domUtils";
import { createContactRow, createGroupCard, createEmptyState, createToolbarButton } from "./contactListComponents";
import { renderBanner, buildHeaderSubtitle, matchesSearch, isWebviewMessage } from "./uiHelpers";
import { renderFormPane } from "./formPane";

const root = document.getElementById("root") ?? document.body;
const modifierKeys = createModifierKeyTracker();

const shell = el("div", "contacts-shell");
const stage = el("div", "contacts-stage");

const listPane = el("section", "contacts-pane contacts-list-pane");
const listHeader = el("div", "contacts-list-header");
const listHeaderTitle = el("div", "contacts-header-title");
const listHeaderSubtitle = el("div", "contacts-header-subtitle");
const searchRow = el("div", "contacts-search-row");
const searchInput = document.createElement("input");
searchInput.type = "search";
searchInput.className = "contacts-search-input";
searchInput.placeholder = "Search people";
searchInput.autocomplete = "off";
searchInput.spellcheck = false;

const addButton = document.createElement("button");
addButton.type = "button";
addButton.className = "contacts-add-button";
addButton.textContent = "+";
addButton.setAttribute("aria-label", "Add person");

const listBannerHost = el("div", "contacts-panel-banner");
const listScroll = el("div", "contacts-list-scroll");
const listToolbar = el("div", "contacts-toolbar");
const groupsHost = el("div", "contacts-groups");

const formPane = el("section", "contacts-pane contacts-form-pane");

searchRow.append(searchInput, addButton);
listHeader.append(listHeaderTitle, listHeaderSubtitle, searchRow);
listScroll.append(listToolbar, groupsHost);
listPane.append(listHeader, listBannerHost, listScroll);

stage.append(listPane, formPane);
shell.appendChild(stage);
root.appendChild(shell);

injectStyles();

searchInput.addEventListener("input", () => {
    setSearch(searchInput.value);
    renderList();
});

addButton.addEventListener("click", () => {
    const snapshot = getState().snapshot;
    if (!snapshot?.active) {
        return;
    }

    clearBanner();
    vscode.postMessage({
        type: "open",
        mode: "add",
        preferredGroupFile: snapshot.groups[0]?.file,
    });
});

window.addEventListener("message", (event: MessageEvent) => {
    const message = event.data;
    if (!isWebviewMessage(message)) {
        return;
    }

    switch (message.type) {
        case "update":
            setSnapshot(message.snapshot);
            renderAll();
            break;
        case "open": {
            const snapshot = getState().snapshot;
            if (!snapshot) {
                return;
            }

            const form = createFormState(snapshot, message.request);
            if (!form) {
                setBanner({
                    tone: "error",
                    message: "Memoria: The requested contact or destination group is no longer available.",
                });
                renderAll();
                return;
            }

            openForm(form);
            renderAll();
            break;
        }
        case "saved": {
            closeForm();
            renderAll();
            break;
        }
        case "error":
            setSubmitting(false);
            setBanner({
                tone: "error",
                message: message.message,
            });
            renderAll({ preserveFormFocus: true });
            break;
    }
});

window.addEventListener("keydown", (event: KeyboardEvent) => {
    const state = getState();
    const target = event.target;
    const isEditableTarget = target instanceof HTMLInputElement
        || target instanceof HTMLTextAreaElement
        || target instanceof HTMLSelectElement;

    if (event.key === "Escape") {
        if (state.pendingDeleteContactId) {
            setPendingDeleteContactId(null);
            renderList();
            return;
        }

        if (state.activeForm && !state.submitting) {
            closeForm();
            renderAll();
        }
        return;
    }

    if (event.key === "/" && !isEditableTarget) {
        event.preventDefault();
        searchInput.focus();
        searchInput.select();
    }
});

vscode.postMessage({ type: "ready" });

renderAll();

function renderAll(options?: { preserveFormFocus?: boolean }): void {
    shell.classList.toggle("form-open", Boolean(getState().activeForm));
    renderList();
    renderFormPane(formPane, renderAll, Boolean(options?.preserveFormFocus));
}

function renderList(): void {
    const state = getState();
    const snapshot = state.snapshot;
    const searchQuery = state.search.trim().toLowerCase();

    searchInput.value = state.search;
    addButton.disabled = !snapshot?.active;

    renderBanner(listBannerHost, state.activeForm ? null : state.banner);
    clearElement(groupsHost);
    clearElement(listToolbar);

    if (!snapshot) {
        listHeaderTitle.textContent = "";
        listHeaderSubtitle.textContent = "Waiting for the sidebar to initialize.";
        groupsHost.appendChild(createEmptyState("Loading contacts", "Open the Contacts view after the feature is activated."));
        return;
    }

    if (!snapshot.active) {
        listHeaderTitle.textContent = "";
        listHeaderSubtitle.textContent = "Contacts is not enabled for this workspace.";
        groupsHost.appendChild(createEmptyState("Contacts is unavailable", "Enable the contacts feature to browse or edit people from the sidebar."));
        return;
    }

    listHeaderTitle.textContent = "";
    listHeaderSubtitle.textContent = buildHeaderSubtitle(snapshot.contacts.length, snapshot.groups.length, searchQuery.length > 0);

    if (searchQuery) {
        const matchedContacts = snapshot.contacts.filter((contact) => matchesSearch(contact, searchQuery));
        if (matchedContacts.length === 0) {
            groupsHost.appendChild(createEmptyState("No matches", "Search by nickname, full name, id, or title."));
            return;
        }

        const flatList = el("div", "contacts-flat-list");
        for (const contact of matchedContacts) {
            flatList.appendChild(createContactRow(contact, true, renderList));
        }
        groupsHost.appendChild(flatList);
        return;
    }

    listToolbar.append(createToolbarButton("expand-all", "+", "Expand all", () => {
        for (const group of snapshot.groups) {
            setGroupExpanded(group.file, true);
        }
        renderList();
    }), createToolbarButton("collapse-all", "−", "Collapse all", () => {
        for (const group of snapshot.groups) {
            setGroupExpanded(group.file, false);
        }
        renderList();
    }));

    const groupedContacts = snapshot.groups.map((group) => {
        const contacts = snapshot.contacts.filter((contact) => contact.groupFile === group.file);
        return { group, contacts };
    });

    if (groupedContacts.length === 0) {
        groupsHost.appendChild(createEmptyState("No contacts", "Add someone using the + button above."));
        return;
    }

    for (const entry of groupedContacts) {
        groupsHost.appendChild(createGroupCard(entry.group, entry.contacts, renderList));
    }
}