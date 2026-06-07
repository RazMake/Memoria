import * as vscode from "vscode";

/** Brand prefix applied to every user-facing Memoria notification. */
const PREFIX = "Memoria: ";

/** Shows a branded information message. Items are forwarded as action buttons. */
export function showInfo(message: string, ...items: string[]): Thenable<string | undefined> {
    return vscode.window.showInformationMessage(PREFIX + message, ...items);
}

/** Shows a branded warning message. Items are forwarded as action buttons. */
export function showWarning(message: string, ...items: string[]): Thenable<string | undefined> {
    return vscode.window.showWarningMessage(PREFIX + message, ...items);
}

/** Shows a branded error message. Items are forwarded as action buttons. */
export function showError(message: string, ...items: string[]): Thenable<string | undefined> {
    return vscode.window.showErrorMessage(PREFIX + message, ...items);
}
