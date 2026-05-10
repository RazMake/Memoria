import type { SnippetSuggestion } from "../snippets/types";

export type { SnippetSuggestion };

export interface UITask {
    id: string;
    bodyHtml: string;
    bodyMarkdown: string;
    completedDate: string | null;
    sourceRelativePath: string | null;
}

export interface ContactTooltipEntry {
    /** The text to match in rendered task bodies. */
    text: string;
    /** Pre-rendered HTML for the brief tooltip. */
    briefHtml: string;
    /** Pre-rendered HTML for the detailed tooltip (differs for report contacts). */
    detailedHtml: string;
}

export interface LinkSuggestion {
    /** Display label (filename or heading text). */
    label: string;
    /** Text to insert. */
    insertText: string;
    /** Optional description (e.g. folder path). */
    description?: string;
    action?: 'createFile';
}

export type ToWebviewMessage =
    | { type: 'update'; active: UITask[]; completed: UITask[] }
    | { type: 'syncDone' }
    | { type: 'snippetSuggestions'; items: SnippetSuggestion[] }
    | { type: 'snippetResult'; text: string }
    | { type: 'contactTooltips'; entries: ContactTooltipEntry[] }
    | { type: 'linkSuggestions'; items: LinkSuggestion[]; queryId?: number }
    | { type: 'fileCreated'; insertPath: string };

export type ToExtensionMessage =
    | { type: 'ready' }
    | { type: 'reorder'; ids: string[] }
    | { type: 'complete'; id: string }
    | { type: 'uncomplete'; id: string }
    | { type: 'addTask'; text: string }
    | { type: 'editTask'; id: string; newBody: string }
    | { type: 'openSource'; id: string }
    | { type: 'openSourceInPlace'; id: string }
    | { type: 'toggleSubtask'; id: string; index: number }
    | { type: 'deleteTask'; id: string }
    | { type: 'scan' }
    | { type: 'snippetQuery'; prefix: string }
    | { type: 'snippetAccept'; trigger: string; selectedText?: string }
    | { type: 'openLink'; href: string }
    | { type: 'linkPathQuery'; prefix: string; queryId?: number }
    | { type: 'linkHeadingQuery'; path: string; prefix: string; queryId?: number }
    | { type: 'createLinkedFile'; linkText: string; dirPrefix: string };
