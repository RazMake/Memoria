declare function acquireVsCodeApi(): { postMessage(msg: unknown): void };

export interface UITask {
    id: string;
    bodyHtml: string;
    bodyMarkdown: string;
    completedDate: string | null;
    sourceRelativePath: string | null;
}

export interface ContactTooltipEntry {
    text: string;
    briefHtml: string;
    detailedHtml: string;
}

export interface SnippetSuggestion {
    trigger: string;
    label: string;
    description?: string;
}

export type VsCodeApi = ReturnType<typeof acquireVsCodeApi>;

export function getVsCodeApi(): VsCodeApi {
    return acquireVsCodeApi();
}
