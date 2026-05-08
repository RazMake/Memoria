import type { Location } from "jsonc-parser";

/** Returns true when the cursor is at a top-level property key, ignoring keys that start with `excludePrefix`. */
export function isTopLevelKey(loc: Location, excludePrefix: string): boolean {
    return loc.isAtPropertyKey && loc.path.length === 1 && typeof loc.path[0] === "string"
        && !loc.path[0].startsWith(excludePrefix);
}

/**
 * Extracts the partial string value at the cursor by searching backwards for the opening quote.
 */
export function extractPartialValue(text: string, offset: number): string {
    let i = offset - 1;
    while (i >= 0 && text[i] !== '"') {
        i--;
    }
    return i >= 0 ? text.substring(i + 1, offset) : "";
}
