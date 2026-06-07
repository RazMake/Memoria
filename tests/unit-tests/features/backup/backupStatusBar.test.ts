import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

interface MockItem {
    text: string;
    tooltip: string | undefined;
    backgroundColor: unknown;
    name: string;
    show: ReturnType<typeof vi.fn>;
    hide: ReturnType<typeof vi.fn>;
    dispose: ReturnType<typeof vi.fn>;
}

const item: MockItem = {
    text: "",
    tooltip: undefined,
    backgroundColor: undefined,
    name: "",
    show: vi.fn(),
    hide: vi.fn(),
    dispose: vi.fn(),
};

const createStatusBarItem = vi.fn(() => item);

vi.mock("vscode", () => ({
    window: {
        createStatusBarItem: (...args: any[]) => createStatusBarItem(...args),
    },
    StatusBarAlignment: { Left: 1, Right: 2 },
    ThemeColor: class {
        constructor(public id: string) {}
    },
}));

import { BackupStatusBar } from "../../../../src/features/backup/backupStatusBar";

describe("BackupStatusBar", () => {
    let bar: BackupStatusBar;

    beforeEach(() => {
        vi.useFakeTimers();
        item.text = "";
        item.tooltip = undefined;
        item.backgroundColor = undefined;
        item.name = "";
        item.show.mockClear();
        item.hide.mockClear();
        item.dispose.mockClear();
        createStatusBarItem.mockClear();
        bar = new BackupStatusBar();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("names the item on construction", () => {
        expect(item.name).toBe("Memoria Backup");
    });

    it("show() sets idle state and shows the item", () => {
        bar.show();
        expect(item.text).toBe("$(file-zip) Backup: Idle");
        expect(item.show).toHaveBeenCalledOnce();
    });

    it("hide() hides the item", () => {
        bar.hide();
        expect(item.hide).toHaveBeenCalledOnce();
    });

    it("running state shows a spinner and no background color", () => {
        bar.setState("running");
        expect(item.text).toBe("$(sync~spin) Backup: Running…");
        expect(item.backgroundColor).toBeUndefined();
    });

    it("failed state applies the error background color", () => {
        bar.setState("failed", "boom");
        expect(item.text).toBe("$(error) Backup: Failed");
        expect(item.tooltip).toBe("boom");
        expect((item.backgroundColor as { id: string }).id).toBe(
            "statusBarItem.errorBackground",
        );
    });

    it("completed state reverts to idle after 10 seconds", () => {
        bar.setState("completed");
        expect(item.text).toBe("$(check) Backup: Done");
        vi.advanceTimersByTime(10_000);
        expect(item.text).toBe("$(file-zip) Backup: Idle");
    });

    it("skipped state reverts to idle after 10 seconds", () => {
        bar.setState("skipped");
        expect(item.text).toBe("$(dash) Backup: No changes");
        vi.advanceTimersByTime(10_000);
        expect(item.text).toBe("$(file-zip) Backup: Idle");
    });

    it("a new setState cancels a pending revert timer", () => {
        bar.setState("completed");
        bar.setState("running");
        vi.advanceTimersByTime(10_000);
        // Should remain running, not revert to idle
        expect(item.text).toBe("$(sync~spin) Backup: Running…");
    });

    it("setNextBackupTooltip updates tooltip only while idle", () => {
        bar.setState("idle");
        bar.setNextBackupTooltip("daily", "18:00");
        expect(item.tooltip).toBe("Next: daily at 18:00");

        bar.setState("running");
        bar.setNextBackupTooltip("daily", "19:00");
        // running text does not include "Idle", so tooltip is unchanged
        expect(item.tooltip).toBe("Backup in progress…");
    });

    it("dispose clears the revert timer and disposes the item", () => {
        bar.setState("completed");
        bar.dispose();
        expect(item.dispose).toHaveBeenCalledOnce();
        // Timer was cleared — advancing does not change text
        vi.advanceTimersByTime(10_000);
        expect(item.text).toBe("$(check) Backup: Done");
    });
});
