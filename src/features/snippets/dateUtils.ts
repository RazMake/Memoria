/**
 * Re-export from the shared utils location.
 *
 * dateUtils was moved to `src/utils/dateUtils.ts` because it is consumed by
 * multiple features (snippets, contacts, taskCollector). This shim preserves
 * backward compatibility for any existing imports that reference this path.
 */
export {
    type ElapsedTime,
    elapsedSince,
    formatElapsed,
    formatDate,
    formatTime,
    formatISODate,
    ageInDays,
    formatDueIn,
    formatDueBy,
} from "../../utils/dateUtils";
