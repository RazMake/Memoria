/**
 * Shared path utilities for filesystem-safe normalization across the extension.
 *
 * A dedicated module prevents the same one-liner from being silently copied into
 * every feature that touches file paths, making future changes a single-point edit.
 */

/**
 * Converts Windows backslash separators to POSIX forward slashes.
 *
 * Required because VS Code workspace APIs always use POSIX paths internally
 * (e.g. Uri.path), but Node.js path.relative() produces OS-native separators
 * on Windows, causing key mismatches in the task index and default-files config.
 */
export function normalizePath(value: string): string {
    return value.replace(/\\/g, "/");
}

/** Removes a trailing forward slash from a string, if present. */
export function stripTrailingSlash(value: string): string {
    return value.endsWith("/") ? value.slice(0, -1) : value;
}

/**
 * Converts arbitrary text into a filesystem-safe, URL-friendly slug.
 * Lowercase, replaces spaces/underscores with hyphens, strips non-alphanumeric
 * characters (except hyphens and dots), collapses runs of hyphens, and trims
 * leading/trailing hyphens.  Dots are preserved so file extensions survive.
 */
export function slugifyFilename(text: string): string {
    return text
        .toLowerCase()
        .replace(/[\s_]+/g, "-")
        .replace(/[^a-z0-9\-\.]/g, "")
        .replace(/-{2,}/g, "-")
        .replace(/^-+|-+$/g, "");
}

/**
 * Appends `.md` when the filename contains no dot; leaves it unchanged otherwise.
 */
export function ensureMdExtension(filename: string): string {
    return filename.includes(".") ? filename : `${filename}.md`;
}
