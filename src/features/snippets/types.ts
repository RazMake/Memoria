import type * as vscode from "vscode";
import type { ResolvedContact } from "../contacts/contactUtils";

export interface SnippetParameter {
    name: string;
    options?: string[];
    default?: string;
}

export interface SnippetDefinition {
    trigger: string;
    label: string;
    description?: string;
    filterText?: string;
    glob: string;
    body?: string;
    parameters?: SnippetParameter[];
    expand?: (ctx: SnippetContext) => string;
    pathSafe?: boolean;
}

export interface SnippetContext {
    document: vscode.TextDocument | null;
    position: vscode.Position | null;
    params: Record<string, string>;
    contacts: ResolvedContact[];
}

export interface LoadedSnippetFile {
    filePath: string;
    isBuiltIn: boolean;
    snippets: SnippetDefinition[];
    error?: string;
}

export interface SnippetSuggestion {
    trigger: string;
    label: string;
    description?: string;
}
