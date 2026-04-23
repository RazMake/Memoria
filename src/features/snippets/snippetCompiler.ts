import * as vscode from "vscode";
import { transform } from "sucrase";
import type { SnippetDefinition } from "./types";
import * as dateUtils from "./dateUtils";

// Blocked Node.js built-ins that snippet files must not require.
const BLOCKED_MODULES = new Set([
    "fs", "child_process", "net", "os", "http", "https",
    "dgram", "cluster", "worker_threads", "vm",
]);

/**
 * Compiles a single .ts snippet file to JavaScript and evaluates it,
 * returning the exported SnippetDefinition array.
 */
export async function compileSnippetFile(
    fileUri: vscode.Uri,
    fs: typeof vscode.workspace.fs,
): Promise<SnippetDefinition[]> {
    const bytes = await fs.readFile(fileUri);
    const source = new TextDecoder().decode(bytes);

    const result = transform(source, {
        transforms: ["typescript", "imports"],
    });

    const module = { exports: {} as Record<string, unknown> };
    const fn = new Function("module", "exports", "require", result.code);
    fn(module, module.exports, createSafeRequire());

    const exported = (module.exports as Record<string, unknown>)["default"] ?? module.exports;
    const definitions = Array.isArray(exported) ? exported : [exported];

    return definitions.filter(isValidSnippetDefinition);
}

function createSafeRequire(): (id: string) => unknown {
    return (id: string): unknown => {
        if (id === "memoria-snippets") {
            return {
                elapsedSince: dateUtils.elapsedSince,
                formatElapsed: dateUtils.formatElapsed,
                formatDate: dateUtils.formatDate,
                formatTime: dateUtils.formatTime,
            };
        }
        if (BLOCKED_MODULES.has(id)) {
            throw new Error(`Snippet files cannot require "${id}".`);
        }
        throw new Error(`Unknown module "${id}" — snippet files can only import "memoria-snippets".`);
    };
}

function isValidSnippetDefinition(value: unknown): value is SnippetDefinition {
    if (!value || typeof value !== "object") return false;
    const obj = value as Record<string, unknown>;
    return typeof obj["trigger"] === "string"
        && typeof obj["label"] === "string"
        && typeof obj["glob"] === "string"
        && (obj["body"] === undefined || typeof obj["body"] === "string")
        && (obj["expand"] === undefined || typeof obj["expand"] === "function");
}
