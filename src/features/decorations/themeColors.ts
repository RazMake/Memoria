// Catalog of VS Code built-in theme color IDs with approximate hex values (Dark+ theme).
// Used by the completion and color-preview providers for decorations.json.
//
// WHY hex values are approximated from Dark+: VS Code does not expose the resolved RGB
// value of a theme color token at extension runtime. Hardcoding Dark+ approximations is
// the only practical way to show inline swatches. Exact values vary by the user's active
// color theme, but the approximations are close enough for the nearest-color lookup used
// in provideColorPresentations — the well-separated colors in the catalog mean a small
// offset rarely picks the wrong name.

/** A VS Code built-in theme color with an approximate hex representation. */
export interface ThemeColorEntry {
    /** Theme color identifier, e.g. "charts.yellow". */
    id: string;
    /** Approximate hex color from the Dark+ theme, e.g. "#CCA700". */
    hex: string;
    /** Human-readable description of the color's intended use. */
    description: string;
    /** Grouping category for sort ordering in completions. */
    category: string;
}

/**
 * Comprehensive catalog of VS Code built-in theme colors useful for file decorations.
 * Hex values are approximations from the default Dark+ theme — actual rendered colors
 * vary by the user's active color theme.
 */
export const THEME_COLORS: readonly ThemeColorEntry[] = [
    // ── Charts ──────────────────────────────────────────────────────────────
    { id: "charts.foreground", hex: "#CCCCCC", description: "Contrast color for text in charts", category: "Charts" },
    { id: "charts.lines", hex: "#CCCCCC", description: "Color for lines in charts", category: "Charts" },
    { id: "charts.red", hex: "#F14C4C", description: "Red elements in charts", category: "Charts" },
    { id: "charts.blue", hex: "#3794FF", description: "Blue elements in charts", category: "Charts" },
    { id: "charts.yellow", hex: "#CCA700", description: "Yellow elements in charts", category: "Charts" },
    { id: "charts.orange", hex: "#D18616", description: "Orange elements in charts", category: "Charts" },
    { id: "charts.green", hex: "#89D185", description: "Green elements in charts", category: "Charts" },
    { id: "charts.purple", hex: "#B180D7", description: "Purple elements in charts", category: "Charts" },
    { id: "charts.grey", hex: "#808080", description: "Grey elements in charts", category: "Charts" },

    // ── Git Decorations ─────────────────────────────────────────────────────
    { id: "gitDecoration.addedResourceForeground", hex: "#81B88B", description: "Added Git resources", category: "Git" },
    { id: "gitDecoration.modifiedResourceForeground", hex: "#E2C08D", description: "Modified Git resources", category: "Git" },
    { id: "gitDecoration.deletedResourceForeground", hex: "#C74E39", description: "Deleted Git resources", category: "Git" },
    { id: "gitDecoration.renamedResourceForeground", hex: "#73C991", description: "Renamed or copied Git resources", category: "Git" },
    { id: "gitDecoration.untrackedResourceForeground", hex: "#73C991", description: "Untracked Git resources", category: "Git" },
    { id: "gitDecoration.ignoredResourceForeground", hex: "#8C8C8C", description: "Ignored Git resources", category: "Git" },
    { id: "gitDecoration.conflictingResourceForeground", hex: "#E4676B", description: "Conflicting Git resources", category: "Git" },
    { id: "gitDecoration.stageModifiedResourceForeground", hex: "#E2C08D", description: "Staged modifications", category: "Git" },
    { id: "gitDecoration.stageDeletedResourceForeground", hex: "#C74E39", description: "Staged deletions", category: "Git" },
    { id: "gitDecoration.submoduleResourceForeground", hex: "#8DB9E2", description: "Submodule resources", category: "Git" },

    // ── Terminal ANSI ───────────────────────────────────────────────────────
    { id: "terminal.ansiBlack", hex: "#000000", description: "ANSI Black in terminal", category: "Terminal" },
    { id: "terminal.ansiRed", hex: "#CD3131", description: "ANSI Red in terminal", category: "Terminal" },
    { id: "terminal.ansiGreen", hex: "#0DBC79", description: "ANSI Green in terminal", category: "Terminal" },
    { id: "terminal.ansiYellow", hex: "#E5E510", description: "ANSI Yellow in terminal", category: "Terminal" },
    { id: "terminal.ansiBlue", hex: "#2472C8", description: "ANSI Blue in terminal", category: "Terminal" },
    { id: "terminal.ansiMagenta", hex: "#BC3FBC", description: "ANSI Magenta in terminal", category: "Terminal" },
    { id: "terminal.ansiCyan", hex: "#11A8CD", description: "ANSI Cyan in terminal", category: "Terminal" },
    { id: "terminal.ansiWhite", hex: "#E5E5E5", description: "ANSI White in terminal", category: "Terminal" },
    { id: "terminal.ansiBrightBlack", hex: "#666666", description: "ANSI Bright Black in terminal", category: "Terminal" },
    { id: "terminal.ansiBrightRed", hex: "#F14C4C", description: "ANSI Bright Red in terminal", category: "Terminal" },
    { id: "terminal.ansiBrightGreen", hex: "#23D18B", description: "ANSI Bright Green in terminal", category: "Terminal" },
    { id: "terminal.ansiBrightYellow", hex: "#F5F543", description: "ANSI Bright Yellow in terminal", category: "Terminal" },
    { id: "terminal.ansiBrightBlue", hex: "#3B8EEA", description: "ANSI Bright Blue in terminal", category: "Terminal" },
    { id: "terminal.ansiBrightMagenta", hex: "#D670D6", description: "ANSI Bright Magenta in terminal", category: "Terminal" },
    { id: "terminal.ansiBrightCyan", hex: "#29B8DB", description: "ANSI Bright Cyan in terminal", category: "Terminal" },
    { id: "terminal.ansiBrightWhite", hex: "#E5E5E5", description: "ANSI Bright White in terminal", category: "Terminal" },

    // ── List / Explorer ─────────────────────────────────────────────────────
    { id: "list.errorForeground", hex: "#F88070", description: "List items containing errors", category: "List" },
    { id: "list.warningForeground", hex: "#CCA700", description: "List items containing warnings", category: "List" },
    { id: "list.deemphasizedForeground", hex: "#8C8C8C", description: "Deemphasized list items", category: "List" },
    { id: "list.invalidItemForeground", hex: "#B89500", description: "Invalid list items (e.g. unresolved root)", category: "List" },

    // ── Problems / Diagnostics ──────────────────────────────────────────────
    { id: "problemsErrorIcon.foreground", hex: "#F14C4C", description: "Problems error icon", category: "Problems" },
    { id: "problemsWarningIcon.foreground", hex: "#CCA700", description: "Problems warning icon", category: "Problems" },
    { id: "problemsInfoIcon.foreground", hex: "#3794FF", description: "Problems info icon", category: "Problems" },

    // ── Testing ─────────────────────────────────────────────────────────────
    { id: "testing.iconPassed", hex: "#73C991", description: "Passed test icon", category: "Testing" },
    { id: "testing.iconFailed", hex: "#F14C4C", description: "Failed test icon", category: "Testing" },
    { id: "testing.iconErrored", hex: "#F14C4C", description: "Errored test icon", category: "Testing" },
    { id: "testing.iconSkipped", hex: "#848484", description: "Skipped test icon", category: "Testing" },
    { id: "testing.iconQueued", hex: "#CCA700", description: "Queued test icon", category: "Testing" },

    // ── Editor / Base ───────────────────────────────────────────────────────
    { id: "foreground", hex: "#CCCCCC", description: "Overall foreground color", category: "Base" },
    { id: "errorForeground", hex: "#F48771", description: "Overall error foreground", category: "Base" },
    { id: "descriptionForeground", hex: "#717171", description: "Description text foreground", category: "Base" },
    { id: "disabledForeground", hex: "#CCCCCC80", description: "Disabled element foreground", category: "Base" },

    // ── Editor Errors / Warnings ────────────────────────────────────────────
    { id: "editorError.foreground", hex: "#F14C4C", description: "Error squiggle foreground", category: "Editor" },
    { id: "editorWarning.foreground", hex: "#CCA700", description: "Warning squiggle foreground", category: "Editor" },
    { id: "editorInfo.foreground", hex: "#3794FF", description: "Info squiggle foreground", category: "Editor" },

    // ── Markdown Alerts ─────────────────────────────────────────────────────
    { id: "markdownAlert.note.foreground", hex: "#3794FF", description: "Note alert foreground", category: "Markdown" },
    { id: "markdownAlert.tip.foreground", hex: "#89D185", description: "Tip alert foreground", category: "Markdown" },
    { id: "markdownAlert.important.foreground", hex: "#B180D7", description: "Important alert foreground", category: "Markdown" },
    { id: "markdownAlert.warning.foreground", hex: "#CCA700", description: "Warning alert foreground", category: "Markdown" },
    { id: "markdownAlert.caution.foreground", hex: "#F14C4C", description: "Caution alert foreground", category: "Markdown" },
];

/** Lookup map for O(1) access by theme color ID. */
export const THEME_COLOR_MAP: ReadonlyMap<string, ThemeColorEntry> = new Map(
    THEME_COLORS.map((entry) => [entry.id, entry]),
);

/** Parse a "#RRGGBB" or "#RRGGBBAA" hex string into 0-255 RGB components. */
export function hexToRgb(hex: string): { r: number; g: number; b: number } {
    const h = hex.replace(/^#/, "");
    return {
        r: parseInt(h.substring(0, 2), 16),
        g: parseInt(h.substring(2, 4), 16),
        b: parseInt(h.substring(4, 6), 16),
    };
}

/** Find the theme color closest to the given 0-255 RGB values (Euclidean distance).
 * WHY Euclidean RGB distance: simple and fast; perceptual accuracy is not critical
 * here because the catalog contains a small set of well-separated named colors, so
 * the nearest match is almost always unambiguously correct regardless of the metric.
 */
export function findClosestThemeColor(r: number, g: number, b: number): ThemeColorEntry {
    let best = THEME_COLORS[0];
    let bestDist = Infinity;
    for (const entry of THEME_COLORS) {
        const c = hexToRgb(entry.hex);
        const dist = (c.r - r) ** 2 + (c.g - g) ** 2 + (c.b - b) ** 2;
        if (dist < bestDist) {
            bestDist = dist;
            best = entry;
        }
    }
    return best;
}
