/**
 * Shared markdown file-type detection utilities.
 *
 * Centralised here so every feature that needs to check whether a path
 * points to a markdown file uses the same logic, avoiding scattered
 * inline `.endsWith(".md")` checks that are easy to get subtly wrong
 * (e.g. forgetting case-insensitive comparison).
 */

/** Returns `true` when the given path (URI path or filesystem path) ends with `.md` (case-insensitive). */
export function isMarkdownPath(value: string): boolean {
    return value.toLowerCase().endsWith(".md");
}
