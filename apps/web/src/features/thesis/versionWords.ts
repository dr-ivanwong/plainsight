import type { ThesisSections } from '../../db';

/** Words across all four sections; whitespace of any shape separates. */
export function wordCount(sections: ThesisSections): number {
  return Object.values(sections)
    .join(' ')
    .split(/\s+/u)
    .filter((word) => word !== '').length;
}

/**
 * The history row's length note (frontend spec §3): the first version states
 * its size, every later one states the change against the version before it.
 * Negative changes carry the true minus, per the house style.
 */
export function deltaLabel(count: number, previous: number | null): string {
  if (previous === null) return `${count} ${count === 1 ? 'word' : 'words'}`;
  const change = count - previous;
  if (change === 0) return 'no change in length';
  const magnitude = Math.abs(change);
  const unit = magnitude === 1 ? 'word' : 'words';
  return change > 0 ? `+${magnitude} ${unit}` : `−${magnitude} ${unit}`;
}
