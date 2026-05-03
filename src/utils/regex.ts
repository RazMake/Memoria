/**
 * Regex utilities shared across modules that need to escape user-supplied
 * strings for safe interpolation into RegExp patterns.
 */

/** Escapes all regex metacharacters in a string so it can be safely used inside `new RegExp(...)`. */
export function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
