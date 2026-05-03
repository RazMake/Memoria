// Webview entry point for the conflict diff panel.
// Computes a line-based diff between the pre-existing and new file versions,
// renders an inline diff view with per-hunk Keep/Ignore buttons, and posts
// the merged result back to the extension host.

declare function acquireVsCodeApi(): {
    postMessage(msg: unknown): void;
    getState(): unknown;
    setState(state: unknown): void;
};
const vscode = acquireVsCodeApi();

// ────────── Types ──────────

interface InitMessage {
    type: "init";
    fileName: string;
    preExisting: string;
    newVersion: string;
}

interface DiffOp {
    type: "equal" | "delete" | "insert";
    lines: string[];
}

interface ContextSection {
    kind: "context";
    lines: string[];
}

interface ChangeSection {
    kind: "change";
    id: number;
    deletedLines: string[]; // from pre-existing
    insertedLines: string[]; // from new version
    decision: "keep" | "ignore";
}

type Section = ContextSection | ChangeSection;

// ────────── State ──────────

let sections: Section[] = [];
let currentFileName = "";

// ────────── Diff Algorithm (LCS-based) ──────────

function computeDiffOps(oldLines: string[], newLines: string[]): DiffOp[] {
    const n = oldLines.length;
    const m = newLines.length;

    // Build DP table for LCS length
    const dp: number[][] = [];
    for (let i = 0; i <= n; i++) {
        dp[i] = new Array(m + 1).fill(0);
    }
    for (let i = 1; i <= n; i++) {
        for (let j = 1; j <= m; j++) {
            if (oldLines[i - 1] === newLines[j - 1]) {
                dp[i][j] = dp[i - 1][j - 1] + 1;
            } else {
                dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
            }
        }
    }

    // Backtrack to produce raw edit operations
    const rawOps: Array<{ type: "equal" | "delete" | "insert"; line: string }> = [];
    let i = n;
    let j = m;
    while (i > 0 || j > 0) {
        if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
            rawOps.unshift({ type: "equal", line: oldLines[i - 1] });
            i--;
            j--;
        } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
            rawOps.unshift({ type: "insert", line: newLines[j - 1] });
            j--;
        } else {
            rawOps.unshift({ type: "delete", line: oldLines[i - 1] });
            i--;
        }
    }

    // Group consecutive same-type operations
    const ops: DiffOp[] = [];
    for (const raw of rawOps) {
        if (ops.length > 0 && ops[ops.length - 1].type === raw.type) {
            ops[ops.length - 1].lines.push(raw.line);
        } else {
            ops.push({ type: raw.type, lines: [raw.line] });
        }
    }
    return ops;
}

function buildSections(ops: DiffOp[]): Section[] {
    const result: Section[] = [];
    let changeId = 0;
    let i = 0;

    while (i < ops.length) {
        if (ops[i].type === "equal") {
            result.push({ kind: "context", lines: ops[i].lines });
            i++;
        } else {
            // Collect consecutive non-equal ops into one change section
            const deletedLines: string[] = [];
            const insertedLines: string[] = [];
            while (i < ops.length && ops[i].type !== "equal") {
                if (ops[i].type === "delete") {
                    deletedLines.push(...ops[i].lines);
                } else {
                    insertedLines.push(...ops[i].lines);
                }
                i++;
            }
            result.push({
                kind: "change",
                id: changeId++,
                deletedLines,
                insertedLines,
                decision: "ignore",
            });
        }
    }
    return result;
}

// ────────── Rendering ──────────

function escapeHtml(text: string): string {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function el(tag: string, className?: string): HTMLElement {
    const e = document.createElement(tag);
    if (className) e.className = className;
    return e;
}

function render(): void {
    const root = document.getElementById("root")!;
    root.textContent = "";

    // ── Header ──
    const header = el("div", "header");
    const title = el("h2");
    title.textContent = `Merge: ${currentFileName}`;
    header.appendChild(title);

    const labels = el("div", "file-labels");
    const labelPre = el("span", "label label-preexisting");
    labelPre.textContent = "Pre-existing file (your backed-up version)";
    const labelVs = el("span", "vs");
    labelVs.textContent = "vs";
    const labelNew = el("span", "label label-new");
    labelNew.textContent = "File on disk (new blueprint version)";
    labels.append(labelPre, labelVs, labelNew);
    header.appendChild(labels);
    root.appendChild(header);

    // ── Whole-file action bar ──
    const actionBar = el("div", "action-bar");

    const keepPreBtn = el("button", "btn btn-preexisting") as HTMLButtonElement;
    keepPreBtn.textContent = "Keep Pre-existing Version";
    keepPreBtn.title = "Replace the file on disk with your backed-up version";
    keepPreBtn.addEventListener("click", () => {
        vscode.postMessage({ type: "keepPreExisting" });
    });

    const keepNewBtn = el("button", "btn btn-new") as HTMLButtonElement;
    keepNewBtn.textContent = "Keep New Version";
    keepNewBtn.title = "Keep the new blueprint version on disk as-is";
    keepNewBtn.addEventListener("click", () => {
        vscode.postMessage({ type: "keepNewVersion" });
    });

    actionBar.append(keepPreBtn, keepNewBtn);
    root.appendChild(actionBar);

    // ── Diff view ──
    const diffView = el("div", "diff-view");
    let changeCount = 0;

    for (const section of sections) {
        if (section.kind === "context") {
            for (const line of section.lines) {
                const lineEl = el("div", "diff-line context-line");
                const prefix = el("span", "line-prefix");
                prefix.textContent = " ";
                const content = el("span", "line-content");
                content.innerHTML = escapeHtml(line) || "&nbsp;";
                lineEl.append(prefix, content);
                diffView.appendChild(lineEl);
            }
        } else {
            changeCount++;
            const hunk = el("div", `diff-hunk ${section.decision}`);
            hunk.dataset.hunkId = String(section.id);

            // Hunk header with Keep/Ignore buttons
            const hunkHeader = el("div", "hunk-header");

            const hunkLabel = el("span", "hunk-label");
            hunkLabel.textContent = `Change ${changeCount}`;

            const keepBtn = el("button", `hunk-btn keep-btn${section.decision === "keep" ? " active" : ""}`) as HTMLButtonElement;
            keepBtn.textContent = "Keep";
            keepBtn.title = "Pull this change from the pre-existing file into the file on disk";

            const ignoreBtn = el("button", `hunk-btn ignore-btn${section.decision === "ignore" ? " active" : ""}`) as HTMLButtonElement;
            ignoreBtn.textContent = "Ignore";
            ignoreBtn.title = "Keep the new version for this section";

            const hunkId = section.id;
            keepBtn.addEventListener("click", () => {
                setDecision(hunkId, "keep");
                render();
            });
            ignoreBtn.addEventListener("click", () => {
                setDecision(hunkId, "ignore");
                render();
            });

            hunkHeader.append(hunkLabel, keepBtn, ignoreBtn);
            hunk.appendChild(hunkHeader);

            // Deleted lines (from pre-existing)
            for (const line of section.deletedLines) {
                const lineEl = el("div", "diff-line deleted-line");
                const prefix = el("span", "line-prefix");
                prefix.textContent = "−";
                const content = el("span", "line-content");
                content.innerHTML = escapeHtml(line) || "&nbsp;";
                lineEl.append(prefix, content);
                hunk.appendChild(lineEl);
            }

            // Inserted lines (from new version)
            for (const line of section.insertedLines) {
                const lineEl = el("div", "diff-line inserted-line");
                const prefix = el("span", "line-prefix");
                prefix.textContent = "+";
                const content = el("span", "line-content");
                content.innerHTML = escapeHtml(line) || "&nbsp;";
                lineEl.append(prefix, content);
                hunk.appendChild(lineEl);
            }

            diffView.appendChild(hunk);
        }
    }

    root.appendChild(diffView);

    // ── No changes indicator ──
    if (changeCount === 0) {
        const noChanges = el("div", "no-changes");
        noChanges.textContent = "Files are identical — no changes to merge.";
        root.appendChild(noChanges);
    }

    // ── Footer ──
    const footer = el("div", "footer");
    const applyBtn = el("button", "btn btn-apply") as HTMLButtonElement;
    applyBtn.textContent = "Apply & Close";
    applyBtn.title = "Write the merged result to disk and close";
    applyBtn.addEventListener("click", () => {
        vscode.postMessage({ type: "applyMerge", content: computeOutput() });
    });
    footer.appendChild(applyBtn);
    root.appendChild(footer);
}

// ────────── Logic ──────────

function setDecision(hunkId: number, decision: "keep" | "ignore"): void {
    for (const section of sections) {
        if (section.kind === "change" && section.id === hunkId) {
            section.decision = decision;
            break;
        }
    }
}

function computeOutput(): string {
    const lines: string[] = [];
    for (const section of sections) {
        if (section.kind === "context") {
            lines.push(...section.lines);
        } else if (section.decision === "keep") {
            lines.push(...section.deletedLines);
        } else {
            lines.push(...section.insertedLines);
        }
    }
    return lines.join("\n");
}

// ────────── Keyboard Shortcuts ──────────

document.addEventListener("keydown", (e: KeyboardEvent) => {
    // Ignore when typing in an input/textarea
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA") return;

    // Number keys 1-9: toggle Keep/Ignore on the corresponding hunk
    const digit = parseInt(e.key, 10);
    if (digit >= 1 && digit <= 9) {
        const changeSections = sections.filter((s): s is ChangeSection => s.kind === "change");
        const target = changeSections[digit - 1];
        if (target) {
            target.decision = target.decision === "keep" ? "ignore" : "keep";
            render();
        }
        return;
    }

    // Ctrl+Enter: Apply & Close
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        vscode.postMessage({ type: "applyMerge", content: computeOutput() });
        return;
    }
});

// ────────── Message Handling ──────────

window.addEventListener("message", (event: MessageEvent) => {
    const msg = event.data as InitMessage;
    if (msg?.type === "init") {
        currentFileName = msg.fileName;
        const oldLines = msg.preExisting.split("\n");
        const newLines = msg.newVersion.split("\n");
        const ops = computeDiffOps(oldLines, newLines);
        sections = buildSections(ops);
        render();
    }
});

// Signal ready
vscode.postMessage({ type: "ready" });
