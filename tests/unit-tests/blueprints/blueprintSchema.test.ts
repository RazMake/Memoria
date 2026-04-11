import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { createRequire } from "node:module";
import Ajv from "ajv";

// Resolve `yaml` from src/node_modules where it is installed as a runtime dependency.
const require = createRequire(resolve(__dirname, "../../../src/package.json"));
const { parse } = require("yaml") as typeof import("yaml");

/**
 * Contract tests that validate bundled blueprint YAML files against the JSON schema.
 *
 * These tests catch schema drift — when blueprint.yaml files or the TypeScript types
 * evolve but the JSON schema in .vscode/blueprint.schema.json is not updated to match.
 *
 * If a test fails here, update .vscode/blueprint.schema.json to match the current
 * blueprint structure defined in src/blueprints/types.ts.
 */

const schemaPath = resolve(__dirname, "../../../.vscode/blueprint.schema.json");
const schema = JSON.parse(readFileSync(schemaPath, "utf-8"));

const blueprintsDir = resolve(__dirname, "../../../src/resources/blueprints");
const blueprintFolders = readdirSync(blueprintsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

const ajv = new Ajv({ allErrors: true });
const validate = ajv.compile(schema);

describe("blueprint.schema.json contract", () => {
    it("should have at least one bundled blueprint to validate against", () => {
        expect(blueprintFolders.length).toBeGreaterThan(0);
    });

    for (const folder of blueprintFolders) {
        it(`should validate ${folder}/blueprint.yaml against the schema`, () => {
            const yamlPath = join(blueprintsDir, folder, "blueprint.yaml");
            const content = readFileSync(yamlPath, "utf-8");
            const parsed = parse(content);

            const valid = validate(parsed);

            expect(
                valid,
                `${folder}/blueprint.yaml failed schema validation:\n` +
                (validate.errors ?? [])
                    .map((e) => `  ${e.instancePath || "/"}: ${e.message}`)
                    .join("\n")
            ).toBe(true);
        });
    }
});
