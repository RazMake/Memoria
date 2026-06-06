/** Creates a zip archive from a set of in-memory file buffers using yazl. */

import * as fs from "fs";
import * as path from "path";
import * as yazl from "yazl";

export interface ZipEntry {
    /** Content of the file. */
    content: Buffer;
    /** Path inside the zip (workspace-relative POSIX). */
    relativePath: string;
}

/**
 * Creates a zip file at `outputPath` containing all the provided entries.
 * Throws if the output directory does not exist or the zip cannot be written.
 *
 * @returns The size of the written zip in bytes.
 */
export async function createZip(
    entries: ZipEntry[],
    outputPath: string,
): Promise<number> {
    return new Promise((resolve, reject) => {
        const zipfile = new yazl.ZipFile();

        for (const entry of entries) {
            zipfile.addBuffer(entry.content, entry.relativePath, {
                // Use a fixed mtime so zip is deterministic
                mtime: new Date(0),
                compress: true,
            });
        }

        zipfile.end();

        const writeStream = fs.createWriteStream(outputPath);
        zipfile.outputStream.pipe(writeStream);

        writeStream.on("close", () => {
            try {
                const stat = fs.statSync(outputPath);
                resolve(stat.size);
            } catch {
                resolve(0);
            }
        });

        writeStream.on("error", (err) => {
            reject(err);
        });

        zipfile.outputStream.on("error", (err) => {
            reject(err);
        });
    });
}

/**
 * Builds the backup zip filename from components.
 * Format: {profileName}_{computerName}_{date}_{time}.zip
 */
export function buildZipFileName(
    profileName: string,
    computerName: string,
    date: Date,
): string {
    const safeName = profileName.replace(/[^a-zA-Z0-9-]/g, "-");
    const safeHost = computerName.replace(/[^a-zA-Z0-9-]/g, "-");
    const dateStr = formatDate(date);
    const timeStr = formatTime(date);
    return `${safeName}_${safeHost}_${dateStr}_${timeStr}.zip`;
}

function formatDate(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
}

function formatTime(d: Date): string {
    const h = String(d.getHours()).padStart(2, "0");
    const min = String(d.getMinutes()).padStart(2, "0");
    const s = String(d.getSeconds()).padStart(2, "0");
    return `${h}-${min}-${s}`;
}

/**
 * Ensures a directory exists, creating it (and parents) if needed.
 * Throws if creation fails.
 */
export async function ensureDir(dirPath: string): Promise<void> {
    await fs.promises.mkdir(dirPath, { recursive: true });
}

/**
 * Lists all zip files in a folder matching the pattern `{prefix}_*.zip`.
 * Returns full file paths, sorted oldest-first by name.
 */
export async function listProfileZips(
    folderPath: string,
    profileName: string,
): Promise<string[]> {
    const safeName = profileName.replace(/[^a-zA-Z0-9-]/g, "-");
    const prefix = `${safeName}_`;

    let entries: fs.Dirent[];
    try {
        entries = await fs.promises.readdir(folderPath, { withFileTypes: true });
    } catch {
        return [];
    }

    return entries
        .filter((e) => e.isFile() && e.name.startsWith(prefix) && e.name.endsWith(".zip"))
        .map((e) => path.join(folderPath, e.name))
        .sort(); // ISO date-time format is lexicographically sortable
}
