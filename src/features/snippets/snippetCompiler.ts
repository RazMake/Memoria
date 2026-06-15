import * as vscode from "vscode";
import type { SnippetDefinition } from "./types";
import * as dateUtils from "../../utils/dateUtils";
import * as markdownUtils from "./markdownUtils";
import { textDecoder } from "../../utils/encoding";
import { compileSource } from "./sandbox";

/**
 * Compiles a single .ts snippet file to JavaScript and evaluates it,
 * returning the exported SnippetDefinition array.
 */
export async function compileSnippetFile(
    fileUri: vscode.Uri,
    fs: typeof vscode.workspace.fs,
): Promise<SnippetDefinition[]> {
    const bytes = await fs.readFile(fileUri);
    const source = textDecoder.decode(bytes);

    const definitions = compileSource(source, {
        module: "memoria-snippets",
        payload: {
            elapsedSince: dateUtils.elapsedSince,
            formatElapsed: dateUtils.formatElapsed,
            formatDate: dateUtils.formatDate,
            formatTime: dateUtils.formatTime,
            formatDueIn: dateUtils.formatDueIn,
            formatDueBy: dateUtils.formatDueBy,
            findFirstHeadingBelow: markdownUtils.findFirstHeadingBelow,
            parseHeadingChildren: markdownUtils.parseHeadingChildren,
            parseSubHeadings: markdownUtils.parseSubHeadings,
        },
    });

    return definitions.filter(isValidSnippetDefinition);
}

function isValidSnippetDefinition(value: unknown): value is SnippetDefinition {
    if (!value || typeof value !== "object") return false;
    const obj = value as Record<string, unknown>;
    return typeof obj["trigger"] === "string"
        && typeof obj["label"] === "string"
        && typeof obj["glob"] === "string"
        && (obj["body"] === undefined || typeof obj["body"] === "string")
        && (obj["expand"] === undefined || typeof obj["expand"] === "function")
        && (obj["visible"] === undefined || typeof obj["visible"] === "function");
}
