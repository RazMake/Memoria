import { describe, it, expect, vi } from "vitest";
import { isMarkdownDocument, isMarkdownPath, stringArrayEqual, taskEntriesEqual } from "../../../../src/features/taskCollector/taskHelpers";
import type { TaskIndexEntry } from "../../../../src/features/taskCollector/types";

vi.mock("vscode", () => ({}));

describe("taskHelpers", () => {
    describe("isMarkdownDocument", () => {
        it("should return true when document has .md extension", () => {
            const doc = { uri: { path: "/workspace/notes.md" } } as any;
            expect(isMarkdownDocument(doc)).toBe(true);
        });

        it("should return true when document has uppercase .MD extension", () => {
            const doc = { uri: { path: "/workspace/README.MD" } } as any;
            expect(isMarkdownDocument(doc)).toBe(true);
        });

        it("should return false when document has non-md extension", () => {
            const doc = { uri: { path: "/workspace/script.ts" } } as any;
            expect(isMarkdownDocument(doc)).toBe(false);
        });

        it("should return false when document has no extension", () => {
            const doc = { uri: { path: "/workspace/Makefile" } } as any;
            expect(isMarkdownDocument(doc)).toBe(false);
        });
    });

    describe("isMarkdownPath", () => {
        it("should return true for .md path", () => {
            expect(isMarkdownPath("notes.md")).toBe(true);
        });

        it("should return true for .MD path", () => {
            expect(isMarkdownPath("README.MD")).toBe(true);
        });

        it("should return false for .ts path", () => {
            expect(isMarkdownPath("index.ts")).toBe(false);
        });

        it("should return false for .txt path", () => {
            expect(isMarkdownPath("readme.txt")).toBe(false);
        });

        it("should return false for path containing md but not ending with .md", () => {
            expect(isMarkdownPath("markdown-tools.js")).toBe(false);
        });
    });

    describe("stringArrayEqual", () => {
        it("should return true when both arrays are empty", () => {
            expect(stringArrayEqual([], [])).toBe(true);
        });

        it("should return true when arrays have same elements in same order", () => {
            expect(stringArrayEqual(["a", "b", "c"], ["a", "b", "c"])).toBe(true);
        });

        it("should return false when arrays have different lengths", () => {
            expect(stringArrayEqual(["a", "b"], ["a"])).toBe(false);
        });

        it("should return false when arrays have same length but different content", () => {
            expect(stringArrayEqual(["a", "b"], ["a", "c"])).toBe(false);
        });

        it("should return false when arrays have same elements in different order", () => {
            expect(stringArrayEqual(["a", "b"], ["b", "a"])).toBe(false);
        });
    });

    describe("taskEntriesEqual", () => {
        function makeEntry(overrides: Partial<TaskIndexEntry> = {}): TaskIndexEntry {
            return {
                id: "abc",
                source: "src/notes.md",
                sourceRoot: "/workspace",
                sourceOrder: 0,
                fingerprint: "fp1",
                body: "task body",
                firstSeenAt: "2026-01-01",
                completed: false,
                doneDate: null,
                collectorOwned: false,
                agingSkipCount: 0,
                ...overrides,
            };
        }

        it("should return true when entries are identical", () => {
            const a = makeEntry();
            const b = makeEntry();
            expect(taskEntriesEqual(a, b)).toBe(true);
        });

        it("should return false when id differs", () => {
            expect(taskEntriesEqual(makeEntry(), makeEntry({ id: "xyz" }))).toBe(false);
        });

        it("should return false when body differs", () => {
            expect(taskEntriesEqual(makeEntry(), makeEntry({ body: "different" }))).toBe(false);
        });

        it("should return false when completed differs", () => {
            expect(taskEntriesEqual(makeEntry(), makeEntry({ completed: true }))).toBe(false);
        });

        it("should treat undefined agingSkipCount as 0", () => {
            const a = makeEntry({ agingSkipCount: 0 });
            const b = makeEntry({ agingSkipCount: undefined });
            expect(taskEntriesEqual(a, b)).toBe(true);
        });

        it("should return false when agingSkipCount differs", () => {
            expect(taskEntriesEqual(makeEntry({ agingSkipCount: 1 }), makeEntry({ agingSkipCount: 2 }))).toBe(false);
        });
    });
});
