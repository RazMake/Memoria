import * as vscode from "vscode";
import type { TelemetryEmitter } from "./telemetry";
import { textDecoder, textEncoder } from "./utils/encoding";
import { updateMarkdownLinks, updateMarkdownLinkPrefixes, computeRelativePosixPath } from "./utils/linkReferenceUpdater";
import { normalizePath } from "./utils/path";

const EXCLUDE_PATTERN = "{**/node_modules/**,**/.git/**,**/.memoria/**}";

/**
 * Subscribes to file/folder rename events and updates markdown link references
 * across all *.md files in the workspace.
 */
export function registerLinkReferenceWatcher(
    context: vscode.ExtensionContext,
    telemetry: TelemetryEmitter,
): void {
    context.subscriptions.push(
        vscode.workspace.onDidRenameFiles((event) => {
            void handleRenameFiles(event, telemetry);
        }),
    );
}

async function handleRenameFiles(
    event: vscode.FileRenameEvent,
    telemetry: TelemetryEmitter,
): Promise<void> {
    let totalFileCount = 0;
    let totalLinkCount = 0;

    // The candidate markdown set is identical for every entry in the event, so scan the
    // workspace once (lazily, on the first entry that resolves) rather than repeating the
    // full-workspace glob per renamed file/folder — a multi-file rename would otherwise
    // multiply this I/O by the number of renamed paths.
    let mdFiles: vscode.Uri[] | null = null;

    for (const { oldUri, newUri } of event.files) {
        try {
            const stat = await vscode.workspace.fs.stat(newUri);
            const isDirectory = (stat.type & vscode.FileType.Directory) !== 0;

            mdFiles ??= await vscode.workspace.findFiles("**/*.md", EXCLUDE_PATTERN);
            const { fileCount, linkCount } = isDirectory
                ? await handleFolderRename(mdFiles, oldUri, newUri)
                : await handleFileRename(mdFiles, oldUri, newUri);

            totalFileCount += fileCount;
            totalLinkCount += linkCount;
        } catch (err) {
            telemetry.logError("linkReference.renameFailed", {
                message: err instanceof Error ? err.message : String(err),
            });
        }
    }

    if (totalLinkCount > 0) {
        telemetry.logUsage("linkReference.renameUpdated", {
            fileCount: totalFileCount,
            linkCount: totalLinkCount,
        });
    }
}

async function handleFileRename(
    mdFiles: vscode.Uri[],
    oldUri: vscode.Uri,
    newUri: vscode.Uri,
): Promise<{ fileCount: number; linkCount: number }> {
    let fileCount = 0;
    let linkCount = 0;

    for (const mdFile of mdFiles) {
        if (mdFile.toString() === newUri.toString()) continue;

        try {
            const mdDir = normalizePath(vscode.Uri.joinPath(mdFile, "..").path);
            const oldRelPath = computeRelativePosixPath(mdDir, normalizePath(oldUri.path));
            const newRelPath = computeRelativePosixPath(mdDir, normalizePath(newUri.path));

            const bytes = await vscode.workspace.fs.readFile(mdFile);
            const content = textDecoder.decode(bytes);
            const updated = updateMarkdownLinks(content, oldRelPath, newRelPath);

            if (updated !== null) {
                await vscode.workspace.fs.writeFile(mdFile, textEncoder.encode(updated));
                fileCount++;
                linkCount += countOccurrences(updated, newRelPath) - countOccurrences(content, newRelPath);
            }
        } catch {
            // Individual file failures are silently skipped
        }
    }

    return { fileCount, linkCount };
}

async function handleFolderRename(
    mdFiles: vscode.Uri[],
    oldUri: vscode.Uri,
    newUri: vscode.Uri,
): Promise<{ fileCount: number; linkCount: number }> {
    let fileCount = 0;
    let linkCount = 0;

    for (const mdFile of mdFiles) {
        try {
            const mdDir = normalizePath(vscode.Uri.joinPath(mdFile, "..").path);
            const oldDirRel = computeRelativePosixPath(mdDir, normalizePath(oldUri.path));
            const newDirRel = computeRelativePosixPath(mdDir, normalizePath(newUri.path));

            const bytes = await vscode.workspace.fs.readFile(mdFile);
            const content = textDecoder.decode(bytes);
            const updated = updateMarkdownLinkPrefixes(content, oldDirRel, newDirRel);

            if (updated !== null) {
                await vscode.workspace.fs.writeFile(mdFile, textEncoder.encode(updated));
                fileCount++;
                linkCount += countOccurrences(updated, newDirRel + "/") - countOccurrences(content, newDirRel + "/");
            }
        } catch {
            // Individual file failures are silently skipped
        }
    }

    return { fileCount, linkCount };
}

function countOccurrences(text: string, search: string): number {
    let count = 0;
    let pos = 0;
    while ((pos = text.indexOf(search, pos)) !== -1) {
        count++;
        pos += search.length;
    }
    return count;
}
