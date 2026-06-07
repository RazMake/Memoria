import * as vscode from "vscode";
import { getNonce } from "./webview";

export interface PreparedWebview {
    /** Fresh CSP nonce for this webview's inline script/style tags. */
    nonce: string;
    /** Webview-safe URIs for the requested dist-relative files, in the order requested. */
    uris: vscode.Uri[];
}

/**
 * Configures a webview for script execution scoped to the extension's `dist/` folder, resolves
 * the given dist-relative files (e.g. `"webview.js"`, `"webview.css"`) to webview-safe URIs, and
 * generates a CSP nonce.
 *
 * Centralizes the `options` + `asWebviewUri` + `getNonce` boilerplate that every webview provider
 * (todo editor, contacts view, conflict resolver) would otherwise repeat.
 */
export function prepareWebview(
    webview: vscode.Webview,
    extensionUri: vscode.Uri,
    files: string[],
): PreparedWebview {
    const distUri = vscode.Uri.joinPath(extensionUri, "dist");
    webview.options = {
        enableScripts: true,
        localResourceRoots: [distUri],
    };
    const uris = files.map((file) => webview.asWebviewUri(vscode.Uri.joinPath(distUri, file)));
    return { nonce: getNonce(), uris };
}
