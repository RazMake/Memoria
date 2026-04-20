const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DISPLAY_DATE_RE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;

type DateSectionIndex = 0 | 1 | 2;

interface DateSectionRange {
    start: number;
    end: number;
}

export interface DateTabNavigationResult {
    value: string;
    selectionStart: number;
    selectionEnd: number;
}

export function formatIsoDateForDisplay(value: string): string {
    const trimmed = value.trim();
    const match = ISO_DATE_RE.exec(trimmed);
    if (!match) {
        return trimmed;
    }

    return `${match[2]}/${match[3]}/${match[1]}`;
}

export function parseDisplayDateToIso(value: string): string | null {
    const trimmed = value.trim();
    const match = DISPLAY_DATE_RE.exec(trimmed);
    if (!match) {
        return null;
    }

    const month = Number(match[1]);
    const day = Number(match[2]);
    const year = Number(match[3]);
    if (!Number.isInteger(month) || !Number.isInteger(day) || !Number.isInteger(year)) {
        return null;
    }
    if (month < 1 || month > 12 || day < 1) {
        return null;
    }

    const date = new Date(year, month - 1, day);
    if (
        date.getFullYear() !== year
        || date.getMonth() !== month - 1
        || date.getDate() !== day
    ) {
        return null;
    }

    return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function sanitizeDateDisplayInput(value: string): string {
    const limits = [2, 2, 4] as const;
    let sectionIndex = 0;
    let sectionLength = 0;
    let result = "";

    for (const character of value) {
        if (/\d/.test(character)) {
            if (sectionIndex >= limits.length) {
                continue;
            }

            if (sectionLength >= limits[sectionIndex]) {
                if (sectionIndex >= limits.length - 1) {
                    continue;
                }

                if (!result.endsWith("/")) {
                    result += "/";
                }
                sectionIndex += 1;
                sectionLength = 0;
            }

            result += character;
            sectionLength += 1;

            if (sectionLength === limits[sectionIndex] && sectionIndex < limits.length - 1) {
                result += "/";
                sectionIndex += 1;
                sectionLength = 0;
            }
            continue;
        }

        if (character === "/") {
            if (sectionIndex >= limits.length - 1 || sectionLength === 0 || result.endsWith("/")) {
                continue;
            }

            result += "/";
            sectionIndex += 1;
            sectionLength = 0;
        }
    }

    return result;
}

export function moveDateSelectionByTab(
    value: string,
    selectionStart: number,
    direction: 1 | -1,
): DateTabNavigationResult | null {
    const sanitizedValue = sanitizeDateDisplayInput(value);
    const currentIndex = getDateSectionIndex(sanitizedValue, selectionStart);
    if ((direction > 0 && currentIndex === 2) || (direction < 0 && currentIndex === 0)) {
        return null;
    }

    const navigatedValue = direction > 0
        ? ensureForwardSectionDelimiter(sanitizedValue, currentIndex)
        : sanitizedValue;
    const sectionRanges = getDateSectionRanges(navigatedValue);
    const currentRange = sectionRanges[currentIndex];

    let targetIndex = currentIndex;
    for (let step = 1; step <= 3; step += 1) {
        const candidateIndex = ((currentIndex + (direction * step)) + 3) % 3 as DateSectionIndex;
        const candidateRange = sectionRanges[candidateIndex];
        if (candidateRange.start !== currentRange.start || candidateRange.end !== currentRange.end) {
            targetIndex = candidateIndex;
            break;
        }
    }

    return {
        value: navigatedValue,
        selectionStart: sectionRanges[targetIndex].start,
        selectionEnd: sectionRanges[targetIndex].end,
    };
}

function getDateSectionIndex(value: string, selectionStart: number): DateSectionIndex {
    const safeSelectionStart = Math.max(0, Math.min(selectionStart, value.length));
    const { firstSlashIndex, secondSlashIndex } = getSlashIndices(value);
    if (firstSlashIndex < 0 || safeSelectionStart <= firstSlashIndex) {
        return 0;
    }

    if (secondSlashIndex < 0 || safeSelectionStart <= secondSlashIndex) {
        return 1;
    }

    return 2;
}

function getDateSectionRanges(value: string): [DateSectionRange, DateSectionRange, DateSectionRange] {
    const { firstSlashIndex, secondSlashIndex } = getSlashIndices(value);
    const monthEnd = firstSlashIndex >= 0 ? firstSlashIndex : value.length;
    const dayStart = firstSlashIndex >= 0 ? firstSlashIndex + 1 : value.length;
    const dayEnd = secondSlashIndex >= 0 ? secondSlashIndex : value.length;
    const yearStart = secondSlashIndex >= 0 ? secondSlashIndex + 1 : value.length;

    return [
        { start: 0, end: monthEnd },
        { start: dayStart, end: dayEnd },
        { start: yearStart, end: value.length },
    ];
}

function ensureForwardSectionDelimiter(value: string, currentIndex: DateSectionIndex): string {
    if (currentIndex === 0) {
        return value.length > 0 && value.indexOf("/") < 0
            ? `${value}/`
            : value;
    }

    if (currentIndex === 1) {
        const { firstSlashIndex, secondSlashIndex } = getSlashIndices(value);
        const hasDayDigits = firstSlashIndex >= 0 && (secondSlashIndex >= 0
            ? secondSlashIndex > firstSlashIndex + 1
            : value.length > firstSlashIndex + 1);
        return firstSlashIndex >= 0 && secondSlashIndex < 0 && hasDayDigits
            ? `${value}/`
            : value;
    }

    return value;
}

function getSlashIndices(value: string): { firstSlashIndex: number; secondSlashIndex: number } {
    const firstSlashIndex = value.indexOf("/");
    const secondSlashIndex = firstSlashIndex >= 0
        ? value.indexOf("/", firstSlashIndex + 1)
        : -1;

    return {
        firstSlashIndex,
        secondSlashIndex,
    };
}