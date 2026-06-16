/**
 * Pure {{name}} / {{name.a.b.c}} expression renderer.
 * No vscode imports. No Contacts types.
 */

import type { TemplateFunction } from "./templateTypes";

// ── Constants ─────────────────────────────────────────────────────────────────

/** Marker emitted when a reference can't be resolved. */
const UNKNOWN_MARKER = (ref: string) => `⚠️ template: unknown {{${ref}}}`;
/** Marker emitted when {{name}} resolves to an object with no display(). */
const NON_TEXT_MARKER = (ref: string) => `⚠️ template: {{${ref}}} is not text`;

// ── Reference expression regex ────────────────────────────────────────────────

const EXPR_RE = /\{\{([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*)}}/g;

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Substitutes all {{name}} and {{name.prop.sub}} references in `text` using `scope`.
 * Unknown references produce an inline error marker and add to `diagnostics`.
 * Objects with no matching `display()` also produce an inline error marker.
 */
export function renderExpressions(
    text: string,
    scope: Readonly<Record<string, unknown>>,
    functions: readonly TemplateFunction[],
    diagnostics: string[],
): string {
    return text.replace(EXPR_RE, (_match, path: string) => {
        return resolveExpression(path, scope, functions, diagnostics);
    });
}

/**
 * Resolves a single expression path (e.g. "candidate.fullName") against a scope.
 * Returns the string value or an inline error marker.
 */
export function resolveExpression(
    path: string,
    scope: Readonly<Record<string, unknown>>,
    functions: readonly TemplateFunction[],
    diagnostics: string[],
): string {
    const parts = path.split(".");
    const rootName = parts[0];

    if (!Object.hasOwn(scope, rootName)) {
        const marker = UNKNOWN_MARKER(path);
        diagnostics.push(`Unresolved expression {{${path}}}`);
        return marker;
    }

    let value: unknown = scope[rootName];

    if (parts.length === 1) {
        // {{name}} — attempt to stringify
        return stringifyValue(value, rootName, parts, functions, diagnostics);
    }

    // Navigate nested path
    for (let i = 1; i < parts.length; i++) {
        if (value === null || value === undefined) {
            const parentPath = parts.slice(0, i).join(".");
            const partialPath = parts.slice(0, i + 1).join(".");
            const marker = UNKNOWN_MARKER(partialPath);
            diagnostics.push(`Unresolved expression {{${partialPath}}} — ${parentPath} was not resolved`);
            return marker;
        }

        if (typeof value !== "object") {
            const partialPath = parts.slice(0, i + 1).join(".");
            const marker = UNKNOWN_MARKER(partialPath);
            diagnostics.push(`Unresolved expression {{${partialPath}}}`);
            return marker;
        }

        const obj = value as Record<string, unknown>;
        const key = parts[i];
        if (!Object.hasOwn(obj, key)) {
            const parentPath = parts.slice(0, i).join(".");
            const partialPath = parts.slice(0, i + 1).join(".");
            const marker = UNKNOWN_MARKER(partialPath);
            const available = Object.keys(obj);
            const hint = available.length > 0
                ? `${parentPath} has: ${available.join(", ")}`
                : `${parentPath} has no properties`;
            diagnostics.push(`Unresolved expression {{${partialPath}}} — ${hint}`);
            return marker;
        }

        value = obj[key];
    }

    return stringifyLeaf(value, path, diagnostics);
}

// ── Private helpers ──────────────────────────────────────────────────────────

function stringifyValue(
    value: unknown,
    name: string,
    _parts: string[],
    functions: readonly TemplateFunction[],
    diagnostics: string[],
): string {
    if (typeof value === "string") return value;
    if (typeof value === "number" || typeof value === "boolean") return String(value);

    // Look for a display() function
    const fn = functions.find((f) => f.name === name);
    if (fn?.display) {
        return fn.display(value);
    }

    const marker = NON_TEXT_MARKER(name);
    diagnostics.push(`Expression {{${name}}} cannot be displayed as text`);
    return marker;
}

function stringifyLeaf(value: unknown, path: string, diagnostics: string[]): string {
    if (value === null || value === undefined) {
        const marker = UNKNOWN_MARKER(path);
        diagnostics.push(`Unresolved expression {{${path}}}`);
        return marker;
    }
    if (typeof value === "string") return value;
    if (typeof value === "number" || typeof value === "boolean") return String(value);

    // Objects at leaf level — non-text marker
    const marker = NON_TEXT_MARKER(path);
    diagnostics.push(`Expression {{${path}}} cannot be displayed as text`);
    return marker;
}
