import type {
  CurrencyCode,
  FyLabel,
  MetricDelta,
  MetricFormat,
  MetricValue
} from '@plainsight/calc-engine';
import type { ReactElement } from 'react';

import { DeltaChip } from './DeltaChip';
import * as styles from './metricCard.css';
import { Sparkline, type SparkPoint } from './Sparkline';
import { StatusValue } from './StatusValue';

/** One cell of the card's multi-year row (dashboard design plan §4.6): a short display with the full phrase spoken where one exists. */
export interface HistoryEntry {
  fy: FyLabel;
  display: string;
  spoken?: string;
}

/**
 * One metric tile (frontend spec §5): label, value, the five-year delta
 * beside it, the ten-year microsparkline underneath, and beneath that the
 * multi-year row (dashboard design plan §4.6): the figures carry the
 * history, the sparkline confirms the shape. The footnote carries the
 * valuation cards' as-of badge, amber once the price is stale. The health
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
  history,
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
  /** The latest five fiscal years' values, oldest first; absent below three years. */
  history?: readonly HistoryEntry[];
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
      {history === undefined ? null : (
        <div className={styles.historyRow}>
          {history.map((entry) => (
            <div key={entry.fy} className={styles.historyCell}>
              {/* Bare years, as the plan's own sketch draws them: five FY prefixes in an 11px row collide. */}
              <span className={styles.historyYear}>{entry.fy.slice(2)}</span>
              {entry.spoken === undefined ? (
                <span className={styles.historyValue}>{entry.display}</span>
              ) : (
                <span className={styles.historyValue} aria-label={entry.spoken}>
                  {entry.display}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
      {footnote === undefined ? null : (
        <p className={stale ? styles.footnoteStale : styles.footnote}>{footnote}</p>
      )}
    </article>
  );
}
