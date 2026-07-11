import {
  formatMetricValue,
  NOT_MEANINGFUL_PHRASES,
  type CurrencyCode,
  type MetricFormat,
  type MetricValue
} from '@plainsight/calc-engine';
import type { ReactElement } from 'react';

import * as styles from './statusValue.css';

/**
 * The single renderer of the MetricValue union (frontend spec §5): this is
 * where the no-NaN rule lives. Values format per the pinned display
 * precision, degenerate cases speak the pinned phrases (with the plain-words
 * expansion for screen readers, frontend spec §8), and missing inputs read as
 * the work left to do. Never blank, never 0, never NaN.
 */
export function StatusValue({
  value,
  kind,
  currency
}: {
  value: MetricValue;
  kind: MetricFormat;
  currency: CurrencyCode;
}): ReactElement {
  if (value.status === 'ok') {
    return <span className={styles.ok}>{formatMetricValue(value, kind, currency)}</span>;
  }
  if (value.status === 'not_meaningful') {
    const phrase = NOT_MEANINGFUL_PHRASES[value.reason];
    return (
      <span className={styles.quiet} aria-label={phrase.replace('n/m:', 'not meaningful:')}>
        {phrase}
      </span>
    );
  }
  const count = value.missing.length;
  return (
    <span className={styles.quiet}>
      Add the {count} missing {count === 1 ? 'number' : 'numbers'}
    </span>
  );
}
