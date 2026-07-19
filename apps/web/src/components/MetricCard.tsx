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
 * the valuation cards' as-of badge, amber once the price is stale. The health
 * signal (dashboard design plan §4.2) wears as a small dot beside the label
 * and colours the sparkline; the dot is always paired with the chip and the
 * red-flag section, never the only channel.
 */
export function MetricCard({
  label,
  value,
  kind,
  currency,
  spark,
  delta,
  health,
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
  /** The card's computed health signal; drives the dot and the sparkline colour. */
  health?: 'healthy' | 'investigate';
  /** The pinned own-trend direction, forwarded to the delta chip's colour. */
  healthDirection?: 'up' | 'down';
  footnote?: string;
  stale?: boolean;
}): ReactElement {
  return (
    <article className={styles.card} aria-label={label}>
      <h3 className={styles.label}>
        {label}
        {health === undefined ? null : (
          <span
            role="img"
            aria-label={health === 'healthy' ? 'improving' : 'worth investigating'}
            className={health === 'healthy' ? styles.dotHealthy : styles.dotInvestigate}
          />
        )}
      </h3>
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
      {spark === undefined ? null : <Sparkline points={spark} health={health} />}
      {footnote === undefined ? null : (
        <p className={stale ? styles.footnoteStale : styles.footnote}>{footnote}</p>
      )}
    </article>
  );
}
