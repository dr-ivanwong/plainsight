/**
 * The 30-day export nudge (main plan §14, mitigation 4): kept under the
 * source-of-truth posture because unsynced device-local edits are real and
 * re-downloading is friction. Pure so the boundary is testable to the
 * millisecond; the screens gate it on a non-empty library, since a fresh
 * install with nothing to copy has nothing to nudge about.
 */
export const EXPORT_NUDGE_DAYS = 30;

const NUDGE_MS = EXPORT_NUDGE_DAYS * 24 * 60 * 60 * 1000;

/** True when no export exists, or the last one is more than 30 days old. */
export function exportOverdue(lastExportAt: string | undefined, now: Date): boolean {
  if (lastExportAt === undefined) return true;
  const last = Date.parse(lastExportAt);
  if (Number.isNaN(last)) return true;
  return now.getTime() - last > NUDGE_MS;
}
