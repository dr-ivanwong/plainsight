import type { ReactElement } from 'react';

import * as styles from './confidenceBadge.css';

/** The pinned review thresholds (frontend spec §3). */
export const CONFIRM_BELOW = 0.7;
export const AMBER_BELOW = 0.9;

/**
 * One extracted field's confidence state (frontend spec §5): fields at or
 * above the amber ceiling render nothing until a bulk accept ticks them;
 * the amber band wears its number, tappable to accept; the low band demands
 * an individual confirmation, and the save gate counts exactly those.
 */
export function ConfidenceBadge({
  confidence,
  confirmed,
  onConfirm,
  label
}: {
  confidence: number;
  confirmed: boolean;
  onConfirm: () => void;
  /** Names the field for the screen reader: "Confirm revenue, FY2024". */
  label: string;
}): ReactElement | null {
  if (confirmed) {
    return <span className={styles.confirmed}>✓ confirmed</span>;
  }
  const percent = `${Math.round(confidence * 100)}%`;
  if (confidence < CONFIRM_BELOW) {
    return (
      <button
        type="button"
        className={styles.confirm}
        aria-label={`Confirm ${label}, read at ${percent} confidence`}
        onClick={onConfirm}
      >
        Confirm · {percent}
      </button>
    );
  }
  if (confidence < AMBER_BELOW) {
    return (
      <button
        type="button"
        className={styles.amber}
        aria-label={`Accept ${label}, read at ${percent} confidence`}
        onClick={onConfirm}
      >
        {percent}
      </button>
    );
  }
  return null;
}
