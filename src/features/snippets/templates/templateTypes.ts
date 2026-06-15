/**
 * Core type definitions for the template engine.
 * No vscode imports. No Contacts types.
 * Exported as the public API for user function files via the "memoria-templates" module.
 */

/** How a template input value is collected. */
export type InputKind = "pick" | "freeText";

/** An option in a pick list. */
export interface PickOption {
    value: string;
    label: string;
    detail?: string;
}

/** A single input that a template function needs from the user. */
export interface TemplateInput {
    /** Unique key within this function instance (qualified by the frontmatter name at runtime). */
    name: string;
    /** Human-readable prompt shown to the user. */
    label: string;
    /** How the value is collected. */
    kind: InputKind;
    /** Static options for kind === "pick". */
    options?: PickOption[];
    /**
     * Lazily compute pick options from the answers already collected for THIS function.
     * Takes precedence over `options`.
     */
    resolveOptions?(ctx: TemplateContext):
        | PickOption[]
        | Promise<PickOption[]>;
    /** Default value used when none is supplied. */
    default?: string;
}

/** One frontmatter argument after reference/template substitution. */
export interface TemplateArg {
    /** Rendered scalar value (references and embedded {{…}} already substituted). */
    value: string;
    /** For union arguments (A | B | C), the list of options; otherwise undefined. */
    options?: string[];
}

/** Runtime context passed to TemplateFunction.describeInputs and .resolve. */
export interface TemplateContext {
    /** Rendered arguments from the frontmatter call, in order. */
    args: TemplateArg[];
    /** Inputs already collected for THIS function, by input name. */
    answers: Record<string, string>;
    /** Already-resolved frontmatter entries, for functions that inspect prior results. */
    scope: Record<string, unknown>;
    /** Today's date, injected for deterministic testing. */
    now: Date;
}

/** A template function: declares its inputs and resolves to a value. */
export interface TemplateFunction<T = unknown> {
    /** Function name as referenced in the frontmatter (e.g. "PeopleSelector"). */
    name: string;
    /**
     * Ordered inputs to collect. Called before resolution; results drive the InputResolver.
     */
    describeInputs(ctx: TemplateContext): TemplateInput[] | Promise<TemplateInput[]>;
    /** Produce the result (object, scalar, or conditional text) from collected inputs + context. */
    resolve(inputs: Record<string, string>, ctx: TemplateContext): T | Promise<T>;
    /**
     * Text used when the body references {{name}} directly (no property access).
     * Required for functions that return an object.
     */
    display?(result: T): string;
    /**
     * Argument positions (0-based) whose {{…}} references are branch content —
     * not extracted as resolution dependencies. Used by conditional functions.
     */
    branchArgs?: number[];
}

/** Abstraction over user-input collection — differs between VS Code and CLI. */
export interface InputResolver {
    /** Resolve a single input. Returns undefined to cancel the entire render. */
    resolve(input: TemplateInput, qualifiedKey: string): Promise<string | undefined>;
}

/** Options passed to renderTemplate(). */
export interface RenderOptions {
    templateText: string;
    inputResolver: InputResolver;
    /**
     * Host-registered functions (people/date built-ins and user functions).
     * The core adds FreeText and IfWithin itself.
     */
    functions: TemplateFunction[];
    /** Overrides "now" for deterministic tests; defaults to new Date(). */
    now?: Date;
}

/** Result returned by renderTemplate(). */
export interface RenderResult {
    /** Body with all substitutions applied and frontmatter removed. */
    text: string;
    /** The resolved scope: frontmatter name → result object. */
    scope: Record<string, unknown>;
    /** Non-fatal issues (unknown property, empty group, …). */
    diagnostics: string[];
}
