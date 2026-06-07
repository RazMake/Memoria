import type * as vscode from "vscode";
import { textDecoder, textEncoder } from "./encoding";

/**
 * Reads and parses a JSON file via the VS Code filesystem API.
 *
 * Returns `null` when the file is missing (read error) or contains invalid JSON.
 * When the file exists but cannot be parsed, `onParseError` is invoked so callers
 * can surface diagnostics (e.g. telemetry) while still receiving `null`.
 */
export async function readJsonFile<T>(
    fs: typeof vscode.workspace.fs,
    uri: vscode.Uri,
    onParseError?: (uri: vscode.Uri) => void,
): Promise<T | null> {
    let bytes: Uint8Array;
    try {
        bytes = await fs.readFile(uri);
    } catch {
        // File not found — expected when optional config files don't exist yet.
        return null;
    }

    try {
        return JSON.parse(textDecoder.decode(bytes)) as T;
    } catch {
        // The file exists but holds invalid JSON — unexpected; let the caller log it.
        onParseError?.(uri);
        return null;
    }
}

/** Serializes a value as pretty-printed JSON and writes it via the VS Code filesystem API. */
export async function writeJsonFile(
    fs: typeof vscode.workspace.fs,
    uri: vscode.Uri,
    value: unknown,
): Promise<void> {
    await fs.writeFile(uri, textEncoder.encode(JSON.stringify(value, null, 2)));
}
