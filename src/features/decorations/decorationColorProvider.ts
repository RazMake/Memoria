// DocumentColorProvider for .memoria/decorations.json — shows inline color
// swatches next to theme color identifiers and maps picked colors back to the
// closest theme color name.
//
// WHY: VS Code's color picker activates when a DocumentColorProvider returns a
// ColorInformation for the cursor range. Wiring this to decorations.json lets
// the user visually browse and pick decoration colors without leaving the JSON editor.

import * as vscode from "vscode";
import { parseTree, findNodeAtLocation, type Node } from "jsonc-parser";
import { THEME_COLOR_MAP, hexToRgb, findClosestThemeColor } from "./themeColors";

export class DecorationColorProvider implements vscode.DocumentColorProvider {
    provideDocumentColors(document: vscode.TextDocument): vscode.ColorInformation[] {
        try {
        const text = document.getText();
        const root = parseTree(text);
        if (!root) {
            return [];
        }

        const rulesNode = findNodeAtLocation(root, ["rules"]);
        if (!rulesNode || rulesNode.type !== "array" || !rulesNode.children) {
            return [];
        }

        const colors: vscode.ColorInformation[] = [];

        for (const ruleNode of rulesNode.children) {
            if (ruleNode.type !== "object" || !ruleNode.children) {
                continue;
            }

            const colorProp = findNodeAtLocation(ruleNode, ["color"]);
            if (!colorProp || colorProp.type !== "string" || typeof colorProp.value !== "string") {
                continue;
            }

            const entry = THEME_COLOR_MAP.get(colorProp.value);
            if (!entry) {
                continue;
            }

            const rgb = hexToRgb(entry.hex);

            // colorProp.offset and colorProp.length include the surrounding quotes,
            // so we place the swatch on the quoted string value.
            const startPos = document.positionAt(colorProp.offset);
            const endPos = document.positionAt(colorProp.offset + colorProp.length);
            const range = new vscode.Range(startPos, endPos);

            colors.push(
                new vscode.ColorInformation(
                    range,
                    new vscode.Color(rgb.r / 255, rgb.g / 255, rgb.b / 255, 1),
                ),
            );
        }

        return colors;
        } catch {
            // Color swatches are a nice-to-have; a malformed decorations.json should
            // not surface as an unhandled rejection.
            return [];
        }
    }

    provideColorPresentations(
        color: vscode.Color,
        context: { readonly document: vscode.TextDocument; readonly range: vscode.Range },
    ): vscode.ColorPresentation[] {
        const r = Math.round(color.red * 255);
        const g = Math.round(color.green * 255);
        const b = Math.round(color.blue * 255);
        const closest = findClosestThemeColor(r, g, b);

        const presentation = new vscode.ColorPresentation(`"${closest.id}"`);
        // Replace the entire quoted string (the range already covers quotes).
        presentation.textEdit = new vscode.TextEdit(context.range, `"${closest.id}"`);
        presentation.label = closest.id;
        return [presentation];
    }
}
