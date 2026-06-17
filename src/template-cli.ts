#!/usr/bin/env node
/**
 * Template CLI — renders Memoria templates outside VS Code.
 * Verbs: render, invoke, describe, list-templates
 * No vscode imports.
 */

import * as fs from "fs";
import * as path from "path";
import { renderTemplate } from "./features/snippets/templates/templateEngine";
import { parseTemplate, parseFunctionCall } from "./features/snippets/templates/templateParser";
import { CORE_BUILTINS } from "./features/snippets/templates/coreBuiltins";
import { compileFunctionSource, validateFunctions } from "./features/snippets/templates/functionLoader";
import { createPeopleFunctions } from "./features/snippets/peopleFunctions";
import { DiskContactsProvider } from "./cli/diskContactsProvider";
import { CliInputResolver } from "./cli/cliInputResolver";
import type { TemplateFunction } from "./features/snippets/templates/templateTypes";

// ── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
    const args = process.argv.slice(2);
    const verb = args[0];

    if (!verb || verb === "--help" || verb === "-h") {
        printHelp();
        process.exit(0);
    }

    const parsedArgs = parseCliArgs(args.slice(1));

    const workspaceRoot = parsedArgs["root"] as string
        ?? readEngineConfig()?.workspaceRoot
        ?? process.cwd();

    const contactsProvider = DiskContactsProvider.fromBlueprintManifest(workspaceRoot);
    if (contactsProvider) {
        await contactsProvider.load();
    }

    const hostFunctions: TemplateFunction[] = contactsProvider
        ? createPeopleFunctions(contactsProvider)
        : [];

    const templatesFolder = parsedArgs["templates-folder"] as string
        ?? readEngineConfig()?.templatesFolder
        ?? readTemplatesFolderFromManifest(workspaceRoot);

    switch (verb) {
        case "render":
            await cmdRender(parsedArgs, workspaceRoot, templatesFolder, hostFunctions);
            break;
        case "invoke":
            await cmdInvoke(parsedArgs, workspaceRoot, templatesFolder, hostFunctions);
            break;
        case "describe":
            await cmdDescribe(parsedArgs, workspaceRoot, templatesFolder, hostFunctions);
            break;
        case "list-templates":
            await cmdListTemplates(parsedArgs, workspaceRoot, templatesFolder);
            break;
        default:
            process.stderr.write(`Unknown verb: "${verb}"\n`);
            process.exit(1);
    }
}

// ── render verb ───────────────────────────────────────────────────────────────

async function cmdRender(
    args: Record<string, unknown>,
    workspaceRoot: string,
    templatesFolder: string | null,
    hostFunctions: TemplateFunction[],
): Promise<void> {
    const templatePath = args["_"][0] as string | undefined;
    if (!templatePath) {
        process.stderr.write("Usage: render <templatePath> [--params <json>] [--out <file>] [--force]\n");
        process.exit(1);
    }

    const templateText = readTemplateFile(workspaceRoot, templatesFolder, templatePath);
    const params = parseParams(args["params"] as string | undefined);
    const outFile = args["out"] as string | undefined;
    const force = Boolean(args["force"]);

    const userFunctions = loadUserFunctions(workspaceRoot, templatesFolder);
    const allFunctions = [...hostFunctions, ...userFunctions];

    const inputResolver = new CliInputResolver(params);
    const result = await renderTemplate({
        templateText,
        inputResolver,
        functions: allFunctions,
    });

    if (result.diagnostics.length > 0) {
        process.stderr.write(`Diagnostics: ${result.diagnostics.join("; ")}\n`);
    }

    if (outFile) {
        const resolvedOut = resolveOutputPath(outFile, workspaceRoot);
        if (!force && fs.existsSync(resolvedOut)) {
            process.stderr.write(`Output file already exists: "${resolvedOut}". Use --force to overwrite.\n`);
            process.exit(1);
        }
        fs.writeFileSync(resolvedOut, result.text, "utf-8");
    } else {
        process.stdout.write(result.text);
    }
}

// ── invoke verb ───────────────────────────────────────────────────────────────

async function cmdInvoke(
    args: Record<string, unknown>,
    workspaceRoot: string,
    templatesFolder: string | null,
    hostFunctions: TemplateFunction[],
): Promise<void> {
    const target = args["_"][0] as string | undefined;
    if (!target) {
        process.stderr.write("Usage: invoke <target> [--params <json>]\n");
        process.exit(1);
    }

    const params = parseParams(args["params"] as string | undefined);
    const userFunctions = loadUserFunctions(workspaceRoot, templatesFolder);
    const allFunctions = [...hostFunctions, ...userFunctions, ...CORE_BUILTINS];

    const inputResolver = new CliInputResolver(params);

    // Determine if this is a templatePath#name or raw call
    if (target.includes("#")) {
        const [templatePath, entryName] = target.split("#", 2);
        const templateText = readTemplateFile(workspaceRoot, templatesFolder, templatePath);
        const result = await renderTemplate({
            templateText,
            inputResolver,
            functions: [...hostFunctions, ...userFunctions],
        });
        const value = result.scope[entryName];
        if (value === undefined) {
            process.stderr.write(`Entry "${entryName}" not found in template "${templatePath}".\n`);
            process.exit(1);
        }
        process.stdout.write(JSON.stringify(value, null, 2) + "\n");
    } else {
        // Raw function call
        const { functionName, args: fnArgs } = parseFunctionCall(target);
        const fn = allFunctions.find((f) => f.name === functionName);
        if (!fn) {
            process.stderr.write(`Unknown function: "${functionName}"\n`);
            process.exit(1);
        }

        const ctx = {
            args: fnArgs.map((a) => ({ value: a.raw, options: a.options, isQuoted: a.isQuoted })),
            answers: {},
            scope: {},
            now: new Date(),
        };

        const inputs = await fn.describeInputs(ctx);
        const collectedAnswers: Record<string, string> = {};
        for (const input of inputs) {
            const qualifiedKey = `${functionName}.${input.name}`;
            const value = await inputResolver.resolve(input, qualifiedKey);
            if (value === undefined) {
                process.stderr.write(`Cancelled at input "${qualifiedKey}".\n`);
                process.exit(1);
            }
            collectedAnswers[input.name] = value;
        }

        const result = await fn.resolve(collectedAnswers, { ...ctx, answers: collectedAnswers });
        process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    }
}

// ── describe verb ─────────────────────────────────────────────────────────────

async function cmdDescribe(
    args: Record<string, unknown>,
    workspaceRoot: string,
    templatesFolder: string | null,
    hostFunctions: TemplateFunction[],
): Promise<void> {
    const templatePath = args["_"][0] as string | undefined;
    if (!templatePath) {
        process.stderr.write("Usage: describe <templatePath>\n");
        process.exit(1);
    }

    const templateText = readTemplateFile(workspaceRoot, templatesFolder, templatePath);
    const params = parseParams(args["params"] as string | undefined);
    const parsed = parseTemplate(templateText);
    const userFunctions = loadUserFunctions(workspaceRoot, templatesFolder);
    const allFunctions = new Map([...CORE_BUILTINS, ...hostFunctions, ...userFunctions].map((f) => [f.name, f]));

    const schema: unknown[] = [];
    const now = new Date();

    for (const entry of parsed.entries) {
        const fn = allFunctions.get(entry.functionName);
        if (!fn) continue;

        // Extract per-entry answers from the flat params: "entryName.inputName" → "inputName"
        const entryAnswers: Record<string, string> = Object.fromEntries(
            Object.entries(params)
                .filter(([k]) => k.startsWith(`${entry.name}.`))
                .map(([k, v]) => [k.slice(entry.name.length + 1), v]),
        );

        const ctx = {
            args: entry.args.map((a) => ({ value: a.raw, options: a.options, isQuoted: a.isQuoted })),
            answers: entryAnswers,
            scope: {},
            now,
        };

        const inputs = await fn.describeInputs(ctx);
        for (const input of inputs) {
            const qualifiedKey = `${entry.name}.${input.name}`;
            if (typeof input.resolveOptions === "function") {
                if (Object.keys(entryAnswers).length > 0) {
                    // Caller supplied preceding answers — resolve the options now.
                    const resolvedOptions = await input.resolveOptions(ctx);
                    schema.push({ key: qualifiedKey, label: input.label, kind: input.kind, options: resolvedOptions });
                } else {
                    // No preceding answers yet — signal caller to re-run describe after answering earlier inputs.
                    schema.push({ key: qualifiedKey, label: input.label, kind: input.kind, dynamic: true });
                }
            } else {
                schema.push({ key: qualifiedKey, label: input.label, kind: input.kind, options: input.options });
            }
        }
    }

    process.stdout.write(JSON.stringify(schema, null, 2) + "\n");
}

// ── list-templates verb ───────────────────────────────────────────────────────

async function cmdListTemplates(
    _args: Record<string, unknown>,
    workspaceRoot: string,
    templatesFolder: string | null,
): Promise<void> {
    if (!templatesFolder) {
        process.stdout.write("[]\n");
        return;
    }

    const folderPath = path.join(workspaceRoot, templatesFolder);
    const templates = discoverTemplateFiles(folderPath, "");

    const result = templates.map(({ relativePath }) => {
        let title: string | null = null;
        try {
            const text = fs.readFileSync(path.join(folderPath, relativePath), "utf-8");
            const parsed = parseTemplate(text);
            title = parsed.title;
        } catch {
            // ignore
        }

        const category = relativePath.includes("/")
            ? relativePath.split("/").slice(0, -1).join("/")
            : null;

        return { path: relativePath, category, title };
    });

    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function discoverTemplateFiles(folderPath: string, prefix: string): Array<{ relativePath: string }> {
    if (!fs.existsSync(folderPath)) return [];

    const entries = fs.readdirSync(folderPath, { withFileTypes: true });
    const results: Array<{ relativePath: string }> = [];

    for (const entry of entries) {
        if (entry.name.startsWith("_")) continue;

        if (entry.isDirectory()) {
            const subPrefix = prefix ? `${prefix}/${entry.name}` : entry.name;
            results.push(...discoverTemplateFiles(path.join(folderPath, entry.name), subPrefix));
        } else if (entry.isFile() && entry.name.endsWith(".md")) {
            const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
            results.push({ relativePath });
        }
    }

    return results;
}

export function readTemplateFile(
    workspaceRoot: string,
    templatesFolder: string | null,
    templatePath: string,
): string {
    const fullPath = templatesFolder
        ? path.join(workspaceRoot, templatesFolder, templatePath)
        : path.join(workspaceRoot, templatePath);

    if (!fs.existsSync(fullPath)) {
        process.stderr.write(`Template not found: "${fullPath}"\n`);
        process.exit(1);
    }

    return fs.readFileSync(fullPath, "utf-8");
}

export function loadUserFunctions(workspaceRoot: string, templatesFolder: string | null): TemplateFunction[] {
    if (!templatesFolder) return [];

    const functionsDir = path.join(workspaceRoot, templatesFolder, "_functions");
    if (!fs.existsSync(functionsDir)) return [];

    const files = fs.readdirSync(functionsDir).filter((f) => f.endsWith(".ts"));
    const allFunctions: TemplateFunction[] = [];

    for (const file of files) {
        try {
            const source = fs.readFileSync(path.join(functionsDir, file), "utf-8");
            const fns = compileFunctionSource(source, {});
            validateFunctions(fns, new Set(allFunctions.map((f) => f.name)));
            allFunctions.push(...fns);
        } catch (err) {
            process.stderr.write(`Warning: Failed to load function file "${file}": ${(err as Error).message}\n`);
        }
    }

    return allFunctions;
}

export function parseParams(paramsJson: string | undefined): Record<string, string> {
    if (!paramsJson) return {};
    try {
        return JSON.parse(paramsJson);
    } catch {
        process.stderr.write(`Invalid --params JSON: ${paramsJson}\n`);
        process.exit(1);
    }
}

export function resolveOutputPath(outFile: string, workspaceRoot: string): string {
    const resolved = path.isAbsolute(outFile) ? outFile : path.join(process.cwd(), outFile);
    // Safety check: output must be within workspace root
    const relative = path.relative(workspaceRoot, resolved);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
        process.stderr.write(`Output path "${resolved}" is outside the workspace root "${workspaceRoot}".\n`);
        process.exit(1);
    }
    return resolved;
}

export function parseCliArgs(args: string[]): Record<string, unknown> {
    const result: Record<string, unknown> = { "_": [] as string[] };
    let i = 0;

    while (i < args.length) {
        const arg = args[i];
        if (arg.startsWith("--")) {
            const key = arg.slice(2);
            const next = args[i + 1];
            if (next !== undefined && !next.startsWith("--")) {
                result[key] = next;
                i += 2;
            } else {
                result[key] = true;
                i++;
            }
        } else {
            (result["_"] as string[]).push(arg);
            i++;
        }
    }

    return result;
}

export function readEngineConfig(): Record<string, string> | null {
    const configPath = path.join(process.cwd(), ".memoria", "engine-config.json");
    if (!fs.existsSync(configPath)) return null;
    try {
        return JSON.parse(fs.readFileSync(configPath, "utf-8"));
    } catch {
        return null;
    }
}

export function readTemplatesFolderFromManifest(workspaceRoot: string): string | null {
    const manifestPath = path.join(workspaceRoot, ".memoria", "blueprint.json");
    if (!fs.existsSync(manifestPath)) return null;
    try {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
        return manifest?.snippets?.templatesFolder ?? null;
    } catch {
        return null;
    }
}

function printHelp(): void {
    process.stdout.write(`
Memoria Template CLI

Usage: template-cli <verb> [options]

Verbs:
  render <templatePath> [--params <json>] [--out <file>] [--force] [--root <dir>]
    Render a template to stdout or a file.

  invoke <target> [--params <json>] [--root <dir>]
    Resolve a single function. Target is "FunctionName(args)" or "templatePath#name".

  describe <templatePath> [--root <dir>]
    Print the input schema for a template.

  list-templates [--root <dir>]
    List all available templates.

Options:
  --root <dir>            Workspace root directory
  --params <json>         JSON object of pre-supplied input values
  --out <file>            Output file path (render only)
  --force                 Overwrite existing output file
  --templates-folder <p>  Override templates folder
`);
}

// Only run when executed directly — not when imported for testing
if (require.main === module) {
    main().catch((err) => {
        process.stderr.write(`Error: ${(err as Error).message}\n`);
        process.exit(1);
    });
}
