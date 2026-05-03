import { el, clearElement } from "./domUtils";
import type { ContactsFormState, ContactsBannerState, ContactsViewContact, ContactsViewToWebviewMessage } from "./types";

export function renderBanner(host: HTMLElement, banner: ContactsBannerState | null): void {
    clearElement(host);
    if (!banner) {
        return;
    }

    const bannerElement = el("div", `contacts-banner ${banner.tone}`);
    bannerElement.textContent = banner.message;
    host.appendChild(bannerElement);
}

export function buildHeaderSubtitle(contactCount: number, groupCount: number, searching: boolean): string {
    if (searching) {
        return `${contactCount} ${pluralize("person", contactCount)} across ${groupCount} ${pluralize("group", groupCount)}`;
    }

    return `${contactCount} ${pluralize("person", contactCount)} in ${groupCount} ${pluralize("group", groupCount)}`;
}

export function saveButtonLabel(mode: ContactsFormState["mode"], submitting: boolean): string {
    if (!submitting) {
        return mode === "move" ? "Move" : "Save";
    }

    return mode === "move" ? "Moving..." : "Saving...";
}

export function createFormPlaceholder(active: boolean): HTMLElement {
    const placeholder = el("div", "contacts-form-placeholder");
    const title = el("div", "contacts-form-placeholder-title");
    title.textContent = active ? "Select a person or add someone new" : "Contacts is unavailable";
    const subtitle = el("div", "contacts-form-placeholder-subtitle");
    subtitle.textContent = active
        ? "The form slides in here when you add, edit, or move a contact."
        : "Enable the contacts feature to edit people from the sidebar.";
    placeholder.append(title, subtitle);
    return placeholder;
}

export function matchesSearch(contact: ContactsViewContact, query: string): boolean {
    const haystack = [
        contact.id,
        contact.nickname,
        contact.fullName,
        contact.title,
        contact.shortTitle,
    ].join("\n").toLowerCase();
    return haystack.includes(query);
}

export function pluralize(word: string, count: number): string {
    return count === 1 ? word : `${word}s`;
}

export function toTitleCase(value: string): string {
    return value.replace(/\b\w+/g, (word) =>
        word.charAt(0).toUpperCase() + word.slice(1).toLowerCase(),
    );
}

export function isWebviewMessage(value: unknown): value is ContactsViewToWebviewMessage {
    if (!isRecord(value) || typeof value.type !== "string") {
        return false;
    }

    switch (value.type) {
        case "update":
            return isRecord(value.snapshot);
        case "open":
            return isRecord(value.request);
        case "saved":
            return typeof value.mode === "string"
                && typeof value.contactId === "string"
                && typeof value.groupFile === "string";
        case "error":
            return typeof value.message === "string";
        default:
            return false;
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}
