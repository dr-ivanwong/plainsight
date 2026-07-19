import {
  formatMoneyMinor,
  type CurrencyCode,
  type MetricDelta,
  type MetricFormat
} from '@plainsight/calc-engine';
import type { ReactElement } from 'react';

import * as styles from './deltaChip.css';

const ARROWS = { up: '↑', down: '↓', flat: '→' } as const;
const DIRECTION_WORDS = { up: 'up', down: 'down', flat: 'unchanged' } as const;

function magnitude(
  delta: MetricDelta,
  kind: MetricFormat,
  currency: CurrencyCode
): { text: string; words: string } {
  const abs = Math.abs(delta.change);
  switch (kind) {
    case 'percent': {
      const points = (abs * 100).toFixed(1);
      return { text: `${points} pp`, words: `${points} percentage points` };
    }
    case 'ratio':
      return { text: abs.toFixed(2), words: abs.toFixed(2) };
    case 'coverage':
      return { text: `${abs.toFixed(1)}×`, words: `${abs.toFixed(1)} times` };
    case 'money': {
      const text = formatMoneyMinor(abs, currency);
      return { text, words: text };
    }
  }
}

/**
 * The five-year delta chip (frontend spec §5): direction and magnitude in the
 * metric's native unit. Where the dictionary pins an own-trend health
 * direction (data-model section 6, health direction note), the chip wears it:
 * moving with the healthy direction reads healthy, against it reads
 * investigate. A flat change, or a metric with no pinned direction (current
 * ratio; the valuation metrics), stays neutral grey. The neutral-always
 * stance this replaces is recorded in the main plan's decision log.
 */
export function DeltaChip({
  delta,
  kind,
  currency,
  healthDirection
}: {
  delta: MetricDelta;
  kind: MetricFormat;
  currency: CurrencyCode;
  healthDirection?: 'up' | 'down';
}): ReactElement {
  const { text, words } = magnitude(delta, kind, currency);
  const chipClass =
    healthDirection === undefined || delta.direction === 'flat'
      ? styles.chip
      : delta.direction === healthDirection
        ? styles.chipHealthy
        : styles.chipInvestigate;
  return (
    <span
      className={chipClass}
      aria-label={`${DIRECTION_WORDS[delta.direction]} ${words}, ${delta.fromFy} to ${delta.toFy}`}
      title={`${delta.fromFy} to ${delta.toFy}`}
    >
      <span aria-hidden="true">{ARROWS[delta.direction]}</span> {text}
    </span>
  );
}
