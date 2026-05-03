import { getMoveTargets } from "./formModel";
import { el } from "./domUtils";
import { clearBanner, getState, setPendingDeleteContactId, setGroupExpanded, vscode } from "./state";
import type { ContactsViewContact, ContactsViewSnapshot } from "./types";

export function createGroupCard(
    group: (ContactsViewSnapshot & { active: true })["groups"][number],
    contacts: readonly ContactsViewContact[],
    renderList: () => void,
): HTMLElement {
    const details = document.createElement("details");
    details.className = "group-card";
    details.open = getState().expandedGroups.has(group.file);
    details.addEventListener("toggle", () => {
        setGroupExpanded(group.file, details.open);
    });

    const summary = document.createElement("summary");
    summary.className = "group-summary";

    const titleStack = el("div", "group-title-stack");
    const title = el("div", "group-title");
    title.textContent = group.name;
    const countSpan = el("span", "contacts-group-count");
    countSpan.textContent = `(${contacts.length})`;
    title.appendChild(countSpan);
    titleStack.appendChild(title);

    summary.append(document.createElement("span"), titleStack);
    details.appendChild(summary);

    const groupList = el("div", "group-list");
    if (contacts.length === 0) {
        const emptyState = el("div", "group-empty");
        emptyState.textContent = "No contacts in this group yet.";
        groupList.appendChild(emptyState);
    } else {
        for (const contact of contacts) {
            groupList.appendChild(createContactRow(contact, false, renderList));
        }
    }

    details.appendChild(groupList);
    return details;
}

export function createContactRow(contact: ContactsViewContact, showGroupTag: boolean, renderList: () => void): HTMLElement {
    const row = el("div", "contact-row");
    row.tabIndex = 0;
    row.setAttribute("role", "button");
    row.setAttribute("aria-label", `Edit ${contact.fullName || contact.nickname || contact.id}`);

    const pendingDelete = getState().pendingDeleteContactId === contact.id;
    row.classList.toggle("pending-delete", pendingDelete);

    if (!pendingDelete) {
        row.addEventListener("click", () => {
            clearBanner();
            vscode.postMessage({
                type: "open",
                mode: "edit",
                contactId: contact.id,
            });
        });
        row.addEventListener("keydown", (event: KeyboardEvent) => {
            if (event.key !== "Enter" && event.key !== " ") {
                return;
            }

            event.preventDefault();
            vscode.postMessage({
                type: "open",
                mode: "edit",
                contactId: contact.id,
            });
        });
    }

    const copy = el("div", "contact-copy");
    const linePrimary = el("div", "contact-line-primary");
    const nickname = el("span", "contact-primary-name");
    nickname.textContent = contact.nickname || contact.fullName || contact.id;
    linePrimary.appendChild(nickname);
    if (contact.fullName && contact.fullName !== contact.nickname) {
        const fullName = el("span", "contact-primary-full-name");
        fullName.textContent = ` (${contact.fullName})`;
        linePrimary.appendChild(fullName);
    }


    if (showGroupTag && contact.groupName) {
        const groupTag = el("span", "contact-group-tag");
        groupTag.textContent = contact.groupName;
        linePrimary.appendChild(groupTag);
    }

    const lineSecondary = el("div", "contact-line-secondary");
    lineSecondary.textContent = contact.shortTitle || contact.title || "Untitled";
    copy.append(linePrimary, lineSecondary);
    row.appendChild(copy);

    const actions = el("div", "contact-actions");
    actions.appendChild(createActionButton("Edit", "edit", (event) => {
        event.stopPropagation();
        clearBanner();
        vscode.postMessage({
            type: "open",
            mode: "edit",
            contactId: contact.id,
        });
    }));

    const moveTargets = getState().snapshot
        ? getMoveTargets(getState().snapshot!, contact.groupFile)
        : [];
    if (moveTargets.length > 0) {
        actions.appendChild(createActionButton("Move", "move", (event) => {
            event.stopPropagation();
            clearBanner();
            handleMove(contact, moveTargets);
        }));
    }

    actions.appendChild(createActionButton("Delete", "delete", (event) => {
        event.stopPropagation();
        setPendingDeleteContactId(contact.id);
        renderList();
    }));
    row.appendChild(actions);

    if (pendingDelete) {
        const confirm = el("div", "contact-confirm");
        const confirmCopy = el("div", "contact-confirm-copy");
        confirmCopy.textContent = `Delete ${contact.nickname || contact.id}?`;

        const confirmActions = el("div", "contact-confirm-actions");
        const confirmButton = document.createElement("button");
        confirmButton.type = "button";
        confirmButton.className = "contact-confirm-button";
        confirmButton.textContent = "Confirm";
        confirmButton.addEventListener("click", (event) => {
            event.stopPropagation();
            setPendingDeleteContactId(null);
            clearBanner();
            vscode.postMessage({
                type: "delete",
                contactId: contact.id,
            });
            renderList();
        });

        const cancelButton = document.createElement("button");
        cancelButton.type = "button";
        cancelButton.className = "contact-cancel-button";
        cancelButton.textContent = "Cancel";
        cancelButton.addEventListener("click", (event) => {
            event.stopPropagation();
            setPendingDeleteContactId(null);
            renderList();
        });

        confirmActions.append(confirmButton, cancelButton);
        confirm.append(confirmCopy, confirmActions);
        row.appendChild(confirm);
    }

    return row;
}

export function handleMove(contact: ContactsViewContact, moveTargets: readonly ReturnType<typeof getMoveTargets>[number][]): void {
    const directTarget = moveTargets.length === 1 ? moveTargets[0] : null;
    if (directTarget && !(contact.kind === "colleague" && directTarget.type === "report")) {
        vscode.postMessage({
            type: "move",
            contactId: contact.id,
            targetGroupFile: directTarget.file,
        });
        return;
    }

    vscode.postMessage({
        type: "open",
        mode: "move",
        contactId: contact.id,
        targetGroupFile: directTarget?.file ?? moveTargets[0]?.file,
    });
}

export function createActionButton(
    label: string,
    variant: "edit" | "move" | "delete",
    onClick: (event: MouseEvent) => void,
): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `contact-action ${variant}`;
    button.textContent = label;
    button.addEventListener("click", onClick);
    return button;
}

export function createToolbarButton(id: string, glyph: string, title: string, onClick: () => void): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "contacts-toolbar-button";
    button.setAttribute("data-action", id);
    button.title = title;
    button.setAttribute("aria-label", title);
    const icon = el("span", "contacts-toolbar-glyph");
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = glyph;
    button.appendChild(icon);
    button.addEventListener("click", onClick);
    return button;
}

export function createEmptyState(title: string, subtitle: string): HTMLElement {
    const empty = el("div", "contacts-empty");
    const emptyTitle = el("div", "contacts-empty-title");
    emptyTitle.textContent = title;
    const emptySubtitle = el("div", "contacts-empty-subtitle");
    emptySubtitle.textContent = subtitle;
    empty.append(emptyTitle, emptySubtitle);
    return empty;
}
