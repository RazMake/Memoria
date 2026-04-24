import { SUBTASK_CHECKBOX_RE, SUBTASK_COMPLETED_RE } from "../../utils/markdownCheckbox";

export function toggleNthCheckbox(body: string, index: number, date: string): string {
    const lines = body.split("\n");
    let count = 0;

    for (let i = 0; i < lines.length; i++) {
        const match = SUBTASK_CHECKBOX_RE.exec(lines[i]);
        if (!match) continue;

        if (count++ !== index) continue;

        const wasUnchecked = lines[i].includes("- [ ]");

        if (wasUnchecked) {
            // Check the box and insert a completed date line after it
            lines[i] = lines[i].replace("- [ ]", "- [x]");
            const indent = lines[i].match(/^(\s*)/)?.[1] ?? "";
            const dateLine = `${indent}  _Completed ${date}_`;
            // Find where to insert: skip any continuation lines that belong to this subtask
            let insertAt = i + 1;
            while (insertAt < lines.length
                && !SUBTASK_CHECKBOX_RE.test(lines[insertAt])
                && !SUBTASK_COMPLETED_RE.test(lines[insertAt])) {
                insertAt++;
            }
            lines.splice(insertAt, 0, dateLine);
        } else {
            // Uncheck the box and remove the completed date line after it
            lines[i] = lines[i].replace(/- \[[xX]\]/, "- [ ]");
            // Look for a completed date line following this subtask
            let dateLineIdx = -1;
            for (let j = i + 1; j < lines.length; j++) {
                if (SUBTASK_CHECKBOX_RE.test(lines[j])) {
                    break;
                }
                if (SUBTASK_COMPLETED_RE.test(lines[j])) {
                    dateLineIdx = j;
                    break;
                }
            }
            if (dateLineIdx >= 0) {
                lines.splice(dateLineIdx, 1);
            }
        }

        return lines.join("\n");
    }

    return body;
}
