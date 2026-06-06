/** Type definitions for the Scheduled Backup feature. */

export type DayOfWeek = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

export interface BackupSchedule {
    /** Time of day in HH:MM (24-hour) format. */
    time: string;
    /** Days of the week the backup runs. */
    days: DayOfWeek[];
}

export interface BackupProfile {
    /** Workspace-relative glob patterns or folder paths to include. */
    sources: string[];
    /** Glob patterns to exclude from sources. */
    exclude: string[];
    /** Absolute path to the folder where zip files are written. */
    targetFolder: string;
    /** Schedule definition. */
    schedule: BackupSchedule;
    /** Max number of old backups to keep. Oldest are deleted first. */
    retention: number;
}

export interface BackupProfileState {
    /** ISO 8601 timestamp of last successful backup. */
    lastBackupTime: string | null;
    /** Map of workspace-relative POSIX path → SHA-256 hex digest from last backup. */
    hashes: Record<string, string>;
}

export interface BackupConfig {
    profiles: Record<string, BackupProfile>;
    _state: Record<string, BackupProfileState>;
}
