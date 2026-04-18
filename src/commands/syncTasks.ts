import * as vscode from "vscode";
import type { TelemetryEmitter } from "../telemetry";
import type { TaskCollectorFeature } from "../features/taskCollector/taskCollectorFeature";

export function createSyncTasksCommand(
    feature: TaskCollectorFeature,
    telemetry: TelemetryEmitter,
): () => Promise<void> {
    return async () => {
        try {
            // syncNow() drains the queue AND waits for completion — giving the user a
            // synchronous "sync finished" experience from the command, as opposed to
            // enqueueing a task and returning immediately while the work happens in the
            // background.
            const started = await feature.syncNow();
            if (started) {
                telemetry.logUsage("taskCollector.syncRequested", { trigger: "command" });
            }
        } catch (error) {
            telemetry.logError("taskCollector.reconcileFailed", {
                trigger: "command",
                message: error instanceof Error ? error.message : String(error),
            });
            vscode.window.showErrorMessage(
                `Memoria: Task sync failed — ${error instanceof Error ? error.message : String(error)}`
            );
        }
    };
}
