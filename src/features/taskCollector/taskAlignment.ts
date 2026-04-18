import { createHash } from "node:crypto";
import type { AlignmentResult, ExistingTaskSnapshot, TaskSnapshot } from "./types";

interface CandidatePair {
    oldIndex: number;
    newIndex: number;
    score: number;
}

export function normalizeTaskBody(body: string): string {
    const lines = body.split("\n").map((line) => line.replace(/[ \t]+$/g, ""));

    while (lines.length > 0 && lines[lines.length - 1] === "") {
        lines.pop();
    }

    const collapsed: string[] = [];
    for (const line of lines) {
        if (line === "" && collapsed[collapsed.length - 1] === "") {
            continue;
        }
        collapsed.push(line);
    }

    return collapsed.join("\n");
}

export function computeTaskFingerprint(body: string): string {
    const digest = createHash("sha256").update(normalizeTaskBody(body)).digest("hex");
    return `sha256:${digest}`;
}

export function alignTaskSequences(
    oldSeq: ExistingTaskSnapshot[],
    newSeq: TaskSnapshot[],
): AlignmentResult {
    const newIndexToId = new Map<number, string>();
    const matchedOld = new Set<number>();
    const matchedNew = new Set<number>();

    matchByFingerprint(oldSeq, newSeq, matchedOld, matchedNew, newIndexToId);
    matchBySignature(oldSeq, newSeq, matchedOld, matchedNew, newIndexToId);

    for (const candidate of scoreCandidates(oldSeq, newSeq, matchedOld, matchedNew)) {
        if (candidate.score < 2.5) {
            continue;
        }
        if (matchedOld.has(candidate.oldIndex) || matchedNew.has(candidate.newIndex)) {
            continue;
        }

        matchedOld.add(candidate.oldIndex);
        matchedNew.add(candidate.newIndex);
        newIndexToId.set(candidate.newIndex, oldSeq[candidate.oldIndex].id);
    }

    matchEqualSizedRegions(oldSeq, newSeq, matchedOld, matchedNew, newIndexToId);

    return {
        newIndexToId,
        deletedIds: oldSeq.filter((_, index) => !matchedOld.has(index)).map((entry) => entry.id),
        newIndices: newSeq.map((_, index) => index).filter((index) => !matchedNew.has(index)),
    };
}

export function alignTasks(
    oldSeq: ExistingTaskSnapshot[],
    newSeq: TaskSnapshot[],
): { matchedIdsByNewIndex: Array<string | null>; deletedIds: string[] } {
    const result = alignTaskSequences(oldSeq, newSeq);
    return {
        matchedIdsByNewIndex: newSeq.map((_, index) => result.newIndexToId.get(index) ?? null),
        deletedIds: result.deletedIds,
    };
}

function matchByFingerprint(
    oldSeq: ExistingTaskSnapshot[],
    newSeq: TaskSnapshot[],
    matchedOld: Set<number>,
    matchedNew: Set<number>,
    newIndexToId: Map<number, string>,
): void {
    const oldGroups = groupIndexes(oldSeq, (entry) => entry.fingerprint, matchedOld);
    const newGroups = groupIndexes(newSeq, (entry) => entry.fingerprint, matchedNew);

    for (const [fingerprint, oldIndexes] of oldGroups.entries()) {
        const newIndexes = newGroups.get(fingerprint) ?? [];
        const count = Math.min(oldIndexes.length, newIndexes.length);
        for (let index = 0; index < count; index++) {
            matchedOld.add(oldIndexes[index]);
            matchedNew.add(newIndexes[index]);
            newIndexToId.set(newIndexes[index], oldSeq[oldIndexes[index]].id);
        }
    }
}

function matchBySignature(
    oldSeq: ExistingTaskSnapshot[],
    newSeq: TaskSnapshot[],
    matchedOld: Set<number>,
    matchedNew: Set<number>,
    newIndexToId: Map<number, string>,
): void {
    const oldGroups = groupIndexes(oldSeq, (_entry, index, items) => signatureFor(items, index), matchedOld);
    const newGroups = groupIndexes(newSeq, (_entry, index, items) => signatureFor(items, index), matchedNew);

    for (const [signature, oldIndexes] of oldGroups.entries()) {
        const newIndexes = newGroups.get(signature) ?? [];
        const count = Math.min(oldIndexes.length, newIndexes.length);
        for (let index = 0; index < count; index++) {
            matchedOld.add(oldIndexes[index]);
            matchedNew.add(newIndexes[index]);
            newIndexToId.set(newIndexes[index], oldSeq[oldIndexes[index]].id);
        }
    }
}

function scoreCandidates(
    oldSeq: ExistingTaskSnapshot[],
    newSeq: TaskSnapshot[],
    matchedOld: Set<number>,
    matchedNew: Set<number>,
): CandidatePair[] {
    const candidates: CandidatePair[] = [];

    for (let oldIndex = 0; oldIndex < oldSeq.length; oldIndex++) {
        if (matchedOld.has(oldIndex)) {
            continue;
        }

        for (let newIndex = 0; newIndex < newSeq.length; newIndex++) {
            if (matchedNew.has(newIndex)) {
                continue;
            }

            candidates.push({
                oldIndex,
                newIndex,
                score: candidateScore(oldSeq, newSeq, oldIndex, newIndex),
            });
        }
    }

    return candidates.sort((left, right) => right.score - left.score);
}

function candidateScore(
    oldSeq: ExistingTaskSnapshot[],
    newSeq: TaskSnapshot[],
    oldIndex: number,
    newIndex: number,
): number {
    const oldContext = surroundingFingerprints(oldSeq, oldIndex);
    const newContext = surroundingFingerprints(newSeq, newIndex);

    let score = 0;
    if (oldContext.previous === newContext.previous) {
        score += 1;
    }
    if (oldContext.next === newContext.next) {
        score += 1;
    }

    score += similarity(oldSeq[oldIndex].body, newSeq[newIndex].body) * 3;
    score -= Math.abs(relativePosition(oldIndex, oldSeq.length) - relativePosition(newIndex, newSeq.length));

    return score;
}

function surroundingFingerprints(
    sequence: Array<{ fingerprint: string }>,
    index: number,
): { previous: string; next: string } {
    return {
        previous: index > 0 ? sequence[index - 1].fingerprint : "<start>",
        next: index < sequence.length - 1 ? sequence[index + 1].fingerprint : "<end>",
    };
}

function matchEqualSizedRegions(
    oldSeq: ExistingTaskSnapshot[],
    newSeq: TaskSnapshot[],
    matchedOld: Set<number>,
    matchedNew: Set<number>,
    newIndexToId: Map<number, string>,
): void {
    let oldCursor = 0;
    let newCursor = 0;

    while (oldCursor < oldSeq.length || newCursor < newSeq.length) {
        const oldRegion: number[] = [];
        const newRegion: number[] = [];

        while (oldCursor < oldSeq.length && !matchedOld.has(oldCursor)) {
            oldRegion.push(oldCursor);
            oldCursor += 1;
        }
        while (newCursor < newSeq.length && !matchedNew.has(newCursor)) {
            newRegion.push(newCursor);
            newCursor += 1;
        }

        if (oldRegion.length > 0 && oldRegion.length === newRegion.length) {
            for (let index = 0; index < oldRegion.length; index++) {
                matchedOld.add(oldRegion[index]);
                matchedNew.add(newRegion[index]);
                newIndexToId.set(newRegion[index], oldSeq[oldRegion[index]].id);
            }
        }

        oldCursor += 1;
        newCursor += 1;
    }
}

function groupIndexes<T>(
    items: T[],
    keyFn: (item: T, index: number, items: T[]) => string,
    matched: Set<number>,
): Map<string, number[]> {
    const groups = new Map<string, number[]>();

    items.forEach((item, index) => {
        if (matched.has(index)) {
            return;
        }
        const key = keyFn(item, index, items);
        const group = groups.get(key) ?? [];
        group.push(index);
        groups.set(key, group);
    });

    return groups;
}

function signatureFor(items: Array<{ fingerprint: string }>, index: number): string {
    const previous = index > 0 ? items[index - 1].fingerprint : "<start>";
    const next = index < items.length - 1 ? items[index + 1].fingerprint : "<end>";
    return `${previous}|${next}`;
}

function similarity(left: string, right: string): number {
    const normalizedLeft = normalizeTaskBody(left).toLowerCase();
    const normalizedRight = normalizeTaskBody(right).toLowerCase();

    if (normalizedLeft === normalizedRight) {
        return 1;
    }

    const leftWords = new Set(normalizedLeft.match(/[a-z0-9]+/g) ?? []);
    const rightWords = new Set(normalizedRight.match(/[a-z0-9]+/g) ?? []);
    const union = new Set([...leftWords, ...rightWords]);
    if (union.size === 0) {
        return 0;
    }

    let overlap = 0;
    for (const word of leftWords) {
        if (rightWords.has(word)) {
            overlap += 1;
        }
    }

    const jaccard = overlap / union.size;
    const prefix = commonPrefixLength(normalizedLeft, normalizedRight) / Math.max(normalizedLeft.length, normalizedRight.length, 1);
    return Math.max(jaccard, prefix);
}

function commonPrefixLength(left: string, right: string): number {
    const max = Math.min(left.length, right.length);
    let index = 0;
    while (index < max && left[index] === right[index]) {
        index += 1;
    }
    return index;
}

function relativePosition(index: number, length: number): number {
    if (length <= 1) {
        return 0;
    }
    return index / (length - 1);
}