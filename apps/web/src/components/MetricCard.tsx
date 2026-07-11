import type { CurrencyCode, MetricFormat, MetricValue } from '@plainsight/calc-engine';
import type { ReactElement } from 'react';

import * as styles from './metricCard.css';
import { StatusValue } from './StatusValue';

/**
 * One metric tile (frontend spec §5). Sparkline and delta chip join with the
 * dashboard-depth slice; the footnote carries the valuation cards' as-of
 * badge, amber once the price is stale.
 */
export function MetricCard({
  label,
  value,
  kind,
  currency,
  footnote,
  stale = false
}: {
  label: string;
  value: MetricValue;
  kind: MetricFormat;
  currency: CurrencyCode;
  footnote?: string;
  stale?: boolean;
}): ReactElement {
  return (
    <article className={styles.card} aria-label={label}>
      <h3 className={styles.label}>{label}</h3>
      <StatusValue value={value} kind={kind} currency={currency} />
      {footnote === undefined ? null : (
        <p className={stale ? styles.footnoteStale : styles.footnote}>{footnote}</p>
      )}
    </article>
  );
}
