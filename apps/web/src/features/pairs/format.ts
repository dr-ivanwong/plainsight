/** Display formatting for the sleeve's statistics; tabular figures do the aligning. */

export function formatPValue(value: number): string {
  return value < 0.001 ? '<0.001' : value.toFixed(3);
}

export function formatHalfLife(days: number | null): string {
  return days === null ? 'not mean-reverting' : `${days.toFixed(1)} days`;
}

export function formatRatio(value: number): string {
  return value.toFixed(2);
}

export function formatFetchTime(epochMs: number): string {
  return new Date(epochMs).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}
