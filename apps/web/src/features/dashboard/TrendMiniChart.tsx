import {
  formatMetricValue,
  type CurrencyCode,
  type FyLabel,
  type MetricFormat
} from '@plainsight/calc-engine';
import type { ReactElement } from 'react';
import { Area, AreaChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { tickFor } from '../../components/TrendChart';
import { colour } from '../../styles/tokens.css';
import * as styles from './trendSection.css';

export interface TrendPoint {
  fy: FyLabel;
  /** Null where the year did not compute; the line gaps there, never interpolates (dashboard design plan §6.2). */
  value: number | null;
}

/**
 * The tinted band between the series and the benchmark, one range per point,
 * only where the series sits on the unfavourable side of the line (dashboard
 * design plan §6.5): below it when up is healthy, above it when down is.
 * Favourable and non-computed years carry null, so the band gaps with the
 * series. Exported for its unit test.
 */
export function benchmarkBands(
  points: readonly TrendPoint[],
  benchmark: number,
  direction: 'up' | 'down'
): (readonly [number, number] | null)[] {
  return points.map((point) => {
    if (point.value === null) return null;
    const unfavourable =
      direction === 'up' ? point.value < benchmark : point.value > benchmark;
    if (!unfavourable) return null;
    return direction === 'up' ? [point.value, benchmark] : [benchmark, point.value];
  });
}

/**
 * One metric's small-multiple chart in the dashboard's trends section
 * (dashboard design plan §6.2): a neutral stroke over the sparkline's grounding
 * fill, its own y-axis, gaps for non-computable years. A stored benchmark
 * draws as a dashed line behind the series (§6.5), the axis extending to keep
 * it visible, with the stretch on the unfavourable side tinted. Animation
 * stays off, as on every chart here: the chart states a history, it does not
 * perform one. The frame hides from the accessibility tree; the section's
 * table view carries the same numbers as text, and the editor beneath speaks
 * the benchmark's value.
 */
export function TrendMiniChart({
  points,
  kind,
  currency,
  benchmark,
  benchmarkLabel,
  healthDirection
}: {
  points: readonly TrendPoint[];
  kind: MetricFormat;
  currency: CurrencyCode;
  /** The stored reference value in the metric's native unit, when one exists. */
  benchmark?: number;
  /** The right-edge label text; the container knows whether it speaks as a rule's line. */
  benchmarkLabel?: string;
  /** The pinned own-trend direction; without one the line draws but nothing tints. */
  healthDirection?: 'up' | 'down';
}): ReactElement {
  const format = (value: number) =>
    formatMetricValue({ status: 'ok', value }, kind, currency);
  const bands =
    benchmark === undefined || healthDirection === undefined
      ? undefined
      : benchmarkBands(points, benchmark, healthDirection);
  const rows = points.map((point, index) => ({
    ...point,
    band: bands?.[index] ?? null
  }));

  return (
    <div className={styles.chartFrame} aria-hidden="true">
      <ResponsiveContainer width="100%" height={160}>
        <AreaChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
          <XAxis
            dataKey="fy"
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11, fill: 'currentColor' }}
            interval="preserveStartEnd"
          />
          <YAxis
            width={40}
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11, fill: 'currentColor' }}
            tickFormatter={tickFor(kind)}
            domain={['auto', 'auto']}
          />
          <Tooltip
            formatter={(value) => [format(Number(value)), '']}
            separator=""
            isAnimationActive={false}
            contentStyle={{
              backgroundColor: colour.surfaceElevated,
              border: `1px solid ${colour.border}`,
              borderRadius: '10px',
              color: colour.textPrimary,
              fontSize: '13px'
            }}
          />
          {benchmark === undefined ? null : (
            <ReferenceLine
              y={benchmark}
              stroke={colour.textSecondary}
              strokeOpacity={0.5}
              strokeDasharray="4 4"
              ifOverflow="extendDomain"
              label={
                benchmarkLabel === undefined
                  ? undefined
                  : {
                      value: benchmarkLabel,
                      position: 'insideBottomRight',
                      fontSize: 11,
                      fill: colour.textSecondary
                    }
              }
            />
          )}
          {bands === undefined ? null : (
            <Area
              type="linear"
              dataKey="band"
              stroke="none"
              fill={colour.investigate}
              fillOpacity={0.12}
              connectNulls={false}
              isAnimationActive={false}
              activeDot={false}
              tooltipType="none"
            />
          )}
          <Area
            type="linear"
            dataKey="value"
            stroke={colour.textSecondary}
            strokeWidth={2}
            fill={colour.textSecondary}
            fillOpacity={0.1}
            dot={false}
            activeDot={{ r: 3 }}
            connectNulls={false}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
