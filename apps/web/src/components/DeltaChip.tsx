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
 * metric's native unit, deliberately neutral in colour; health colour belongs
 * to the items-to-investigate section, not to every trend.
 */
export function DeltaChip({
  delta,
  kind,
  currency
}: {
  delta: MetricDelta;
  kind: MetricFormat;
  currency: CurrencyCode;
}): ReactElement {
  const { text, words } = magnitude(delta, kind, currency);
  return (
    <span
      className={styles.chip}
      aria-label={`${DIRECTION_WORDS[delta.direction]} ${words}, ${delta.fromFy} to ${delta.toFy}`}
      title={`${delta.fromFy} to ${delta.toFy}`}
    >
      <span aria-hidden="true">{ARROWS[delta.direction]}</span> {text}
    </span>
  );
}
