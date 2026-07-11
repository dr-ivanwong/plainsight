const DAY_MS = 86_400_000;

const pad = (value: number): string => String(value).padStart(2, '0');

/**
 * The row's last-updated label: relative words up close, then the specific
 * day in the house date format (docs/style.md: YYYY-MM-DD wherever a specific
 * day is named). Future timestamps (clock skew) read as today.
 */
export function relativeUpdated(updatedAtIso: string, now: Date = new Date()): string {
  const updated = new Date(updatedAtIso);
  const startOfDay = (date: Date) =>
    new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const days = Math.round((startOfDay(now) - startOfDay(updated)) / DAY_MS);
  if (days <= 0) return 'updated today';
  if (days === 1) return 'updated yesterday';
  if (days < 7) return `updated ${days} days ago`;
  return `updated ${updated.getFullYear()}-${pad(updated.getMonth() + 1)}-${pad(updated.getDate())}`;
}
