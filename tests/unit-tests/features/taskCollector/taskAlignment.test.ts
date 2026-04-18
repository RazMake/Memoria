import { describe, expect, it } from "vitest";
import { alignTasks, computeTaskFingerprint, normalizeTaskBody } from "../../../../src/features/taskCollector/taskAlignment";

describe("taskAlignment", () => {
    describe("normalizeTaskBody / computeTaskFingerprint", () => {
        it("should ignore trailing whitespace and repeated blank lines", () => {
            expect(normalizeTaskBody("task  \n\n\nnext\t\t\n"))
                .toBe("task\n\nnext");
        });

        it("should produce the same fingerprint when only trailing whitespace changes", () => {
            expect(computeTaskFingerprint("task\n      note"))
                .toBe(computeTaskFingerprint("task  \n      note  "));
        });

        it("should treat markdown syntax changes as distinct fingerprints", () => {
            expect(computeTaskFingerprint("*foo*"))
                .not.toBe(computeTaskFingerprint("**foo**"));
            expect(computeTaskFingerprint("[text](a.md)"))
                .not.toBe(computeTaskFingerprint("[text](b.md)"));
        });
    });

    describe("alignTasks", () => {
        it("should retain ids when a task is reworded in place between matched neighbors", () => {
            const oldItems = [
                { id: "a", body: "Alpha", checked: false, fingerprint: computeTaskFingerprint("Alpha") },
                { id: "b", body: "Buy milk", checked: false, fingerprint: computeTaskFingerprint("Buy milk") },
                { id: "c", body: "Charlie", checked: false, fingerprint: computeTaskFingerprint("Charlie") },
            ];
            const newItems = [
                { body: "Alpha", checked: false, fingerprint: computeTaskFingerprint("Alpha") },
                { body: "Buy oat milk", checked: false, fingerprint: computeTaskFingerprint("Buy oat milk") },
                { body: "Charlie", checked: false, fingerprint: computeTaskFingerprint("Charlie") },
            ];

            const result = alignTasks(oldItems, newItems);

            expect(result.matchedIdsByNewIndex).toEqual(["a", "b", "c"]);
            expect(result.deletedIds).toEqual([]);
        });

        it("should preserve ids during pure reorder operations", () => {
            const oldItems = [
                { id: "a", body: "Alpha", checked: false, fingerprint: computeTaskFingerprint("Alpha") },
                { id: "b", body: "Beta", checked: false, fingerprint: computeTaskFingerprint("Beta") },
                { id: "c", body: "Charlie", checked: false, fingerprint: computeTaskFingerprint("Charlie") },
            ];
            const newItems = [
                { body: "Charlie", checked: false, fingerprint: computeTaskFingerprint("Charlie") },
                { body: "Alpha", checked: false, fingerprint: computeTaskFingerprint("Alpha") },
                { body: "Beta", checked: false, fingerprint: computeTaskFingerprint("Beta") },
            ];

            const result = alignTasks(oldItems, newItems);

            expect(result.matchedIdsByNewIndex).toEqual(["c", "a", "b"]);
            expect(result.deletedIds).toEqual([]);
        });

        it("should keep the correct binding when insertion and rewording happen together", () => {
            const oldItems = [
                { id: "a", body: "Alpha", checked: false, fingerprint: computeTaskFingerprint("Alpha") },
                { id: "b", body: "Write draft", checked: false, fingerprint: computeTaskFingerprint("Write draft") },
                { id: "c", body: "Charlie", checked: false, fingerprint: computeTaskFingerprint("Charlie") },
            ];
            const newItems = [
                { body: "Alpha", checked: false, fingerprint: computeTaskFingerprint("Alpha") },
                { body: "Prep notes", checked: false, fingerprint: computeTaskFingerprint("Prep notes") },
                { body: "Write draft v2", checked: false, fingerprint: computeTaskFingerprint("Write draft v2") },
                { body: "Charlie", checked: false, fingerprint: computeTaskFingerprint("Charlie") },
            ];

            const result = alignTasks(oldItems, newItems);

            expect(result.matchedIdsByNewIndex).toEqual(["a", null, "b", "c"]);
            expect(result.deletedIds).toEqual([]);
        });
    });
});
