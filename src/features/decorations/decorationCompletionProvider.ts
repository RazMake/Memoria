// Context-aware CompletionItemProvider for .memoria/decorations.json.
// Uses jsonc-parser to determine cursor position within the JSON tree and offers
// field names, color values, booleans, and filter pattern snippets as appropriate.

import * as vscode from "vscode";
import { getLocation, type Location } from "jsonc-parser";
import { DECORATION_RULE_FIELDS } from "./decorationSchema";
import { THEME_COLORS } from "./themeColors";

/** Document selector that matches only .memoria/decorations.json files. */
export const DECORATIONS_JSON_SELECTOR: vscode.DocumentSelector = {
    language: "json",
    scheme: "file",
    pattern: "**/.memoria/decorations.json",
};

export class DecorationCompletionProvider implements vscode.CompletionItemProvider {
    provideCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
    ): vscode.CompletionItem[] | undefined {
        const text = document.getText();
        const offset = document.offsetAt(position);
        const location = getLocation(text, offset);

        if (isTopLevelKey(location)) {
            return this.topLevelKeyCompletions();
        }

        if (isInsideRulesArray(location)) {
            if (isRulePropertyKey(location)) {
                return this.ruleFieldCompletions();
            }
            if (isRulePropertyValue(location, "color", text, offset)) {
                return this.colorValueCompletions();
            }
            if (isRulePropertyValue(location, "propagate", text, offset)) {
                return this.booleanValueCompletions();
            }
            if (isRulePropertyValue(location, "filter", text, offset)) {
                return this.filterValueCompletions();
            }
        }

        return undefined;
    }

    // ── Completion builders ─────────────────────────────────────────────

    private topLevelKeyCompletions(): vscode.CompletionItem[] {
        const item = new vscode.CompletionItem("rules", vscode.CompletionItemKind.Property);
        item.detail = "Array of decoration rules";
        item.insertText = new vscode.SnippetString('"rules": [\n\t{\n\t\t"filter": "$1"\n\t}\n]');
        return [item];
    }

    private ruleFieldCompletions(): vscode.CompletionItem[] {
        return Object.entries(DECORATION_RULE_FIELDS).map(([key, meta]) => {
            const item = new vscode.CompletionItem(key, vscode.CompletionItemKind.Property);
            item.detail = meta.required ? `(required) ${meta.type}` : `(optional) ${meta.type}`;
            item.documentation = new vscode.MarkdownString(meta.description);
            if (meta.type === "boolean") {
                item.insertText = new vscode.SnippetString(`"${key}": \${1|true,false|}`);
            } else {
                item.insertText = new vscode.SnippetString(`"${key}": "$1"`);
            }
            // Required fields sort first.
            item.sortText = meta.required ? `0_${key}` : `1_${key}`;
            return item;
        });
    }

    private colorValueCompletions(): vscode.CompletionItem[] {
        // Build a stable category order so that categories with a natural priority
        // (Charts first — most relevant for file decorations) appear above others.
        const categoryOrder: Record<string, string> = {
            Charts: "0",
            Git: "1",
            List: "2",
            Problems: "3",
            Testing: "4",
            Terminal: "5",
            Base: "6",
            Editor: "7",
            Markdown: "8",
        };

        return THEME_COLORS.map((entry) => {
            const item = new vscode.CompletionItem(entry.id, vscode.CompletionItemKind.Color);
            item.detail = entry.hex;
            item.documentation = new vscode.MarkdownString(
                `**${entry.category}** — ${entry.description}`,
            );
            item.insertText = entry.id;
            item.sortText = `${categoryOrder[entry.category] ?? "9"}_${entry.id}`;
            // Filtering: searching for "red" should match "charts.red" and "terminal.ansiRed".
            item.filterText = entry.id;
            return item;
        });
    }

    private booleanValueCompletions(): vscode.CompletionItem[] {
        return ["true", "false"].map((v) => {
            const item = new vscode.CompletionItem(v, vscode.CompletionItemKind.Value);
            item.detail = v === "true" ? "Children inherit this decoration" : "Only the matched item is decorated";
            return item;
        });
    }

    private filterValueCompletions(): vscode.CompletionItem[] {
        const folder = new vscode.CompletionItem("FolderName/", vscode.CompletionItemKind.Snippet);
        folder.detail = "Match a folder by name";
        folder.insertText = new vscode.SnippetString("${1:FolderName}/");

        const wildcard = new vscode.CompletionItem("*.extension", vscode.CompletionItemKind.Snippet);
        wildcard.detail = "Match files by extension";
        wildcard.insertText = new vscode.SnippetString("*.${1:md}");

        const exact = new vscode.CompletionItem("exact/path", vscode.CompletionItemKind.Snippet);
        exact.detail = "Match an exact workspace-relative path";
        exact.insertText = new vscode.SnippetString("${1:folder}/${2:file.md}");

        return [folder, wildcard, exact];
    }
}

// ── Location helpers ────────────────────────────────────────────────────

/**
 * Cursor is at a top-level property key position (e.g. completing "rules").
 * jsonc-parser reports path [""] with isAtPropertyKey when inside an object
 * before any key is typed.
 */
function isTopLevelKey(loc: Location): boolean {
    return loc.isAtPropertyKey && loc.path.length === 1 && typeof loc.path[0] === "string"
        && !loc.path[0].startsWith("rules");
}

/**
 * Cursor is anywhere inside the "rules" array (path starts with "rules", <index>).
 * jsonc-parser uses ["rules", 0, ...] when inside a rule object.
 */
function isInsideRulesArray(loc: Location): boolean {
    return loc.path.length >= 2 && loc.path[0] === "rules" && typeof loc.path[1] === "number";
}

/**
 * Cursor is at a property key position inside a rule object.
 * jsonc-parser reports path ["rules", 0, ""] or ["rules", 0, "<partial>"]
 * with isAtPropertyKey when the cursor is at a key position inside a rule.
 */
function isRulePropertyKey(loc: Location): boolean {
    return loc.path.length === 3 && loc.path[0] === "rules" && typeof loc.path[1] === "number"
        && loc.isAtPropertyKey;
}

/**
 * Cursor is at the value position for a specific property inside a rule object.
 * We check both the parsed location AND scan backwards from the cursor to find
 * the most recent property key — this handles the case where jsonc-parser reports
 * the path as ["rules", 0, "color"] even when the cursor is mid-string-value.
 */
function isRulePropertyValue(loc: Location, propertyName: string, text: string, offset: number): boolean {
    // Fast path: jsonc-parser resolved the property name.
    if (loc.path.length === 3 && loc.path[2] === propertyName && !loc.isAtPropertyKey) {
        return true;
    }
    // Fallback: look behind the cursor for "propertyName"\s*:\s* when the parser
    // path is still at depth 2 (hasn't resolved the key yet).
    if (loc.path.length >= 2 && loc.path[0] === "rules" && !loc.isAtPropertyKey) {
        const preceding = text.substring(Math.max(0, offset - 80), offset);
        const pattern = new RegExp(`"${propertyName}"\\s*:\\s*"?[^"]*$`);
        return pattern.test(preceding);
    }
    return false;
}
