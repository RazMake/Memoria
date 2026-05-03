/**
 * Converts a markdown heading text to a URL-safe slug.
 * Mirrors the algorithm used by GitHub / VS Code markdown preview.
 */
export function toHeadingSlug(headingText: string): string {
    return headingText
        .trim()
        .toLowerCase()
        .replace(/[^\w\s-]/g, "")
        .replace(/\s+/g, "-");
}
