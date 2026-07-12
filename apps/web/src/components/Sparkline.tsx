import type { FyLabel, MetricSeries } from '@plainsight/calc-engine';
import type { ReactElement } from 'react';

import * as styles from './sparkline.css';

export interface SparkPoint {
  fy: FyLabel;
  value: number;
}

/** The labelled years that computed, in order: what sparklines and trend charts draw. */
export const okPoints = (
  series: MetricSeries,
  fyLabels: readonly FyLabel[]
): SparkPoint[] =>
  fyLabels.flatMap((fy) => {
    const value = series.values[fy];
    return value !== undefined && value.status === 'ok' ? [{ fy, value: value.value }] : [];
  });

const WIDTH = 100;
const HEIGHT = 28;
const PAD = 2;

/**
 * The ten-year microsparkline (frontend spec §5): one quiet line, no axes,
 * decorative by contract; the value and delta beside it carry the information
 * as text, and the detail sheet carries the full chart with its table
 * fallback. Needs at least two labelled years (data-sufficiency policy);
 * a flat series draws a centre line rather than dividing by zero.
 */
export function Sparkline({ points }: { points: readonly SparkPoint[] }): ReactElement | null {
  if (points.length < 2) return null;
  const values = points.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;
  const x = (index: number) => PAD + (index * (WIDTH - PAD * 2)) / (points.length - 1);
  const y = (value: number) =>
    range === 0 ? HEIGHT / 2 : PAD + ((max - value) * (HEIGHT - PAD * 2)) / range;
  const line = points
    .map((point, index) => `${x(index).toFixed(2)},${y(point.value).toFixed(2)}`)
    .join(' ');

  return (
    <svg
      className={styles.spark}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      <polyline className={styles.line} points={line} />
    </svg>
  );
}
