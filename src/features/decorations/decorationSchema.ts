// Field metadata for DecorationRule — typed as Record<keyof DecorationRule, FieldMeta>
// so the compiler breaks the build if a field is added/removed from the interface
// without updating this map.

import type { DecorationRule } from "../../blueprints/types";

/** Describes a single field on the DecorationRule interface for IntelliSense. */
export interface FieldMeta {
    /** JSON value type. */
    type: "string" | "boolean";
    /** Human-readable description shown in the completion detail. */
    description: string;
    /** Whether the field is required (cannot be omitted). */
    required: boolean;
}

/**
 * One entry per `DecorationRule` field.  Adding or removing a property on
 * `DecorationRule` will cause a compile error here until this map is updated.
 */
export const DECORATION_RULE_FIELDS: Record<keyof DecorationRule, FieldMeta> = {
    filter: {
        type: "string",
        description: 'Path filter pattern — "FolderName/", "*.ext", or "exact/path"',
        required: true,
    },
    color: {
        type: "string",
        description: "VS Code theme color identifier (e.g. \"charts.yellow\")",
        required: false,
    },
    badge: {
        type: "string",
        description: "Short text badge (1–2 characters) shown in the Explorer",
        required: false,
    },
    tooltip: {
        type: "string",
        description: "Hover tooltip shown on the decorated item in the Explorer",
        required: false,
    },
    propagate: {
        type: "boolean",
        description: "When true, children of a matching folder inherit the decoration",
        required: false,
    },
};
