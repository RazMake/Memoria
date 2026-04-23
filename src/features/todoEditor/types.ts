export interface UITask {
    id: string;
    bodyHtml: string;
    bodyMarkdown: string;
    completedDate: string | null;
    sourceRelativePath: string | null;
}

export interface SnippetSuggestion {
    trigger: string;
    label: string;
    description?: string;
}

export type ToWebviewMessage =
    | { type: 'update'; active: UITask[]; completed: UITask[] }
    | { type: 'syncDone' }
    | { type: 'snippetSuggestions'; items: SnippetSuggestion[] }
    | { type: 'snippetResult'; text: string };

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
    | { type: 'snippetAccept'; trigger: string; selectedText?: string };
