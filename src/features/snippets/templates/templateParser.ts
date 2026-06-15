/**
 * Pure frontmatter + body parser for template files.
 * No vscode imports. No Contacts types.
 */

// ── Public types ─────────────────────────────────────────────────────────────

export interface ParsedArg {
    /** The raw argument string (not yet reference-substituted). */
    raw: string;
    /** For union arguments (A | B | C), the list of options. */
    options?: string[];
    /** True when this argument is a quoted string literal. */
    isQuoted?: boolean;
    /** True when this argument is a {{ref.prop}} reference. */
    isReference?: boolean;
}

export interface FrontmatterEntry {
    /** Variable name (left of the colon). */
    name: string;
    /** Function name (e.g. "PeopleSelector"). */
    functionName: string;
    /** Parsed arguments. */
    args: ParsedArg[];
}

export interface ParsedTemplate {
    /** Ordered frontmatter declarations (empty for body-only templates). */
    entries: FrontmatterEntry[];
    /** Raw body text (frontmatter fences already removed). */
    body: string;
    /** Optional title: first # H1 heading in the body, or null. */
    title: string | null;
}

export interface ParsedDuration {
    days: number;
    unit: "d" | "w" | "M";
}

// ── Constants ─────────────────────────────────────────────────────────────────

const VALID_DURATION_UNITS = new Set(["d", "w", "M"]);
const DURATION_RE = /^(\d+)([dwM])$/;
const IDENTIFIER_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

// ── Main parser ─────────────────────────────────────────────────────────────

/**
 * Parses a template file into frontmatter entries + body.
 * Throws a descriptive error for structural parse failures (missing close fence, etc.).
 */
export function parseTemplate(text: string): ParsedTemplate {
    // Strip UTF-8 BOM
    const source = text.startsWith("\uFEFF") ? text.slice(1) : text;
    const lines = source.split(/\r?\n/);

    // Find first non-blank line
    let firstNonBlank = 0;
    while (firstNonBlank < lines.length && /^\s*$/.test(lines[firstNonBlank])) {
        firstNonBlank++;
    }

    // Check for opening fence
    if (firstNonBlank >= lines.length || lines[firstNonBlank].trim() !== "---") {
        // Body-only template — no frontmatter
        return { entries: [], body: source, title: extractTitle(source) };
    }

    // Find closing fence
    let closingFence = -1;
    for (let i = firstNonBlank + 1; i < lines.length; i++) {
        if (lines[i].trim() === "---") {
            closingFence = i;
            break;
        }
    }

    if (closingFence < 0) {
        throw new Error("Template frontmatter is missing its closing '---' fence.");
    }

    // Parse frontmatter lines
    const frontmatterLines = lines.slice(firstNonBlank + 1, closingFence);
    const entries = parseFrontmatterLines(frontmatterLines);

    // Body: everything after the closing fence, consuming one newline
    let bodyStart = closingFence + 1;
    // Consume the single newline immediately after the fence
    const rawBody = lines.slice(bodyStart).join("\n");
    const body = rawBody.startsWith("\n") ? rawBody.slice(1) : rawBody;

    return { entries, body, title: extractTitle(body) };
}

/**
 * Parses a single function call in "call-only mode" (no `name:` prefix).
 * Used by the CLI `invoke` verb for raw calls like `PeopleSelector(Team)`.
 */
export function parseFunctionCall(callText: string): Pick<FrontmatterEntry, "functionName" | "args"> {
    const trimmed = callText.trim();
    const parenIdx = trimmed.indexOf("(");
    if (parenIdx < 0) {
        throw new Error(`Invalid function call: "${trimmed}" — expected FunctionName(args?)`);
    }

    const functionName = trimmed.slice(0, parenIdx).trim();
    if (!IDENTIFIER_RE.test(functionName)) {
        throw new Error(`Invalid function name: "${functionName}"`);
    }

    if (!trimmed.endsWith(")")) {
        throw new Error(`Invalid function call: "${trimmed}" — missing closing ")"`);
    }

    const argsText = trimmed.slice(parenIdx + 1, trimmed.length - 1);
    const args = tokenizeArgs(argsText);

    return { functionName, args };
}

// ── Frontmatter parsing ──────────────────────────────────────────────────────

function parseFrontmatterLines(lines: string[]): FrontmatterEntry[] {
    const entries: FrontmatterEntry[] = [];
    const names = new Set<string>();

    for (const line of lines) {
        if (/^\s*$/.test(line)) continue; // blank lines OK

        const colonIdx = line.indexOf(":");
        if (colonIdx < 0) {
            throw new Error(`Invalid frontmatter line: "${line}" — expected "name: FunctionName(args?)"`);
        }

        const name = line.slice(0, colonIdx).trim();
        if (!IDENTIFIER_RE.test(name)) {
            throw new Error(`Invalid frontmatter name: "${name}" — must be an identifier ([A-Za-z_][A-Za-z0-9_]*)`);
        }
        if (names.has(name)) {
            throw new Error(`Duplicate frontmatter name: "${name}"`);
        }
        names.add(name);

        const callText = line.slice(colonIdx + 1).trim();
        const parsed = parseFunctionCall(callText);
        entries.push({ name, ...parsed });
    }

    return entries;
}

// ── Argument tokenizer ───────────────────────────────────────────────────────

/**
 * Quote-aware, paren-aware argument tokenizer.
 * Handles: identifiers, union (|), number+unit, quoted strings, {{ref}} references.
 */
export function tokenizeArgs(argsText: string): ParsedArg[] {
    if (!argsText.trim()) return [];

    const args: ParsedArg[] = [];
    let pos = 0;
    const len = argsText.length;

    while (pos < len) {
        // Skip leading whitespace
        while (pos < len && /\s/.test(argsText[pos])) pos++;
        if (pos >= len) break;

        const arg = readOneArg(argsText, pos, len);
        pos = arg.end;
        if (arg.value.trim()) {
            args.push(arg.parsed);
        }

        // Skip whitespace after arg
        while (pos < len && /\s/.test(argsText[pos])) pos++;

        // Expect comma or end
        if (pos < len) {
            if (argsText[pos] === ",") {
                pos++;
            }
        }
    }

    return args;
}

interface ReadArgResult {
    parsed: ParsedArg;
    value: string;
    end: number;
}

function readOneArg(text: string, start: number, len: number): ReadArgResult {
    const ch = text[start];

    // Quoted string
    if (ch === '"') {
        return readQuotedArg(text, start, len);
    }

    // {{reference}}
    if (text.startsWith("{{", start)) {
        return readReferenceArg(text, start, len);
    }

    // Identifier / union / number+unit / duration
    return readPlainArg(text, start, len);
}

function readQuotedArg(text: string, start: number, len: number): ReadArgResult {
    let i = start + 1; // skip opening "
    let raw = "";

    while (i < len) {
        const ch = text[i];
        if (ch === "\\") {
            i++;
            if (i >= len) break;
            const escaped = text[i];
            switch (escaped) {
                case '"': raw += '"'; break;
                case "\\": raw += "\\"; break;
                case "n": raw += "\n"; break;
                case "t": raw += "\t"; break;
                default: raw += "\\" + escaped; break;
            }
            i++;
        } else if (ch === '"') {
            i++; // skip closing "
            return { parsed: { raw, isQuoted: true }, value: raw, end: i };
        } else {
            raw += ch;
            i++;
        }
    }

    throw new Error(`Unterminated quoted string in argument starting at position ${start}`);
}

function readReferenceArg(text: string, start: number, len: number): ReadArgResult {
    const end = text.indexOf("}}", start + 2);
    if (end < 0) {
        throw new Error(`Unterminated reference "{{..." in argument at position ${start}`);
    }
    const raw = text.slice(start, end + 2); // includes {{ and }}
    return { parsed: { raw, isReference: true }, value: raw, end: end + 2 };
}

function readPlainArg(text: string, start: number, len: number): ReadArgResult {
    // Read until comma (outside quotes/refs) or end
    let i = start;
    const parts: string[] = [];
    let currentPart = "";

    while (i < len) {
        const ch = text[i];
        if (ch === ",") break; // arg separator
        if (ch === "|") {
            // union separator
            parts.push(currentPart.trim());
            currentPart = "";
            i++;
            continue;
        }
        if (ch === '"') {
            // shouldn't happen in plain arg, but handle gracefully
            break;
        }
        if (text.startsWith("{{", i)) {
            // Reference embedded in plain text (unusual but valid)
            const refEnd = text.indexOf("}}", i + 2);
            if (refEnd < 0) break;
            currentPart += text.slice(i, refEnd + 2);
            i = refEnd + 2;
            continue;
        }
        currentPart += ch;
        i++;
    }

    parts.push(currentPart.trim());
    const raw = parts.join(" | ");

    if (parts.length > 1) {
        // Union
        return { parsed: { raw, options: parts.filter(Boolean) }, value: raw, end: i };
    }

    const singleValue = parts[0];
    return { parsed: { raw: singleValue }, value: singleValue, end: i };
}

// ── Duration parsing ─────────────────────────────────────────────────────────

/**
 * Parses a duration string like "3d", "2w", "4M".
 * Returns the number of calendar days.
 * Throws a descriptive error for invalid formats.
 */
export function parseDuration(raw: string, allowedUnits?: ReadonlySet<string>): ParsedDuration {
    const match = DURATION_RE.exec(raw.trim());
    if (!match) {
        throw new Error(`Invalid duration: "${raw}" — expected format: <number><unit> where unit is d (days), w (weeks), or M (months)`);
    }

    const unit = match[2] as "d" | "w" | "M";
    if (!VALID_DURATION_UNITS.has(unit)) {
        throw new Error(`Unknown duration unit "${unit}" in "${raw}" — valid units are: d (days), w (weeks), M (months ×30)`);
    }

    if (allowedUnits && !allowedUnits.has(unit)) {
        throw new Error(`Duration unit "${unit}" is not allowed here — valid units: ${[...allowedUnits].join(", ")}`);
    }

    const n = parseInt(match[1], 10);
    return { days: durationToDays(n, unit), unit };
}

function durationToDays(n: number, unit: "d" | "w" | "M"): number {
    switch (unit) {
        case "d": return n;
        case "w": return n * 7;
        case "M": return n * 30;
    }
}

// ── Title extraction ─────────────────────────────────────────────────────────

function extractTitle(body: string): string | null {
    const lines = body.split(/\r?\n/);
    for (const line of lines) {
        const match = /^#\s+(.+)$/.exec(line.trim());
        if (match) return match[1].trim();
    }
    return null;
}

// ── Dependency extraction ────────────────────────────────────────────────────

const REFERENCE_IN_EXPR_RE = /\{\{([A-Za-z_][A-Za-z0-9_]*)(?:\.[A-Za-z_][A-Za-z0-9_.]*)?}}/g;

/**
 * Extracts frontmatter entry names that a given entry depends on.
 * Scans args for {{name.prop}} references, excluding branchArgs positions.
 */
export function extractDependencies(
    entry: FrontmatterEntry,
    knownNames: ReadonlySet<string>,
    branchArgPositions: ReadonlySet<number>,
): string[] {
    const deps = new Set<string>();

    for (let i = 0; i < entry.args.length; i++) {
        if (branchArgPositions.has(i)) continue; // skip branch args

        const arg = entry.args[i];
        // Extract references from raw arg text
        for (const match of arg.raw.matchAll(REFERENCE_IN_EXPR_RE)) {
            const refName = match[1];
            if (knownNames.has(refName)) {
                deps.add(refName);
            }
        }
    }

    return [...deps];
}
