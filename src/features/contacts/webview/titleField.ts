import { buildColleagueTitleOptions } from "./formModel";
import { clearElement, el } from "./domUtils";
import type { ContactsViewSnapshot } from "./types";

interface TitleOptionGroup {
    careerPathName: string;
    isStandalone: boolean;
    options: Array<{ value: string; label: string }>;
}

export function createGroupedTitleField(options: {
    field: string;
    label: string;
    value: string;
    placeholder: string;
    snapshot: ContactsViewSnapshot & { active: true };
    currentTitle: string;
    careerPathKey: string;
    error?: string;
    onChange: (value: string, careerPathKey: string | null) => void;
}): HTMLElement {
    const field = el("label", "contacts-field");
    const label = el("span", "contacts-field-label");
    label.textContent = options.label;

    const wrapper = el("div", "contacts-title-combo-wrapper");

    const comboInput = document.createElement("input");
    comboInput.type = "text";
    comboInput.className = "contacts-field-input contacts-title-combo-input";
    comboInput.placeholder = options.placeholder;
    comboInput.autocomplete = "off";
    comboInput.spellcheck = false;
    comboInput.setAttribute("data-field", options.field);
    comboInput.value = options.value;
    if (options.error) {
        comboInput.classList.add("error");
    }

    const dropdown = el("div", "contacts-title-dropdown");
    dropdown.setAttribute("role", "listbox");

    const titleMap = buildTitleToCareerPathMap(options.snapshot);
    const titleOptions = buildColleagueTitleOptions(options.snapshot, options.currentTitle);

    function populateDropdown(filter: string): void {
        clearElement(dropdown);
        const lowerFilter = filter.toLowerCase();
        const allGrouped = groupTitlesByCareerPath(titleOptions, options.snapshot);
        const selectedPathName = options.careerPathKey
            ? options.snapshot.referenceData.careerPaths.find((p) => p.key === options.careerPathKey)?.name ?? null
            : null;
        const grouped = selectedPathName
            ? allGrouped.filter((g) => g.isStandalone || g.careerPathName === selectedPathName)
            : allGrouped;

        let hasGroupedItems = false;

        for (const group of grouped) {
            if (!group.isStandalone) {
                continue;
            }
            for (const opt of group.options) {
                if (lowerFilter && !opt.label.toLowerCase().includes(lowerFilter)) {
                    continue;
                }
                const item = el("div", "contacts-title-option");
                item.setAttribute("role", "option");
                item.setAttribute("data-value", opt.value);
                item.textContent = opt.label;
                item.addEventListener("mousedown", (event) => {
                    event.preventDefault();
                    selectItem(opt.value);
                });
                dropdown.appendChild(item);
            }
        }

        const standaloneCount = dropdown.childElementCount;

        for (const group of grouped) {
            if (group.isStandalone) {
                continue;
            }
            const matchingOptions = group.options.filter((opt) =>
                !lowerFilter || opt.label.toLowerCase().includes(lowerFilter),
            );
            if (matchingOptions.length === 0) {
                continue;
            }

            hasGroupedItems = true;

            if (standaloneCount > 0 && dropdown.querySelectorAll(".contacts-title-separator").length === 0) {
                dropdown.appendChild(el("div", "contacts-title-separator"));
            }

            const groupLabel = el("div", "contacts-title-group-label");
            groupLabel.textContent = group.careerPathName;
            dropdown.appendChild(groupLabel);

            for (const opt of matchingOptions) {
                const item = el("div", "contacts-title-option");
                item.setAttribute("role", "option");
                item.setAttribute("data-value", opt.value);
                item.textContent = opt.label;
                item.addEventListener("mousedown", (event) => {
                    event.preventDefault();
                    selectItem(opt.value);
                });
                dropdown.appendChild(item);
            }
        }

        if (!hasGroupedItems && standaloneCount === 0) {
            const empty = el("div", "contacts-title-option contacts-title-empty");
            empty.textContent = "No matching titles";
            dropdown.appendChild(empty);
        }
    }

    function selectItem(value: string): void {
        comboInput.value = value;
        dropdown.classList.remove("open");
        comboInput.blur();
        const careerPathKey = titleMap.get(value) ?? null;
        options.onChange(value, careerPathKey);
    }

    comboInput.addEventListener("focus", () => {
        populateDropdown(comboInput.value === options.value ? "" : comboInput.value);
        dropdown.classList.add("open");
    });

    comboInput.addEventListener("input", () => {
        populateDropdown(comboInput.value);
        dropdown.classList.add("open");
    });

    comboInput.addEventListener("blur", () => {
        setTimeout(() => {
            dropdown.classList.remove("open");
        }, 150);
    });

    comboInput.addEventListener("keydown", (event: KeyboardEvent) => {
        if (event.key === "Escape") {
            dropdown.classList.remove("open");
            comboInput.blur();
        }
    });

    wrapper.append(comboInput, dropdown);
    field.append(label, wrapper);
    appendFieldMeta(field);
    return field;
}

function appendFieldMeta(field: HTMLElement, helpText?: string): void {
    if (helpText) {
        const help = el("div", "contacts-field-help");
        help.textContent = helpText;
        field.appendChild(help);
    }
}

function buildTitleToCareerPathMap(
    snapshot: ContactsViewSnapshot & { active: true },
): Map<string, string> {
    const map = new Map<string, string>();
    for (const title of snapshot.referenceData.canonicalTitles) {
        if (map.has(title.normal)) {
            continue;
        }

        for (const path of snapshot.referenceData.careerPaths) {
            for (const level of snapshot.referenceData.careerLevels) {
                if (level.id < path.minimumCareerLevel) {
                    continue;
                }

                const pattern = level.titlePattern;
                const generated = pattern.split("{CareerPath}").join(path.name);
                if (generated === title.normal) {
                    map.set(title.normal, path.key);
                    break;
                }
            }

            if (map.has(title.normal)) {
                break;
            }
        }
    }
    return map;
}

function groupTitlesByCareerPath(
    titleOptions: ReturnType<typeof buildColleagueTitleOptions>,
    snapshot: ContactsViewSnapshot & { active: true },
): TitleOptionGroup[] {
    const titleToPath = buildTitleToCareerPathMap(snapshot);
    const pathKeyToName = new Map(snapshot.referenceData.careerPaths.map((p) => [p.key, p.name]));

    const groups = new Map<string, TitleOptionGroup>();
    const standaloneOptions: Array<{ value: string; label: string }> = [];

    for (const opt of titleOptions) {
        const pathKey = titleToPath.get(opt.value);
        const pathName = pathKey ? pathKeyToName.get(pathKey) ?? "Other" : null;

        if (opt.isCustom || !pathName) {
            standaloneOptions.push({ value: opt.value, label: opt.value });
            continue;
        }

        let group = groups.get(pathName);
        if (!group) {
            group = { careerPathName: pathName, isStandalone: false, options: [] };
            groups.set(pathName, group);
        }
        group.options.push({ value: opt.value, label: opt.label });
    }

    const result: TitleOptionGroup[] = [];

    if (standaloneOptions.length > 0) {
        result.push({ careerPathName: "", isStandalone: true, options: standaloneOptions });
    }

    for (const group of groups.values()) {
        result.push(group);
    }

    return result;
}
