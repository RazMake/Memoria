/** Enforces backup retention limits by pruning old zip files. */

import * as fs from "fs";
import { listProfileZips } from "./zipCreator";

export interface RetentionResult {
    deleted: string[];
    errors: string[];
}

/**
 * Deletes old backups to ensure at most `retention - 1` zips exist in the
 * target folder before the new backup is written.
 *
 * Oldest backups (lexicographically smallest names) are deleted first.
 *
 * @param folderPath   Absolute path to the target folder.
 * @param profileName  Profile name (used to identify matching zips).
 * @param retention    Maximum number of zips to keep (including the one about to be created).
 * @param log          Optional logger for pruning actions.
 */
export async function enforceRetention(
    folderPath: string,
    profileName: string,
    retention: number,
    log?: (message: string) => void,
): Promise<RetentionResult> {
    const result: RetentionResult = { deleted: [], errors: [] };

    if (retention <= 0) return result;

    const existing = await listProfileZips(folderPath, profileName);

    // We want to keep (retention - 1) existing + the new one = retention total
    const toDeleteCount = existing.length - (retention - 1);
    if (toDeleteCount <= 0) return result;

    const toDelete = existing.slice(0, toDeleteCount);

    for (const filePath of toDelete) {
        try {
            await fs.promises.unlink(filePath);
            result.deleted.push(filePath);
            log?.(`  Deleted: ${filePath}`);
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            result.errors.push(`Failed to delete ${filePath}: ${msg}`);
            log?.(`  Warning: failed to delete ${filePath}: ${msg}`);
        }
    }

    return result;
}
