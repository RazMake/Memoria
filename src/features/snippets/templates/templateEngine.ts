/**
 * Template engine: multi-pass resolver + renderer.
 * No vscode imports. No Contacts types. Adapter-injected.
 */

import type {
    InputResolver,
    RenderOptions,
    RenderResult,
    TemplateArg,
    TemplateContext,
    TemplateFunction,
    TemplateInput,
} from "./templateTypes";
import { parseTemplate, extractDependencies, type FrontmatterEntry } from "./templateParser";
import { renderExpressions } from "./expressionRenderer";
import { CORE_BUILTINS } from "./coreBuiltins";

// ── Entry point ──────────────────────────────────────────────────────────────

export async function renderTemplate(options: RenderOptions): Promise<RenderResult> {
    const { templateText, inputResolver, now = new Date() } = options;

    // Combine host functions with core built-ins (core takes precedence for reserved names)
    const allFunctions = buildFunctionMap([...options.functions, ...CORE_BUILTINS]);

    // Parse the template
    const parsed = parseTemplate(templateText);

    // Multi-pass resolution
    const scope: Record<string, unknown> = {};
    const diagnostics: string[] = [];

    if (parsed.entries.length > 0) {
        const cancelled = await resolveEntries(
            parsed.entries,
            allFunctions,
            inputResolver,
            scope,
            diagnostics,
            now,
        );

        if (cancelled) {
            return { text: "", scope: {}, diagnostics: [] };
        }
    }

    // Render body
    const text = renderExpressions(parsed.body, scope, [...allFunctions.values()], diagnostics);

    return { text, scope, diagnostics };
}

// ── Multi-pass resolver ──────────────────────────────────────────────────────

async function resolveEntries(
    entries: FrontmatterEntry[],
    functions: ReadonlyMap<string, TemplateFunction>,
    inputResolver: InputResolver,
    scope: Record<string, unknown>,
    diagnostics: string[],
    now: Date,
): Promise<boolean> { // returns true if cancelled
    const knownNames = new Set(entries.map((e) => e.name));
    const unresolved = [...entries];

    while (unresolved.length > 0) {
        const beforeCount = unresolved.length;

        for (let i = unresolved.length - 1; i >= 0; i--) {
            const entry = unresolved[i];
            const fn = functions.get(entry.functionName);

            if (!fn) {
                throw new Error(
                    `Unknown function "${entry.functionName}" in frontmatter entry "${entry.name}". ` +
                    `Available functions: ${[...functions.keys()].join(", ")}`
                );
            }

            // Determine which arg positions are branch args (not dependency extracted)
            const branchArgSet = new Set(fn.branchArgs ?? []);

            // Check if all dependencies are satisfied
            const deps = extractDependencies(entry, knownNames, branchArgSet);
            if (deps.some((dep) => !Object.hasOwn(scope, dep))) {
                continue; // not ready yet
            }

            // Resolve args (substituting references from current scope)
            const resolvedArgs = renderArgs(entry, scope, branchArgSet, [...functions.values()], diagnostics);

            // Build context
            const ctx: TemplateContext = {
                args: resolvedArgs,
                answers: {},
                scope: { ...scope },
                now,
            };

            // Collect inputs
            let inputs: TemplateInput[];
            try {
                inputs = await fn.describeInputs(ctx);
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                throw new Error(`${entry.functionName}() for "${entry.name}" failed: ${msg}`);
            }
            const collectedAnswers: Record<string, string> = {};
            const qualifiedPrefix = entry.name;

            for (const input of inputs) {
                const qualifiedKey = `${qualifiedPrefix}.${input.name}`;
                ctx.answers = { ...collectedAnswers };

                // Resolve dynamic options if needed
                if (input.resolveOptions) {
                    const dynamicOptions = await input.resolveOptions(ctx);
                    const resolvedInput: TemplateInput = { ...input, options: dynamicOptions };
                    const value = await inputResolver.resolve(resolvedInput, qualifiedKey);
                    if (value === undefined) return true; // cancelled
                    collectedAnswers[input.name] = value;
                } else {
                    const value = await inputResolver.resolve(input, qualifiedKey);
                    if (value === undefined) return true; // cancelled
                    collectedAnswers[input.name] = value;
                }
            }

            // Run the function
            let result: unknown;
            try {
                result = await fn.resolve(collectedAnswers, { ...ctx, answers: collectedAnswers });
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                throw new Error(`${entry.functionName}() for "${entry.name}" failed: ${msg}`);
            }

            scope[entry.name] = result;
            unresolved.splice(i, 1);
        }

        // If no progress was made, we have a cycle or unsatisfiable dependency
        if (unresolved.length === beforeCount) {
            const blockingInfo = unresolved.map((entry) => {
                const fn = functions.get(entry.functionName);
                const branchArgSet = new Set(fn?.branchArgs ?? []);
                const deps = extractDependencies(entry, knownNames, branchArgSet);
                const firstBlocked = deps.find((dep) => !Object.hasOwn(scope, dep));
                return firstBlocked
                    ? `"${entry.name}" (waiting on "${firstBlocked}")`
                    : `"${entry.name}"`;
            });
            throw new Error(
                `Template has unresolvable entries (circular dependency or missing reference): ${blockingInfo.join(", ")}`
            );
        }
    }

    return false;
}

// ── Argument rendering ───────────────────────────────────────────────────────

function renderArgs(
    entry: FrontmatterEntry,
    scope: Readonly<Record<string, unknown>>,
    branchArgSet: ReadonlySet<number>,
    functions: readonly TemplateFunction[],
    diagnostics: string[],
): TemplateArg[] {
    return entry.args.map((arg, i): TemplateArg => {
        // For branch args, we still render (substitute from current scope) but without
        // blocking on their dependencies
        if (arg.options) {
            return { value: arg.raw, options: arg.options };
        }

        if (arg.isReference) {
            // Single reference — substitute
            const rendered = renderExpressions(arg.raw, scope, functions, branchArgSet.has(i) ? [] : diagnostics);
            return { value: rendered };
        }

        if (arg.isQuoted) {
            // Quoted string — substitute {{…}} inside it
            const rendered = renderExpressions(arg.raw, scope, functions, branchArgSet.has(i) ? [] : diagnostics);
            return { value: rendered };
        }

        // Plain identifier or number+unit — no substitution
        return { value: arg.raw };
    });
}

// ── Function map builder ─────────────────────────────────────────────────────

function buildFunctionMap(functions: TemplateFunction[]): Map<string, TemplateFunction> {
    const map = new Map<string, TemplateFunction>();
    for (const fn of functions) {
        if (!map.has(fn.name)) {
            map.set(fn.name, fn);
        }
    }
    return map;
}
