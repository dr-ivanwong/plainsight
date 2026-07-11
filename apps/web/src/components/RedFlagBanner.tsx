import type { RuleResult } from '@plainsight/calc-engine';
import type { ReactElement } from 'react';

import * as styles from './redFlagBanner.css';

/** cumulativeCoverageDisplay -> 'cumulative coverage'; the values are already display-ready. */
const humaniseKey = (key: string): string =>
  key
    .replace(/Display$/, '')
    .replace(/([A-Z])/g, ' $1')
    .toLowerCase()
    .trim();

/**
 * One fired rule (frontend spec §5): what fired with its numbers, why it
 * matters, and what to check in the filing. Items to investigate, never
 * verdicts; the severity colour sits in the leading edge, one of the few
 * places health colour is allowed to speak.
 */
export function RedFlagBanner({
  flag,
  muted = false,
  onDismiss,
  onRestore
}: {
  flag: RuleResult;
  muted?: boolean;
  onDismiss?: () => void;
  onRestore?: () => void;
}): ReactElement {
  const fired = Object.entries(flag.firedWith)
    .map(([key, value]) => `${humaniseKey(key)} ${value}`)
    .join(' · ');

  const tone = flag.severity === 'red' ? styles.red : styles.orange;

  return (
    <article className={muted ? `${tone} ${styles.muted}` : tone} aria-label={flag.name}>
      <div className={styles.head}>
        <h3 className={styles.name}>{flag.name}</h3>
        {onDismiss === undefined ? null : (
          <button type="button" className={styles.action} onClick={onDismiss}>
            Dismiss
          </button>
        )}
        {onRestore === undefined ? null : (
          <button type="button" className={styles.action} onClick={onRestore}>
            Restore
          </button>
        )}
      </div>
      {fired === '' ? null : <p className={styles.fired}>{fired}</p>}
      <p className={styles.body}>{flag.explanation}</p>
      <p className={styles.body}>
        <span className={styles.checkWord}>Check: </span>
        {flag.whatToCheck}
      </p>
    </article>
  );
}
