declare function acquireVsCodeApi(): { postMessage(msg: unknown): void };

export interface UITask {
    id: string;
    bodyHtml: string;
    bodyMarkdown: string;
    completedDate: string | null;
    sourceRelativePath: string | null;
}

export type VsCodeApi = ReturnType<typeof acquireVsCodeApi>;

export function getVsCodeApi(): VsCodeApi {
    return acquireVsCodeApi();
}
