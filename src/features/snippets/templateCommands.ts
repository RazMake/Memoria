/**
 * Template commands: insert, render-to-file, render-to-clipboard, expandTemplate.
 * These commands integrate the template engine with VS Code.
 */

import * as vscode from "vscode";
import type { TemplateFunction } from "./templates/templateTypes";
import type { RenderResult } from "./templates/templateTypes";
import { renderTemplate } from "./templates/templateEngine";
import { VsCodeInputResolver } from "./vscodeInputResolver";
import { showWarning } from "../../utils/uiMessages";

export interface TemplateProvider {
    /** Returns all available templates as { relativePath, templateText } entries. */
    listTemplates(): Array<{ relativePath: string; title: string | null }>;
    /** Reads template text by relative path. */
    readTemplate(relativePath: string): Promise<string>;
    /** Returns the registered template functions (host built-ins + user functions). */
    getFunctions(): TemplateFunction[];
}

// ── QuickPick template selector ───────────────────────────────────────────────

async function pickTemplate(
    provider: TemplateProvider,
): Promise<{ relativePath: string; templateText: string } | undefined> {
    const templates = provider.listTemplates();
    if (templates.length === 0) {
        vscode.window.showInformationMessage("No templates found in the templates folder.");
        return undefined;
    }

    const items = templates.map((t) => ({
        label: t.title ?? t.relativePath,
        description: t.title ? t.relativePath : undefined,
        relativePath: t.relativePath,
    }));

    const picked = await vscode.window.showQuickPick(items, {
        placeHolder: "Select a template",
        matchOnDescription: true,
    });

    if (!picked) return undefined;

    const templateText = await provider.readTemplate(picked.relativePath);
    return { relativePath: picked.relativePath, templateText };
}

// ── Render helper ─────────────────────────────────────────────────────────────

async function resolveAndRender(
    provider: TemplateProvider,
    templateText: string,
): Promise<RenderResult | undefined> {
    const inputResolver = new VsCodeInputResolver();
    try {
        const result = await renderTemplate({
            templateText,
            inputResolver,
            functions: provider.getFunctions(),
        });

        if (result.diagnostics.length > 0) {
            showWarning(`Template diagnostics: ${result.diagnostics.join("; ")}`);
        }

        return result;
    } catch (err) {
        const message = (err as Error).message ?? "Unknown error";
        showWarning(`Template error: ${message}`);
        return undefined;
    }
}

// ── Commands ─────────────────────────────────────────────────────────────────

/**
 * memoria.expandTemplate — triggered by the {template} completion item.
 * Inserts rendered text at the active cursor position (replacing the trigger range).
 */
export function createExpandTemplateCommand(
    provider: TemplateProvider,
): (triggerUri: string, triggerLine: number, triggerChar: number) => Promise<void> {
    return async (triggerUri: string, triggerLine: number, triggerChar: number) => {
        const picked = await pickTemplate(provider);
        if (!picked) return;

        const rendered = await resolveAndRender(provider, picked.templateText);
        if (!rendered) return;

        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            await vscode.env.clipboard.writeText(rendered.text);
            vscode.window.showInformationMessage("Template rendered to clipboard (no active editor).");
            return;
        }

        // Replace the trigger range with the rendered text
        await editor.edit((editBuilder) => {
            const triggerPos = new vscode.Position(triggerLine, triggerChar);
            const cursorPos = editor.selection.active;
            const range = new vscode.Range(triggerPos, cursorPos);
            editBuilder.replace(range, rendered.text);
        });
    };
}

/**
 * memoria.insertTemplate — Command Palette command.
 * Inserts rendered text at the active cursor, or copies to clipboard if no editor.
 */
export function createInsertTemplateCommand(
    provider: TemplateProvider,
): () => Promise<void> {
    return async () => {
        const picked = await pickTemplate(provider);
        if (!picked) return;

        const rendered = await resolveAndRender(provider, picked.templateText);
        if (!rendered) return;

        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            await vscode.env.clipboard.writeText(rendered.text);
            vscode.window.showInformationMessage("Template rendered to clipboard (no active editor).");
            return;
        }

        await editor.edit((editBuilder) => {
            editBuilder.insert(editor.selection.active, rendered.text);
        });
    };
}

/**
 * memoria.renderTemplateToFile — renders template to a new untitled document.
 */
export function createRenderTemplateToFileCommand(
    provider: TemplateProvider,
): () => Promise<void> {
    return async () => {
        const picked = await pickTemplate(provider);
        if (!picked) return;

        const rendered = await resolveAndRender(provider, picked.templateText);
        if (!rendered) return;

        const doc = await vscode.workspace.openTextDocument({
            content: rendered.text,
            language: "markdown",
        });
        await vscode.window.showTextDocument(doc);
    };
}

/**
 * memoria.renderTemplateToClipboard — renders template and copies to clipboard.
 */
export function createRenderTemplateToClipboardCommand(
    provider: TemplateProvider,
): () => Promise<void> {
    return async () => {
        const picked = await pickTemplate(provider);
        if (!picked) return;

        const rendered = await resolveAndRender(provider, picked.templateText);
        if (!rendered) return;

        await vscode.env.clipboard.writeText(rendered.text);
        vscode.window.showInformationMessage("Template rendered to clipboard.");
    };
}
