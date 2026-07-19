import type {
  CurrencyCode,
  MetricDelta,
  MetricFormat,
  MetricValue
} from '@plainsight/calc-engine';
import type { ReactElement } from 'react';

import { DeltaChip } from './DeltaChip';
import * as styles from './metricCard.css';
import { Sparkline, type SparkPoint } from './Sparkline';
import { StatusValue } from './StatusValue';

/**
 * One metric tile (frontend spec §5): label, value, the five-year delta
 * beside it, and the ten-year microsparkline underneath. The footnote carries
 * the valuation cards' as-of badge, amber once the price is stale.
 */
export function MetricCard({
  label,
  value,
  kind,
  currency,
  spark,
  delta,
  healthDirection,
  footnote,
  stale = false
}: {
  label: string;
  value: MetricValue;
  kind: MetricFormat;
  currency: CurrencyCode;
  spark?: readonly SparkPoint[];
  delta?: MetricDelta;
  /** The pinned own-trend direction, forwarded to the delta chip's colour. */
  healthDirection?: 'up' | 'down';
  footnote?: string;
  stale?: boolean;
}): ReactElement {
  return (
    <article className={styles.card} aria-label={label}>
      <h3 className={styles.label}>{label}</h3>
      <div className={styles.valueRow}>
        <StatusValue value={value} kind={kind} currency={currency} />
        {delta === undefined ? null : (
          <DeltaChip
            delta={delta}
            kind={kind}
            currency={currency}
            healthDirection={healthDirection}
          />
        )}
      </div>
      {spark === undefined ? null : <Sparkline points={spark} />}
      {footnote === undefined ? null : (
        <p className={stale ? styles.footnoteStale : styles.footnote}>{footnote}</p>
      )}
    </article>
  );
}
