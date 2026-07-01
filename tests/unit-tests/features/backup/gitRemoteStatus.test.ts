import { describe, it, expect, vi } from "vitest";

vi.mock("vscode", () => ({}));

import {
    getRemoteBackupFilter,
    type GitRunner,
} from "../../../../src/features/backup/gitRemoteStatus";

const ROOT = { fsPath: "/repo" } as any;

/** Builds a GitRunner from a map of "arg0 arg1 …" → { stdout, exitCode }. */
function makeRunner(
    responses: Record<string, { stdout?: string; exitCode?: number }>,
): GitRunner {
    return vi.fn(async (args: string[]) => {
        const key = args.join(" ");
        const match = responses[key];
        if (!match) return { stdout: "", exitCode: 128 };
        return { stdout: match.stdout ?? "", exitCode: match.exitCode ?? 0 };
    });
}

const NUL = "\0";

describe("getRemoteBackupFilter", () => {
    it("returns a non-repo filter when not inside a git work tree", async () => {
        const runGit = makeRunner({
            "rev-parse --is-inside-work-tree": { stdout: "", exitCode: 128 },
        });
        const filter = await getRemoteBackupFilter(ROOT, runGit);
        expect(filter.isRepo).toBe(false);
        expect(filter.hasUpstream).toBe(false);
        expect(filter.isPushedToRemote("/repo/a.md")).toBe(false);
    });

    it("treats nothing as pushed when there is no upstream branch", async () => {
        const runGit = makeRunner({
            "rev-parse --is-inside-work-tree": { stdout: "true\n" },
            "rev-parse --show-toplevel": { stdout: "/repo\n" },
            "rev-parse --abbrev-ref --symbolic-full-name @{upstream}": {
                stdout: "",
                exitCode: 128,
            },
        });
        const filter = await getRemoteBackupFilter(ROOT, runGit);
        expect(filter.isRepo).toBe(true);
        expect(filter.hasUpstream).toBe(false);
        expect(filter.isPushedToRemote("/repo/a.md")).toBe(false);
    });

    it("marks tracked, clean, pushed files as safe and dirty/unpushed files as not", async () => {
        const runGit = makeRunner({
            "rev-parse --is-inside-work-tree": { stdout: "true\n" },
            "rev-parse --show-toplevel": { stdout: "/repo\n" },
            "rev-parse --abbrev-ref --symbolic-full-name @{upstream}": {
                stdout: "origin/main\n",
            },
            "ls-files -z": {
                stdout: ["clean.md", "modified.md", "unpushed.md"].join(NUL) + NUL,
            },
            // modified.md has working-tree changes; untracked.md is new.
            "status --porcelain=v1 -z --untracked-files=all": {
                stdout: ` M modified.md${NUL}?? untracked.md${NUL}`,
            },
            // unpushed.md changed in a commit not yet pushed.
            "diff --name-only -z @{upstream} HEAD": {
                stdout: `unpushed.md${NUL}`,
            },
        });

        const filter = await getRemoteBackupFilter(ROOT, runGit);
        expect(filter.isRepo).toBe(true);
        expect(filter.hasUpstream).toBe(true);

        // Tracked, clean, and pushed → safe.
        expect(filter.isPushedToRemote("/repo/clean.md")).toBe(true);
        // Tracked but modified locally → needs backup.
        expect(filter.isPushedToRemote("/repo/modified.md")).toBe(false);
        // Tracked but part of an unpushed commit → needs backup.
        expect(filter.isPushedToRemote("/repo/unpushed.md")).toBe(false);
        // Untracked → needs backup.
        expect(filter.isPushedToRemote("/repo/untracked.md")).toBe(false);
        // Not tracked at all → needs backup.
        expect(filter.isPushedToRemote("/repo/other.md")).toBe(false);
        // Outside the repo root → needs backup.
        expect(filter.isPushedToRemote("/elsewhere/x.md")).toBe(false);
    });

    it("captures rename source paths from status output as dirty", async () => {
        const runGit = makeRunner({
            "rev-parse --is-inside-work-tree": { stdout: "true\n" },
            "rev-parse --show-toplevel": { stdout: "/repo\n" },
            "rev-parse --abbrev-ref --symbolic-full-name @{upstream}": {
                stdout: "origin/main\n",
            },
            "ls-files -z": { stdout: `new.md${NUL}old.md${NUL}` },
            // Rename entry: "R  new.md\0old.md"
            "status --porcelain=v1 -z --untracked-files=all": {
                stdout: `R  new.md${NUL}old.md${NUL}`,
            },
            "diff --name-only -z @{upstream} HEAD": { stdout: "" },
        });

        const filter = await getRemoteBackupFilter(ROOT, runGit);
        expect(filter.isPushedToRemote("/repo/new.md")).toBe(false);
        expect(filter.isPushedToRemote("/repo/old.md")).toBe(false);
    });
});
