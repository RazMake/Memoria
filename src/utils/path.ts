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
