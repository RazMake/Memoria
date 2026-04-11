// Discovers and loads bundled blueprints from the extension's resources directory.
// Resolved via context.extensionUri so paths work correctly in both dev and installed contexts.

import * as vscode from "vscode";
import { parseBlueprintYaml } from "./blueprintParser";
import type { BlueprintDefinition, BlueprintInfo } from "./types";

const decoder = new TextDecoder();

export class BlueprintRegistry {
    private readonly blueprintsRoot: vscode.Uri;

    constructor(extensionUri: vscode.Uri) {
        this.blueprintsRoot = vscode.Uri.joinPath(extensionUri, "resources", "blueprints");
    }

    /** Lists all discoverable bundled blueprints with their summary info. */
    async listBlueprints(): Promise<BlueprintInfo[]> {
        const entries = await vscode.workspace.fs.readDirectory(this.blueprintsRoot);
        const dirs = entries.filter(([, type]) => type === vscode.FileType.Directory);

        // Parallel reads — avoids sequential I/O scaling with blueprint count.
        return Promise.all(
            dirs.map(async ([name]) => {
                const blueprintPath = vscode.Uri.joinPath(this.blueprintsRoot, name);
                const definition = await this.readDefinition(blueprintPath);
                return {
                    id: name,
                    name: definition.name,
                    description: definition.description,
                    version: definition.version,
                    path: blueprintPath,
                };
            })
        );
    }

    /** Reads and fully parses the blueprint definition for a given blueprint id. */
    async getBlueprintDefinition(id: string): Promise<BlueprintDefinition> {
        const blueprintPath = vscode.Uri.joinPath(this.blueprintsRoot, id);
        return this.readDefinition(blueprintPath);
    }

    /**
     * Returns the raw bytes of a seed file from the blueprint's files/ directory.
     * Returns null when no seed file exists — the scaffold layer will create an empty file instead.
     */
    async getSeedFileContent(blueprintId: string, relativePath: string): Promise<Uint8Array | null> {
        const seedUri = vscode.Uri.joinPath(this.blueprintsRoot, blueprintId, "files", ...relativePath.split("/"));
        try {
            return await vscode.workspace.fs.readFile(seedUri);
        } catch {
            return null;
        }
    }

    private async readDefinition(blueprintPath: vscode.Uri): Promise<BlueprintDefinition> {
        const yamlUri = vscode.Uri.joinPath(blueprintPath, "blueprint.yaml");
        const bytes = await vscode.workspace.fs.readFile(yamlUri);
        const content = decoder.decode(bytes);
        return parseBlueprintYaml(content);
    }
}
