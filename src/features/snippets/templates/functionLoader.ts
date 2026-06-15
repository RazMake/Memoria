/**
 * Loads user-authored template function .ts files via the shared sandbox.
 * No vscode imports. Imports from sandbox.ts (which has no vscode dependency).
 */

import { compileSource } from "../sandbox";
import { RESERVED_BUILTIN_NAMES } from "./coreBuiltins";
import type { TemplateFunction } from "./templateTypes";

/** Module name exposed to user function files. */
export const TEMPLATE_MODULE_NAME = "memoria-templates";

/**
 * Compiles and evaluates a TypeScript source string as user template functions.
 * Returns the validated TemplateFunction array.
 * Throws if any function name collides with a built-in or another function in this file.
 */
export function compileFunctionSource(
    source: string,
    modulePayload: Record<string, unknown>,
): TemplateFunction[] {
    const exported = compileSource(source, {
        module: TEMPLATE_MODULE_NAME,
        payload: modulePayload,
    });

    const functions: TemplateFunction[] = [];
    for (const value of exported) {
        if (isValidTemplateFunction(value)) {
            functions.push(value as TemplateFunction);
        }
    }

    return functions;
}

/**
 * Validates that the loaded function set has no name collisions.
 * Throws a descriptive error if a user function shadows a built-in or a sibling function.
 */
export function validateFunctions(
    userFunctions: TemplateFunction[],
    existingNames: ReadonlySet<string> = new Set(),
): void {
    const seen = new Set<string>(existingNames);

    for (const fn of userFunctions) {
        if (RESERVED_BUILTIN_NAMES.has(fn.name)) {
            throw new Error(
                `User function "${fn.name}" conflicts with a reserved built-in name. ` +
                `Choose a different name for your function.`
            );
        }
        if (seen.has(fn.name)) {
            throw new Error(
                `Duplicate function name "${fn.name}" — each function must have a unique name.`
            );
        }
        seen.add(fn.name);
    }
}

// ── Validation ───────────────────────────────────────────────────────────────

function isValidTemplateFunction(value: unknown): boolean {
    if (!value || typeof value !== "object") return false;
    const obj = value as Record<string, unknown>;
    return typeof obj["name"] === "string"
        && typeof obj["describeInputs"] === "function"
        && typeof obj["resolve"] === "function";
}
