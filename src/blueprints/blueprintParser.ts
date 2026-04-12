// Parses and validates blueprint.yaml content into typed structures.
// Pure functions — no VS Code API dependency — so this module is fully unit-testable in isolation.
// Validation happens at parse time (fail-fast before any filesystem operations touch the workspace).

import { parse } from "yaml";
import type { BlueprintDefinition, BlueprintFeature, WorkspaceEntry, DecorationRule, DefaultFileMap, DefaultScope } from "./types";

const VALID_DEFAULT_SCOPES: ReadonlySet<string> = new Set<DefaultScope>(["relative", "includingRoot"]);

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

        switch (id) {
            case "decorations":
                return {
                    id,
                    name: entry["name"] as string,
                    description: entry["description"] as string,
                    enabledByDefault: entry["enabledByDefault"] as boolean,
                    rules: parseDecorationRules(entry["rules"]),
                };
            default:
                throw new Error(`Feature entry at index ${index}: unknown feature id "${id}".`);
        }
    });
}

/**
 * Validates decoration rules from raw YAML.
 * Returns an empty array if the section is absent.
 * Each rule must have a "filter" string; badge must be ≤2 chars; color must be non-empty if present.
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
