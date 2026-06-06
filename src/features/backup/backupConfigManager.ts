/** Reads and writes .memoria/backup-config.json. */

import * as vscode from "vscode";
import { textDecoder, textEncoder } from "../../utils/encoding";
import type { BackupConfig, BackupProfile, BackupProfileState } from "./types";

const BACKUP_CONFIG_FILE = "backup-config.json";

const DEFAULT_CONFIG: BackupConfig = {
    profiles: {},
    _state: {},
};

export class BackupConfigManager {
    constructor(
        private readonly fs: typeof vscode.workspace.fs = vscode.workspace.fs,
    ) {}

    /** Returns the URI of the backup config file for the given workspace root. */
    configUri(workspaceRoot: vscode.Uri): vscode.Uri {
        return vscode.Uri.joinPath(workspaceRoot, ".memoria", BACKUP_CONFIG_FILE);
    }

    /** Reads and parses the backup config. Returns null if the file does not exist or is corrupt. */
    async read(workspaceRoot: vscode.Uri): Promise<BackupConfig | null> {
        try {
            const bytes = await this.fs.readFile(this.configUri(workspaceRoot));
            const text = textDecoder.decode(bytes);
            const parsed = JSON.parse(text) as unknown;
            return this.normalize(parsed);
        } catch {
            return null;
        }
    }

    /** Writes the given config back to disk. Creates .memoria/ if absent. */
    async write(workspaceRoot: vscode.Uri, config: BackupConfig): Promise<void> {
        const memoriaDir = vscode.Uri.joinPath(workspaceRoot, ".memoria");
        try {
            await this.fs.createDirectory(memoriaDir);
        } catch {
            // Already exists — ignore
        }
        const bytes = textEncoder.encode(JSON.stringify(config, null, 2));
        await this.fs.writeFile(this.configUri(workspaceRoot), bytes);
    }

    /**
     * Updates state for a single profile and writes the config back to disk.
     * Does nothing if the config doesn't exist.
     */
    async updateState(
        workspaceRoot: vscode.Uri,
        profileName: string,
        state: BackupProfileState,
    ): Promise<void> {
        const config = await this.read(workspaceRoot);
        if (!config) return;
        config._state[profileName] = state;
        await this.write(workspaceRoot, config);
    }

    /**
     * Adds or updates a profile and writes the config back to disk.
     * Creates the config file if it does not exist.
     */
    async upsertProfile(
        workspaceRoot: vscode.Uri,
        profileName: string,
        profile: BackupProfile,
    ): Promise<void> {
        const existing = await this.read(workspaceRoot);
        const config = existing ?? { ...DEFAULT_CONFIG };
        config.profiles[profileName] = profile;
        await this.write(workspaceRoot, config);
    }

    private normalize(raw: unknown): BackupConfig {
        if (typeof raw !== "object" || raw === null) {
            return { ...DEFAULT_CONFIG };
        }
        const obj = raw as Record<string, unknown>;
        return {
            profiles: (typeof obj.profiles === "object" && obj.profiles !== null)
                ? (obj.profiles as Record<string, BackupProfile>)
                : {},
            _state: (typeof obj._state === "object" && obj._state !== null)
                ? (obj._state as Record<string, BackupProfileState>)
                : {},
        };
    }
}
