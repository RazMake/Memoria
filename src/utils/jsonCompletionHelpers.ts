/**
 * Shared helpers for JSON-based CompletionItemProviders that use jsonc-parser.
 *
 * Both decorationCompletionProvider and defaultFileCompletionProvider need to
 * parse cursor context inside JSON documents, extract partial string values,
 * and compute replace ranges. These low-level operations are schema-agnostic
 * and live here to avoid duplicating the same substring arithmetic.
 */

import { getLocation, type Location } from "jsonc-parser";
import * as vscode from "vscode";

/**
 * Parses the JSON document at the cursor position and returns the location context.
 */
export function getJsonLocation(document: vscode.TextDocument, position: vscode.Position): { text: string; offset: number; location: Location } {
    const text = document.getText();
    const offset = document.offsetAt(position);
    const location = getLocation(text, offset);
    return { text, offset, location };
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

/**
 * Computes the replace range for a completion inside a JSON string value.
 * Starts from the opening quote + 1 and extends to the closing quote (or cursor).
 */
export function getStringValueRange(document: vscode.TextDocument, position: vscode.Position, partialValue: string): vscode.Range {
    const startPos = position.translate(0, -partialValue.length);
    // Check if the next character is a closing quote — if so, include it in the range.
    const lineText = document.lineAt(position.line).text;
    const endCharOffset = lineText[position.character] === '"' ? 1 : 0;
    const endPos = position.translate(0, endCharOffset);
    return new vscode.Range(startPos, endPos);
}
