/**
 * Git-aware backup filtering.
 *
 * Determines which workspace files are already committed AND pushed to the
 * remote tracking branch. Such files are considered "safely stored" and are
 * excluded from backups (their hashes are also dropped from the manifest).
 *
 * A file is only treated as safely-pushed when ALL of the following hold:
 *   - the workspace is inside a git work tree,
 *   - the current branch has an upstream/remote tracking branch,
 *   - the file is tracked by git,
 *   - the file has no working-tree / index modifications, and
 *   - no unpushed commit touches the file.
 *
 * When the workspace is not a git repository (or has no upstream, or git is
 * unavailable) the filter is conservative: nothing is considered pushed, so the
 * backup falls back to hashing every source file exactly as before.
 */

import { execFile } from "child_process";
import * as path from "path";
import * as vscode from "vscode";

/** Runs a git subcommand and resolves its stdout plus exit code (never rejects). */
export type GitRunner = (args: string[], cwd: string) => Promise<{ stdout: string; exitCode: number }>;

const GIT_TIMEOUT_MS = 15_000;
const GIT_MAX_BUFFER = 64 * 1024 * 1024;

const defaultRunner: GitRunner = (args, cwd) =>
    new Promise((resolve) => {
        execFile(
            "git",
            args,
            { cwd, timeout: GIT_TIMEOUT_MS, maxBuffer: GIT_MAX_BUFFER, windowsHide: true },
            (err, stdout) => {
                if (err) {
                    const code = typeof (err as NodeJS.ErrnoException & { code?: unknown }).code === "number"
                        ? Number((err as { code: number }).code)
                        : 1;
                    resolve({ stdout: stdout ?? "", exitCode: code });
                } else {
                    resolve({ stdout: stdout ?? "", exitCode: 0 });
                }
            },
        );
    });

export interface RemoteBackupFilter {
    /** Whether the workspace root is inside a git work tree. */
    isRepo: boolean;
    /** Whether the current branch has an upstream / remote tracking branch. */
    hasUpstream: boolean;
    /**
     * Returns true when the file's current on-disk content is confirmed to be
     * committed AND pushed to the remote tracking branch — i.e. it is safe to
     * skip from the backup and drop from the hash manifest.
     */
    isPushedToRemote(fileFsPath: string): boolean;
}

/** A filter that treats every file as needing backup (git unavailable / not a repo). */
const NO_REPO_FILTER: RemoteBackupFilter = {
    isRepo: false,
    hasUpstream: false,
    isPushedToRemote: () => false,
};

/**
 * Builds a {@link RemoteBackupFilter} for the given workspace root by inspecting
 * git state. Best-effort: any git failure yields a conservative filter that
 * considers nothing pushed.
 */
export async function getRemoteBackupFilter(
    workspaceRoot: vscode.Uri,
    runGit: GitRunner = defaultRunner,
): Promise<RemoteBackupFilter> {
    const cwd = workspaceRoot.fsPath;

    // 1. Is this path inside a git work tree?
    const insideWorkTree = await runGit(["rev-parse", "--is-inside-work-tree"], cwd);
    if (insideWorkTree.exitCode !== 0 || insideWorkTree.stdout.trim() !== "true") {
        return NO_REPO_FILTER;
    }

    // 2. Repo top level — git reports paths relative to this directory.
    const topLevel = await runGit(["rev-parse", "--show-toplevel"], cwd);
    const repoRoot = topLevel.stdout.trim();
    if (topLevel.exitCode !== 0 || !repoRoot) {
        return NO_REPO_FILTER;
    }

    // 3. Upstream tracking branch. Without one, nothing is confirmed pushed.
    const upstream = await runGit(
        ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"],
        cwd,
    );
    const hasUpstream = upstream.exitCode === 0 && upstream.stdout.trim().length > 0;
    if (!hasUpstream) {
        return { isRepo: true, hasUpstream: false, isPushedToRemote: () => false };
    }

    // 4. Tracked files (repo-relative POSIX paths).
    const lsFiles = await runGit(["ls-files", "-z"], cwd);
    const tracked = new Set(parseZ(lsFiles.stdout));

    // 5. Files with working-tree / index changes, plus untracked & deleted files.
    const status = await runGit(["status", "--porcelain=v1", "-z", "--untracked-files=all"], cwd);
    const dirty = parseStatusZ(status.stdout);

    // 6. Files touched by commits that have not been pushed to the upstream.
    const unpushed = await runGit(["diff", "--name-only", "-z", "@{upstream}", "HEAD"], cwd);
    for (const rel of parseZ(unpushed.stdout)) {
        dirty.add(rel);
    }

    return {
        isRepo: true,
        hasUpstream: true,
        isPushedToRemote(fileFsPath: string): boolean {
            const rel = toRepoRelative(repoRoot, fileFsPath);
            if (rel === null) return false; // outside the repo
            return tracked.has(rel) && !dirty.has(rel);
        },
    };
}

/** Splits NUL-separated git output into non-empty tokens. */
function parseZ(stdout: string): string[] {
    return stdout.split("\0").filter((s) => s.length > 0);
}

/**
 * Parses `git status --porcelain=v1 -z` output into the set of affected paths.
 * Rename / copy entries carry an extra source-path token that is also captured.
 */
function parseStatusZ(stdout: string): Set<string> {
    const out = new Set<string>();
    const parts = stdout.split("\0");
    for (let i = 0; i < parts.length; i++) {
        const entry = parts[i];
        if (!entry) continue;
        // Format: "XY <path>" — two status chars, a space, then the path.
        const status = entry.slice(0, 2);
        const filePath = entry.slice(3);
        if (filePath) out.add(filePath);
        // Rename ('R') / copy ('C') entries are followed by the original path.
        if (status[0] === "R" || status[0] === "C") {
            const src = parts[++i];
            if (src) out.add(src);
        }
    }
    return out;
}

/**
 * Converts an absolute file path to a repo-root-relative POSIX path.
 * Returns null when the file lies outside the repo root.
 */
function toRepoRelative(repoRoot: string, fileFsPath: string): string | null {
    const rel = path.relative(repoRoot, fileFsPath);
    if (rel === "" || rel.startsWith("..") || path.isAbsolute(rel)) {
        return null;
    }
    return rel.split(path.sep).join("/");
}
