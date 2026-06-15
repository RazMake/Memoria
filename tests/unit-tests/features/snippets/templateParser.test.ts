import { describe, it, expect } from "vitest";
import {
    parseTemplate,
    parseFunctionCall,
    tokenizeArgs,
    parseDuration,
    extractDependencies,
} from "../../../../src/features/snippets/templates/templateParser";

describe("templateParser", () => {
    describe("parseTemplate", () => {
        it("parses a body-only template (no frontmatter)", () => {
            const text = "Hello world\n# Title\nSome content";
            const result = parseTemplate(text);
            expect(result.entries).toHaveLength(0);
            expect(result.body).toBe(text);
            expect(result.title).toBe("Title");
        });

        it("parses a template with frontmatter", () => {
            const text = "---\ncandidate: PeopleSelector(Team)\n---\nHello {{candidate.name}}";
            const result = parseTemplate(text);
            expect(result.entries).toHaveLength(1);
            expect(result.entries[0].name).toBe("candidate");
            expect(result.entries[0].functionName).toBe("PeopleSelector");
            expect(result.body).toBe("Hello {{candidate.name}}");
        });

        it("extracts title from first H1 heading", () => {
            const text = "---\nme: Me()\n---\n# My Template\nSome content";
            const result = parseTemplate(text);
            expect(result.title).toBe("My Template");
        });

        it("returns null title when no H1 heading", () => {
            const text = "---\nme: Me()\n---\n## H2 heading\nContent";
            const result = parseTemplate(text);
            expect(result.title).toBeNull();
        });

        it("throws for missing closing fence", () => {
            const text = "---\ncandidate: PeopleSelector(Team)\n";
            expect(() => parseTemplate(text)).toThrow("missing its closing");
        });

        it("handles UTF-8 BOM at start", () => {
            const text = "\uFEFF---\nme: Me()\n---\nBody";
            const result = parseTemplate(text);
            expect(result.entries).toHaveLength(1);
            expect(result.entries[0].name).toBe("me");
        });

        it("parses body-only template when first non-blank line is not ---", () => {
            const text = "\n\nHello world";
            const result = parseTemplate(text);
            expect(result.entries).toHaveLength(0);
        });

        it("handles blank lines in frontmatter", () => {
            const text = "---\n\ncandidate: PeopleSelector(Team)\n\nme: Me()\n---\nBody";
            const result = parseTemplate(text);
            expect(result.entries).toHaveLength(2);
        });

        it("preserves body --- lines as verbatim", () => {
            const text = "---\nme: Me()\n---\nFirst\n---\nSecond";
            const result = parseTemplate(text);
            expect(result.body).toBe("First\n---\nSecond");
        });

        it("throws for duplicate frontmatter names", () => {
            const text = "---\nfoo: FreeText()\nfoo: Me()\n---\nBody";
            expect(() => parseTemplate(text)).toThrow('Duplicate frontmatter name: "foo"');
        });

        it("throws for invalid frontmatter line", () => {
            const text = "---\ninvalid line without colon\n---\nBody";
            expect(() => parseTemplate(text)).toThrow("Invalid frontmatter line");
        });

        it("consumes one newline after closing fence", () => {
            const text = "---\nme: Me()\n---\nBody";
            const result = parseTemplate(text);
            expect(result.body).toBe("Body");
        });
    });

    describe("parseFunctionCall", () => {
        it("parses a simple function call", () => {
            const result = parseFunctionCall("PeopleSelector(Team)");
            expect(result.functionName).toBe("PeopleSelector");
            expect(result.args).toHaveLength(1);
        });

        it("parses a function call with no args", () => {
            const result = parseFunctionCall("Me()");
            expect(result.functionName).toBe("Me");
            expect(result.args).toHaveLength(0);
        });

        it("parses a function call with union arg", () => {
            const result = parseFunctionCall("PeopleSelector(Team | Managers | Peers)");
            expect(result.args[0].options).toEqual(["Team", "Managers", "Peers"]);
        });

        it("throws for missing paren", () => {
            expect(() => parseFunctionCall("PeopleSelector")).toThrow("expected FunctionName(args?)");
        });

        it("throws for missing closing paren", () => {
            expect(() => parseFunctionCall("PeopleSelector(Team")).toThrow('missing closing ")"');
        });

        it("throws for invalid function name", () => {
            expect(() => parseFunctionCall("123Invalid()")).toThrow("Invalid function name");
        });
    });

    describe("tokenizeArgs", () => {
        it("returns empty array for empty string", () => {
            expect(tokenizeArgs("")).toHaveLength(0);
        });

        it("parses single identifier", () => {
            const result = tokenizeArgs("Team");
            expect(result).toHaveLength(1);
            expect(result[0].raw).toBe("Team");
        });

        it("parses union of identifiers", () => {
            const result = tokenizeArgs("A | B | C");
            expect(result).toHaveLength(1);
            expect(result[0].options).toEqual(["A", "B", "C"]);
        });

        it("parses multiple args separated by commas", () => {
            const result = tokenizeArgs("1d, 3d");
            expect(result).toHaveLength(2);
        });

        it("parses quoted string", () => {
            const result = tokenizeArgs('"Hello world"');
            expect(result).toHaveLength(1);
            expect(result[0].isQuoted).toBe(true);
            expect(result[0].raw).toBe("Hello world");
        });

        it("parses escape sequences in quoted strings", () => {
            const result = tokenizeArgs('"Hello\\"world"');
            expect(result[0].raw).toBe('Hello"world');
        });

        it("parses \\n and \\t escape sequences", () => {
            const result = tokenizeArgs('"line1\\nline2\\ttab"');
            expect(result[0].raw).toBe("line1\nline2\ttab");
        });

        it("parses backslash-other as literal", () => {
            const result = tokenizeArgs('"hello\\xworld"');
            expect(result[0].raw).toBe("hello\\xworld");
        });

        it("parses reference argument", () => {
            const result = tokenizeArgs("{{me.StartDate}}");
            expect(result).toHaveLength(1);
            expect(result[0].isReference).toBe(true);
        });

        it("commas inside quoted strings are literal", () => {
            const result = tokenizeArgs('"Hello, world"');
            expect(result).toHaveLength(1);
        });

        it("throws for unterminated quoted string", () => {
            expect(() => tokenizeArgs('"unclosed')).toThrow("Unterminated quoted string");
        });

        it("throws for unterminated reference", () => {
            expect(() => tokenizeArgs("{{unclosed")).toThrow("Unterminated reference");
        });
    });

    describe("parseDuration", () => {
        it("parses days: 3d → 3 days", () => {
            const result = parseDuration("3d");
            expect(result.days).toBe(3);
            expect(result.unit).toBe("d");
        });

        it("parses weeks: 2w → 14 days", () => {
            const result = parseDuration("2w");
            expect(result.days).toBe(14);
            expect(result.unit).toBe("w");
        });

        it("parses months: 4M → 120 days", () => {
            const result = parseDuration("4M");
            expect(result.days).toBe(120);
            expect(result.unit).toBe("M");
        });

        it("throws for invalid format", () => {
            expect(() => parseDuration("abc")).toThrow("Invalid duration");
        });

        it("throws for unknown unit", () => {
            expect(() => parseDuration("3x")).toThrow("Invalid duration");
        });

        it("rejects M unit when not in allowed set", () => {
            expect(() => parseDuration("4M", new Set(["d", "w"]))).toThrow("not allowed");
        });

        it("accepts d unit when in allowed set", () => {
            const result = parseDuration("5d", new Set(["d", "w"]));
            expect(result.days).toBe(5);
        });
    });

    describe("extractDependencies", () => {
        it("extracts references from args", () => {
            const text = "---\nresult: FreeText(\"Hello {{candidate.name}}\")\ncandidate: PeopleSelector(Team)\n---\nBody";
            const parsed = parseTemplate(text);
            const entry = parsed.entries[0]; // result
            const knownNames = new Set(["candidate", "result"]);
            const deps = extractDependencies(entry, knownNames, new Set());
            expect(deps).toContain("candidate");
        });

        it("skips branch args", () => {
            const text = "---\ncond: IfWithin(4M, {{me.StartDate}}, \"{{candidate.name}}\")\nme: Me()\ncandidate: PeopleSelector(Team)\n---\nBody";
            const parsed = parseTemplate(text);
            const entry = parsed.entries[0]; // cond
            const knownNames = new Set(["me", "candidate", "cond"]);
            // Position 2 is a branch arg (the text arg of IfWithin)
            const deps = extractDependencies(entry, knownNames, new Set([2]));
            expect(deps).toContain("me");
            expect(deps).not.toContain("candidate"); // was in branch arg
        });

        it("returns empty array when no references", () => {
            const text = "---\nproject: FreeText()\n---\nBody";
            const parsed = parseTemplate(text);
            const entry = parsed.entries[0];
            const deps = extractDependencies(entry, new Set(["project"]), new Set());
            expect(deps).toHaveLength(0);
        });
    });
});
