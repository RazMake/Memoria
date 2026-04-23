// Parses and validates blueprint.yaml content into typed structures.
// Pure functions — no VS Code API dependency — so this module is fully unit-testable in isolation.
// Validation happens at parse time (fail-fast before any filesystem operations touch the workspace).

import { parse } from "yaml";
import { DEFAULT_TASK_COLLECTOR_CONFIG } from "../features/taskCollector/taskIndex";
import { normalizePath } from "../utils/path";
import type { BlueprintDefinition, BlueprintFeature, WorkspaceEntry, DecorationRule, DefaultFileMap, DefaultScope, ContactGroup } from "./types";

const VALID_DEFAULT_SCOPES: ReadonlySet<string> = new Set<DefaultScope>(["relative", "includingRoot"]);
const VALID_CONTACT_GROUP_TYPES: ReadonlySet<ContactGroup["type"]> = new Set(["report", "colleague"]);

/**
 * Parses a blueprint.yaml string into a validated BlueprintDefinition.
 * Throws a descriptive Error if required fields are missing or the structure is invalid.
 */
export function parseBlueprintYaml(content: string): BlueprintDefinition {
    let raw: unknown;
    try {
        raw = parse(content);
    } catch (err) {
        throw new Error(`Failed to parse blueprint YAML: ${(err as Error).message}`);
    }

    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
        throw new Error("Blueprint YAML must be a non-null object at the top level.");
    }

    const obj = raw as Record<string, unknown>;

    if (typeof obj["id"] !== "string" || !obj["id"]) {
        throw new Error('Blueprint is missing required string field "id".');
    }
    if (typeof obj["name"] !== "string" || !obj["name"]) {
        throw new Error('Blueprint is missing required string field "name".');
    }
    if (typeof obj["description"] !== "string" || !obj["description"]) {
        throw new Error('Blueprint is missing required string field "description".');
    }
    if (typeof obj["version"] !== "string" || !obj["version"]) {
        throw new Error('Blueprint is missing required string field "version".');
    }
    if (!Array.isArray(obj["workspace"])) {
        throw new Error('Blueprint is missing required array field "workspace".');
    }

    if (!Array.isArray(obj["features"])) {
        throw new Error('Blueprint is missing required array field "features".');
    }

    const workspace = parseWorkspaceTree(obj["workspace"]);
    const defaultFiles = resolveDefaultFiles(workspace);

    const definition: BlueprintDefinition = {
        id: obj["id"] as string,
        name: obj["name"] as string,
        description: obj["description"] as string,
        version: obj["version"] as string,
        workspace,
        features: parseFeatures(obj["features"]),
    };

    const hasDefaults =
        Object.keys(defaultFiles.relative).length > 0 ||
        Object.keys(defaultFiles.rootScoped).length > 0;
    if (hasDefaults) {
        definition.defaultFiles = defaultFiles;
    }

    return definition;
}

/**
 * Recursively normalizes raw YAML workspace entries into typed WorkspaceEntry[].
 * Names ending in "/" are treated as folders; all others are files.
 * Files cannot have children.
 *
 * Exists as a standalone export so it can be exercised in unit tests independently
 * of the full parseBlueprintYaml path.
 */
export function parseWorkspaceTree(raw: unknown): WorkspaceEntry[] {
    if (!Array.isArray(raw)) {
        throw new Error("Workspace tree must be an array.");
    }

    return raw.map((item: unknown, index: number) => {
        if (!item || typeof item !== "object") {
            throw new Error(`Workspace entry at index ${index} must be an object.`);
        }

        const entry = item as Record<string, unknown>;

        if (typeof entry["name"] !== "string" || !entry["name"]) {
            throw new Error(`Workspace entry at index ${index} is missing required string field "name".`);
        }

        const name = entry["name"] as string;
        const isFolder = name.endsWith("/");

        if (!isFolder && entry["children"] !== undefined) {
            throw new Error(`File entry "${name}" cannot have children.`);
        }

        const result: WorkspaceEntry = { name, isFolder };

        if (entry["default"] !== undefined) {
            if (typeof entry["default"] !== "string" || !VALID_DEFAULT_SCOPES.has(entry["default"])) {
                throw new Error(`Workspace entry "${name}": "default" must be "relative" or "includingRoot".`);
            }
            if (isFolder) {
                throw new Error(`Workspace entry "${name}": folders cannot be marked as default.`);
            }
            result.default = entry["default"] as DefaultScope;
        }

        if (isFolder && Array.isArray(entry["children"])) {
            result.children = parseWorkspaceTree(entry["children"]);
        }

        return result;
    });
}

/**
 * Validates the features array from raw YAML.
 * Each entry must have common fields (id, name, description, enabledByDefault)
 * and feature-specific fields dispatched by id.
 */
export function parseFeatures(raw: unknown[]): BlueprintFeature[] {
    return raw.map((item: unknown, index: number) => {
        if (!item || typeof item !== "object") {
            throw new Error(`Feature entry at index ${index} must be an object.`);
        }

        const entry = item as Record<string, unknown>;

        if (typeof entry["id"] !== "string" || !entry["id"]) {
            throw new Error(`Feature entry at index ${index} is missing required string field "id".`);
        }
        if (typeof entry["name"] !== "string" || !entry["name"]) {
            throw new Error(`Feature entry at index ${index} is missing required string field "name".`);
        }
        if (typeof entry["description"] !== "string" || !entry["description"]) {
            throw new Error(`Feature entry at index ${index} is missing required string field "description".`);
        }
        if (typeof entry["enabledByDefault"] !== "boolean") {
            throw new Error(`Feature entry at index ${index} is missing required boolean field "enabledByDefault".`);
        }

        const id = entry["id"] as string;

        // Switch is preferred over a Map-based dispatch here because there are only three
        // feature types. Adding a registry pattern would be over-engineering for this scale.
        // If feature count grows beyond ~5, consider extracting per-feature parser functions.
        switch (id) {
            case "decorations":
                return {
                    id,
                    name: entry["name"] as string,
                    description: entry["description"] as string,
                    enabledByDefault: entry["enabledByDefault"] as boolean,
                    rules: parseDecorationRules(entry["rules"]),
                };
            case "taskCollector":
                return {
                    id,
                    name: entry["name"] as string,
                    description: entry["description"] as string,
                    enabledByDefault: entry["enabledByDefault"] as boolean,
                    collectorPath: parseCollectorPath(entry["collectorPath"], index),
                    config: {
                        completedRetentionDays: parseOptionalField(
                            entry["completedRetentionDays"],
                            DEFAULT_TASK_COLLECTOR_CONFIG.completedRetentionDays,
                            index,
                            "completedRetentionDays",
                            (v): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0,
                            "a non-negative number",
                        ),
                        syncOnStartup: parseOptionalField(
                            entry["syncOnStartup"],
                            DEFAULT_TASK_COLLECTOR_CONFIG.syncOnStartup,
                            index,
                            "syncOnStartup",
                            (v): v is boolean => typeof v === "boolean",
                            "a boolean",
                        ),
                        include: parseOptionalField(
                            entry["include"],
                            [...DEFAULT_TASK_COLLECTOR_CONFIG.include],
                            index,
                            "include",
                            (v): v is string[] => Array.isArray(v) && v.every((item) => typeof item === "string" && Boolean(item)),
                            "an array of non-empty strings",
                        ),
                        exclude: parseOptionalField(
                            entry["exclude"],
                            [...DEFAULT_TASK_COLLECTOR_CONFIG.exclude],
                            index,
                            "exclude",
                            (v): v is string[] => Array.isArray(v) && v.every((item) => typeof item === "string" && Boolean(item)),
                            "an array of non-empty strings",
                        ),
                        debounceMs: parseOptionalField(
                            entry["debounceMs"],
                            DEFAULT_TASK_COLLECTOR_CONFIG.debounceMs,
                            index,
                            "debounceMs",
                            (v): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0,
                            "a non-negative number",
                        ),
                    },
                };
            case "contacts":
                return {
                    id,
                    name: entry["name"] as string,
                    description: entry["description"] as string,
                    enabledByDefault: entry["enabledByDefault"] as boolean,
                    peopleFolder: parsePeopleFolder(entry["peopleFolder"], index),
                    groups: parseContactGroups(entry["groups"], index),
                };
            case "snippets":
                return {
                    id,
                    name: entry["name"] as string,
                    description: entry["description"] as string,
                    enabledByDefault: entry["enabledByDefault"] as boolean,
                    snippetsFolder: parseSnippetsFolder(entry["snippetsFolder"], index),
                };
            default:
                throw new Error(`Feature entry at index ${index}: unknown feature id "${id}".`);
        }
    });
}

/**
 * Validates and normalizes the collectorPath field for a taskCollector feature entry.
 * Backslashes are converted to forward slashes so stored paths are always POSIX-style,
 * matching VS Code's Uri.path conventions regardless of the author's OS.
 */
function parseCollectorPath(raw: unknown, index: number): string {
    return parseRelativePathField(raw, index, "collectorPath", "file");
}

function parsePeopleFolder(raw: unknown, index: number): string {
    return parseRelativePathField(raw, index, "peopleFolder", "folder");
}

function parseSnippetsFolder(raw: unknown, index: number): string {
    return parseRelativePathField(raw, index, "snippetsFolder", "folder");
}

function parseContactGroups(raw: unknown, index: number): ContactGroup[] {
    if (!Array.isArray(raw)) {
        throw new Error(`Feature entry at index ${index}: "groups" must be an array.`);
    }

    const seenFiles = new Set<string>();
    return raw.map((item: unknown, groupIndex: number) => {
        if (!item || typeof item !== "object") {
            throw new Error(`Feature entry at index ${index}: group at index ${groupIndex} must be an object.`);
        }

        const entry = item as Record<string, unknown>;
        const file = parseContactGroupFile(entry["file"], index, groupIndex);
        const type = parseContactGroupType(entry["type"], index, groupIndex);
        const normalizedKey = file.toLowerCase();
        if (seenFiles.has(normalizedKey)) {
            throw new Error(`Feature entry at index ${index}: duplicate contacts group file "${file}".`);
        }
        seenFiles.add(normalizedKey);

        return { file, type };
    });
}

function parseContactGroupFile(raw: unknown, index: number, groupIndex: number): string {
    const file = parseRelativePathField(raw, index, `groups[${groupIndex}].file`, "file");
    if (file.includes("/")) {
        throw new Error(`Feature entry at index ${index}: group at index ${groupIndex}: "file" must be a file name, not a nested path.`);
    }
    if (!file.toLowerCase().endsWith(".md")) {
        throw new Error(`Feature entry at index ${index}: group at index ${groupIndex}: "file" must end with ".md".`);
    }
    return file;
}

function parseContactGroupType(raw: unknown, index: number, groupIndex: number): ContactGroup["type"] {
    if (typeof raw !== "string" || !VALID_CONTACT_GROUP_TYPES.has(raw as ContactGroup["type"])) {
        throw new Error(`Feature entry at index ${index}: group at index ${groupIndex}: "type" must be "report" or "colleague".`);
    }
    return raw as ContactGroup["type"];
}

function parseRelativePathField(
    raw: unknown,
    index: number,
    field: string,
    kind: "file" | "folder",
): string {
    const expected = kind === "folder" ? "relative folder path" : "relative file path";
    if (typeof raw !== "string" || !raw.trim()) {
        throw new Error(`Feature entry at index ${index}: "${field}" must be a non-empty ${expected}.`);
    }

    const normalizedInput = normalizePath(raw.trim());
    const normalized = kind === "folder"
        ? normalizedInput.replace(/\/+$/, "")
        : normalizedInput;

    if (!normalized || normalized.startsWith("/")) {
        throw new Error(`Feature entry at index ${index}: "${field}" must be a ${expected}.`);
    }
    if (kind === "file" && normalized.endsWith("/")) {
        throw new Error(`Feature entry at index ${index}: "${field}" must be a ${expected}.`);
    }
    if (normalized.split("/").some((segment) => !segment || segment === "." || segment === "..")) {
        throw new Error(`Feature entry at index ${index}: "${field}" must be a ${expected}.`);
    }

    return kind === "folder" ? normalized + "/" : normalized;
}

function parseOptionalField<T>(
    raw: unknown,
    fallback: T,
    index: number,
    field: string,
    isValid: (v: unknown) => v is T,
    errorMessage: string,
): T {
    if (raw === undefined) {
        return fallback;
    }
    if (!isValid(raw)) {
        throw new Error(`Feature entry at index ${index}: "${field}" must be ${errorMessage}.`);
    }
    return raw;
}

/**
 * Validates decoration rules from raw YAML.
 * Returns an empty array if the section is absent.
 * Each rule must have a "filter" string; badge must be ≤2 chars; color must be non-empty if present.
 *
 * Kept as a standalone export so blueprints that ship only a decorations feature can be
 * validated in unit tests without exercising the full parseBlueprintYaml path.
 */
export function parseDecorationRules(raw: unknown): DecorationRule[] {
    if (raw === undefined || raw === null) {
        return [];
    }

    if (!Array.isArray(raw)) {
        throw new Error('"rules" must be an array.');
    }

    return raw.map((item: unknown, index: number) => {
        if (!item || typeof item !== "object") {
            throw new Error(`Decoration rule at index ${index} must be an object.`);
        }

        const rule = item as Record<string, unknown>;

        if (typeof rule["filter"] !== "string" || !rule["filter"]) {
            throw new Error(`Decoration rule at index ${index} is missing required string field "filter".`);
        }

        const result: DecorationRule = { filter: rule["filter"] as string };

        if (rule["color"] !== undefined) {
            if (typeof rule["color"] !== "string" || !rule["color"]) {
                throw new Error(`Decoration rule at index ${index}: "color" must be a non-empty string.`);
            }
            result.color = rule["color"] as string;
        }

        if (rule["badge"] !== undefined) {
            if (typeof rule["badge"] !== "string") {
                throw new Error(`Decoration rule at index ${index}: "badge" must be a string.`);
            }
            // Badge length is measured in Unicode code points, not JS string length,
            // to handle emoji badges correctly.
            if ([...rule["badge"] as string].length > 2) {
                throw new Error(`Decoration rule at index ${index}: "badge" must be ≤2 characters.`);
            }
            result.badge = rule["badge"] as string;
        }

        if (rule["tooltip"] !== undefined) {
            if (typeof rule["tooltip"] !== "string" || !rule["tooltip"]) {
                throw new Error(`Decoration rule at index ${index}: "tooltip" must be a non-empty string.`);
            }
            result.tooltip = rule["tooltip"] as string;
        }

        if (rule["propagate"] !== undefined) {
            if (typeof rule["propagate"] !== "boolean") {
                throw new Error(`Decoration rule at index ${index}: "propagate" must be a boolean.`);
            }
            result.propagate = rule["propagate"] as boolean;
        }

        return result;
    });
}

/**
 * Walks the workspace tree to collect all entries with a `default` scope
 * and returns two maps of parent folder path → file names array:
 * - `relative`: keys match any workspace root.
 * - `rootScoped`: keys are folder-relative; the engine prefixes them with
 *   the workspace root name before writing to disk.
 * File names are relative to the parent folder, not to the workspace root.
 * Multiple default files per folder are allowed.
 */
export function resolveDefaultFiles(entries: WorkspaceEntry[], prefix = ""): DefaultFileMap {
    const relative: Record<string, string[]> = {};
    const rootScoped: Record<string, string[]> = {};

    for (const entry of entries) {
        if (entry.default) {
            if (!prefix) {
                throw new Error(
                    `Top-level file "${entry.name}" cannot be marked as default. Only files inside a folder may be default.`
                );
            }
            const target = entry.default === "includingRoot" ? rootScoped : relative;
            if (!target[prefix]) {
                target[prefix] = [];
            }
            target[prefix].push(entry.name);
        }

        if (entry.children) {
            const childResults = resolveDefaultFiles(entry.children, prefix + entry.name);
            for (const [folder, files] of Object.entries(childResults.relative)) {
                if (!relative[folder]) {
                    relative[folder] = [];
                }
                relative[folder].push(...files);
            }
            for (const [folder, files] of Object.entries(childResults.rootScoped)) {
                if (!rootScoped[folder]) {
                    rootScoped[folder] = [];
                }
                rootScoped[folder].push(...files);
            }
        }
    }

    return { relative, rootScoped };
}
