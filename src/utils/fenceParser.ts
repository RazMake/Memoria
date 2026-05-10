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
    const trimmed = line.trimStart();
    const ch = fence.marker;
    let count = 0;
    for (let i = 0; i < trimmed.length; i++) {
        if (trimmed[i] === ch) count++;
        else break;
    }
    return count >= fence.length;
}
