/**
 * Core backup execution logic:
 *   scan → hash → diff → prune → zip → update state
 */

import * as path from "path";
import * as os from "os";
import * as vscode from "vscode";
import type { BackupProfile, BackupProfileState } from "./types";
import { findChangedFiles, buildHashManifest } from "./hashManager";
import { createZip, buildZipFileName, ensureDir, ZipEntry } from "./zipCreator";
import { enforceRetention } from "./retentionManager";
import { formatSize } from "./backupUtils";
import type { RemoteBackupFilter } from "./gitRemoteStatus";

export type BackupStatus =
    | { kind: "success"; profileName: string; fileCount: number; sizeBytes: number }
    | { kind: "skipped"; profileName: string; newState?: BackupProfileState }
    | { kind: "failed"; profileName: string; reason: string };

/** Filter used when none is supplied — treats every file as needing backup. */
const ALL_FILES_FILTER: RemoteBackupFilter = {
    isRepo: false,
    hasUpstream: false,
    isPushedToRemote: () => false,
};

export interface BackupExecutorOptions {
    workspaceRoot: vscode.Uri;
    profileName: string;
    profile: BackupProfile;
    state: BackupProfileState;
    outputChannel: vscode.OutputChannel;
    /** Injectable for testing — defaults to vscode.workspace.fs. */
    fs?: typeof vscode.workspace.fs;
    /**
     * Filter identifying files already committed and pushed to the git remote.
     * Such files are skipped and their hashes dropped. Defaults to a filter that
     * treats every file as needing backup (non-git behavior).
     */
    remoteFilter?: RemoteBackupFilter;
    /** Injectable for testing — defaults to Date.now(). */
    now?: () => Date;
    /** Progress callback (count of processed files, total files). */
    onProgress?: (done: number, total: number) => void;
    /** Cancellation token. */
    token?: vscode.CancellationToken;
}

function log(channel: vscode.OutputChannel, message: string): void {
    const ts = new Date().toISOString().replace("T", " ").replace(/\.\d+Z$/, "");
    channel.appendLine(`[${ts}] ${message}`);
}

/**
 * Resolves workspace-relative glob patterns / folder paths to file URIs.
 * Applies exclusion patterns.
 */
async function resolveSourceFiles(
    workspaceRoot: vscode.Uri,
    sources: string[],
    excludes: string[],
): Promise<Array<{ uri: vscode.Uri; relativePath: string }>> {
    const results: Array<{ uri: vscode.Uri; relativePath: string }> = [];
    const seen = new Set<string>();

    const excludePattern = excludes.length > 0
        ? `{${excludes.join(",")}}`
        : undefined;

    // VS Code's asRelativePath() returns the workspace folder's own basename when given
    // the folder root URI (e.g. "conflict-resolver"), but sub-paths are returned WITHOUT
    // that basename (e.g. "Notes/x.md"). Sources captured for the whole folder therefore
    // carry a leading "<rootName>/" segment that, resolved against workspaceRoot, points at
    // a non-existent same-named subfolder. Strip it so the glob is truly root-relative.
    const rootName = path.basename(workspaceRoot.fsPath);

    for (const source of sources) {
        const normalized = normalizeSource(source, rootName);

        // Normalize folder sources to glob patterns
        const pattern = normalized === ""
            ? "**"
            : normalized.endsWith("/") ? `${normalized}**` : normalized;
        const glob = new vscode.RelativePattern(workspaceRoot, pattern);

        const uris = await vscode.workspace.findFiles(glob, excludePattern);
        for (const uri of uris) {
            const key = uri.toString();
            if (seen.has(key)) continue;
            seen.add(key);

            const relativePath = vscode.workspace
                .asRelativePath(uri, false)
                .replace(/\\/g, "/");

            results.push({ uri, relativePath });
        }
    }

    return results;
}

/**
 * Strips a leading workspace-root-name segment from a source path so it becomes
 * root-relative. A source equal to the root name (with or without a trailing slash)
 * normalizes to "" (the whole workspace folder).
 */
function normalizeSource(source: string, rootName: string): string {
    if (!rootName) return source;
    if (source === rootName || source === `${rootName}/`) return "";
    if (source.startsWith(`${rootName}/`)) return source.slice(rootName.length + 1);
    return source;
}

/**
 * Executes a single backup profile.
 * Returns a BackupStatus describing the outcome.
 */
export async function executeBackup(opts: BackupExecutorOptions): Promise<BackupStatus> {
    const {
        workspaceRoot,
        profileName,
        profile,
        state,
        outputChannel: channel,
        fs: fsApi = vscode.workspace.fs,
        remoteFilter = ALL_FILES_FILTER,
        now = () => new Date(),
        onProgress,
        token,
    } = opts;

    const logLine = (msg: string) => log(channel, msg);

    logLine(`Starting backup: ${profileName}`);
    logLine(`Scanning sources: ${profile.sources.join(", ")}`);

    // 1. Resolve source files
    const allFiles = await resolveSourceFiles(workspaceRoot, profile.sources, profile.exclude);

    if (token?.isCancellationRequested) {
        return { kind: "failed", profileName, reason: "Cancelled" };
    }

    // 1b. Exclude files already committed and pushed to the git remote. Those are
    //     safely stored remotely, so they need neither backing up nor a hash entry.
    const candidates: Array<{ uri: vscode.Uri; relativePath: string }> = [];
    let pushedCount = 0;
    for (const file of allFiles) {
        if (remoteFilter.isPushedToRemote(file.uri.fsPath)) {
            pushedCount++;
        } else {
            candidates.push(file);
        }
    }

    if (remoteFilter.isRepo) {
        logLine(
            `Git detected (upstream ${remoteFilter.hasUpstream ? "present" : "missing"}): ` +
            `${pushedCount} file(s) already pushed to remote — excluded from backup`,
        );
    }

    // 2. Find changed files (among files not yet safely in the remote)
    const previousHashes = state.hashes ?? {};
    logLine(`Found ${allFiles.length} files, computing changes…`);

    const changedFiles = await findChangedFiles(candidates, previousHashes, fsApi);

    if (token?.isCancellationRequested) {
        return { kind: "failed", profileName, reason: "Cancelled" };
    }

    logLine(`Found ${candidates.length} candidate files, ${changedFiles.length} changed since last backup`);

    // 3. Skip if nothing changed. Still persist a pruned hash manifest when files
    //    that were previously tracked are now safely pushed (drop their hashes).
    if (changedFiles.length === 0) {
        const prunedHashes = await buildHashManifest(candidates, fsApi);
        if (!hashesEqual(prunedHashes, previousHashes)) {
            logLine(`No changes detected — dropping hashes for files now stored in the remote`);
            return {
                kind: "skipped",
                profileName,
                newState: { lastBackupTime: state.lastBackupTime, hashes: prunedHashes },
            };
        }
        logLine(`No changes detected — skipping backup`);
        return { kind: "skipped", profileName };
    }

    // 4. Prune old backups (before writing new one)
    const targetFolder = profile.targetFolder;
    try {
        await ensureDir(targetFolder);
    } catch (err) {
        const reason = `Cannot create target folder: ${err instanceof Error ? err.message : String(err)}`;
        logLine(reason);
        return { kind: "failed", profileName, reason };
    }

    logLine(`Pruning old backups: retention=${profile.retention}`);
    const pruneResult = await enforceRetention(targetFolder, profileName, profile.retention, logLine);
    if (pruneResult.deleted.length > 0) {
        logLine(`  Removed ${pruneResult.deleted.length} old backup(s)`);
    }

    // 5. Read file contents and build zip entries
    const zipEntries: ZipEntry[] = [];
    let done = 0;
    for (const file of changedFiles) {
        if (token?.isCancellationRequested) {
            return { kind: "failed", profileName, reason: "Cancelled" };
        }
        try {
            const bytes = await fsApi.readFile(file.uri);
            zipEntries.push({ content: Buffer.from(bytes), relativePath: file.relativePath });
        } catch {
            logLine(`  Warning: could not read ${file.relativePath} — skipped`);
        }
        done++;
        onProgress?.(done, changedFiles.length);
    }

    if (zipEntries.length === 0) {
        return { kind: "skipped", profileName };
    }

    // 6. Write zip
    const zipName = buildZipFileName(profileName, os.hostname(), now());
    const zipPath = path.join(targetFolder, zipName);

    let sizeBytes: number;
    try {
        sizeBytes = await createZip(zipEntries, zipPath);
    } catch (err) {
        const reason = `Failed to write zip: ${err instanceof Error ? err.message : String(err)}`;
        logLine(reason);
        return { kind: "failed", profileName, reason };
    }

    logLine(`Created: ${zipPath} (${formatSize(sizeBytes)})`);

    // 7. Update hash manifest for the tracked (non-pushed) source files. Files
    //    already pushed to the remote are intentionally omitted, dropping their hashes.
    const newHashes = await buildHashManifest(candidates, fsApi);

    // 8. Return success — caller is responsible for persisting state
    logLine(`Hash manifest updated for ${changedFiles.length} files`);
    logLine(`Backup complete: ${profileName}`);

    // Attach new state to the result for the caller to persist
    const newState: BackupProfileState = {
        lastBackupTime: now().toISOString(),
        hashes: newHashes,
    };

    return Object.assign(
        { kind: "success" as const, profileName, fileCount: zipEntries.length, sizeBytes },
        { newState },
    );
}

export interface SuccessBackupStatus {
    kind: "success";
    profileName: string;
    fileCount: number;
    sizeBytes: number;
    newState: BackupProfileState;
}

/** Shallow structural equality for two hash manifests. */
function hashesEqual(a: Record<string, string>, b: Record<string, string>): boolean {
    const aKeys = Object.keys(a);
    if (aKeys.length !== Object.keys(b).length) return false;
    for (const key of aKeys) {
        if (a[key] !== b[key]) return false;
    }
    return true;
}
