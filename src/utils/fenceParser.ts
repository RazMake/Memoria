import { escapeRegExp } from "./regex";

const FENCE_RE = /^(`{3,}|~{3,})/;

export interface FenceState {
    marker: "`" | "~";
    length: number;
}

export function parseFenceState(line: string): FenceState | null {
    const match = FENCE_RE.exec(line.trimStart());
    if (!match) {
        return null;
    }
    return {
        marker: match[1][0] as "`" | "~",
        length: match[1].length,
    };
}

export function isFenceBoundary(line: string, fence: FenceState): boolean {
    return new RegExp(`^${escapeRegExp(fence.marker)}{${fence.length},}`).test(line.trimStart());
}
