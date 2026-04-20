import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Contract tests for package.json command declarations.
 *
 * These tests catch common mistakes when adding new commands:
 *  - Forgetting to add a commandPalette entry
 *  - Forgetting a `when` clause so the command shows before the workspace is initialized
 *
 * Commands that should always be visible (no `when` clause required) are listed in
 * the ALWAYS_VISIBLE set below — add a command there only when it genuinely makes
 * sense to show it in an un-initialized workspace.
 */

const packageJson = JSON.parse(
    readFileSync(resolve(__dirname, "../../src/package.json"), "utf-8")
);

/** Commands that intentionally have no `when` guard in the command palette. */
const ALWAYS_VISIBLE = new Set(["memoria.initializeWorkspace", "memoria.openUserGuide"]);

/** Commands that are context-menu-only and intentionally excluded from the command palette. */
const PALETTE_EXCLUDED = new Set<string>([]);

const commands: { command: string; title: string }[] =
    packageJson.contributes.commands;

const paletteEntries: { command: string; when?: string }[] =
    packageJson.contributes.menus.commandPalette;

describe("package.json command declarations", () => {
    it("should have a commandPalette entry for every declared command (except palette-excluded)", () => {
        const paletteCommands = new Set(paletteEntries.map((e) => e.command));

        const missing = commands
            .map((c) => c.command)
            .filter((cmd) => !paletteCommands.has(cmd) && !PALETTE_EXCLUDED.has(cmd));

        expect(missing, `Commands missing from menus.commandPalette: ${missing.join(", ")}`).toEqual([]);
    });

    it("should guard non-always-visible commands with a 'when' clause", () => {
        const memoriaContextKeys = [
            "memoria.workspaceInitialized",
            "memoria.defaultFileAvailable",
            "memoria.contactsActive",
            "memoria.contactsMultiGroup",
        ];

        const unguarded = paletteEntries
            .filter((e) => !ALWAYS_VISIBLE.has(e.command))
            .filter((e) => !e.when || (!memoriaContextKeys.some((key) => e.when!.includes(key)) && e.when !== "false"));

        const names = unguarded.map((e) => e.command);
        expect(
            names,
            `Commands without a Memoria context key guard: ${names.join(", ")}. ` +
            `If a command should always be visible, add it to ALWAYS_VISIBLE in this test.`
        ).toEqual([]);
    });

    it("should not have commandPalette entries for undeclared commands", () => {
        const declaredCommands = new Set(commands.map((c) => c.command));

        const orphaned = paletteEntries
            .map((e) => e.command)
            .filter((cmd) => !declaredCommands.has(cmd));

        expect(orphaned, `commandPalette entries without a matching command: ${orphaned.join(", ")}`).toEqual([]);
    });
});
