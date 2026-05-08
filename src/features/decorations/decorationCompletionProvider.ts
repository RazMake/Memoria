// Context-aware CompletionItemProvider for .memoria/decorations.json.
//
// WHY this provider exists: generic JSON completion providers (e.g. the built-in JSON
// language server) do not know the Memoria decoration schema. This provider offers
// domain-specific completions — valid VS Code theme color names, propagate booleans,
// and filter pattern snippets — that the generic provider cannot infer.
//
// Uses jsonc-parser to determine cursor position within the JSON tree and offers
// field names, color values, booleans, and filter pattern snippets as appropriate.

import * as vscode from "vscode";
import { getLocation } from "jsonc-parser";
import { DECORATION_RULE_FIELDS } from "./decorationSchema";
import { CATEGORY_ORDER, THEME_COLORS } from "./themeColors";
import { isTopLevelKey } from "../../utils/jsonCompletionHelpers";

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
        // jsonc-parser is used (rather than JSON.parse) because decorations.json may
        // legally contain trailing commas or comments, which standard JSON.parse rejects.
        const text = document.getText();
        const offset = document.offsetAt(position);
        const location = getLocation(text, offset);

        if (isTopLevelKey(location, "rules")) {
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
        return THEME_COLORS.map((entry) => {
            const item = new vscode.CompletionItem(entry.id, vscode.CompletionItemKind.Color);
            item.detail = entry.hex;
            item.documentation = new vscode.MarkdownString(
                `**${entry.category}** — ${entry.description}`,
            );
            item.insertText = entry.id;
            item.sortText = `${CATEGORY_ORDER.get(entry.category) ?? 9}_${entry.id}`;
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

/** Pre-built regex cache for `isRulePropertyValue` fallback lookbehind, keyed by property name. */
const rulePropertyPatterns = new Map<string, RegExp>();
function getRulePropertyPattern(propertyName: string): RegExp {
    let pattern = rulePropertyPatterns.get(propertyName);
    if (!pattern) {
        pattern = new RegExp(`"${propertyName}"\\s*:\\s*"?[^"]*$`);
        rulePropertyPatterns.set(propertyName, pattern);
    }
    return pattern;
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
        return getRulePropertyPattern(propertyName).test(preceding);
    }
    return false;
}
