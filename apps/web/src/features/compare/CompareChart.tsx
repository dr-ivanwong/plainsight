import {
  formatMetricValue,
  type CurrencyCode,
  type FyLabel,
  type MetricFormat,
  type MetricValue
} from '@plainsight/calc-engine';
import type { ReactElement } from 'react';
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { tickFor } from '../../components/TrendChart';
import { colour } from '../../styles/tokens.css';
import * as styles from './compareTrend.css';

export interface CompareSeries {
  /** Stable data key: the company id. */
  key: string;
  name: string;
  /** Slot colour from the chart ramp; follows the company, never its rank. */
  colour: string;
  values: Partial<Record<FyLabel, MetricValue>>;
}

/** One row per labelled year; a year a company cannot speak to stays null and the line gaps. */
const rowsFor = (
  series: readonly CompareSeries[],
  fyLabels: readonly FyLabel[]
): Array<Record<string, string | number | null>> =>
  fyLabels.map((fy) => {
    const row: Record<string, string | number | null> = { fy };
    for (const one of series) {
      const value = one.values[fy];
      row[one.key] = value !== undefined && value.status === 'ok' ? value.value : null;
    }
    return row;
  });

/** The plot's approximate inner height: the chart's 240 less its top margin and x-axis strip. */
const PLOT_HEIGHT = 202;
/** Minimum vertical distance between two end labels, one caption line apart. */
const LABEL_PITCH = 13;

/**
 * Vertical offsets that keep line-end labels legible when lines finish close
 * together (two companies can end a measure near-equal: the very case worth
 * comparing). Positions are estimated from the value span, labels sorted top
 * to bottom, and any pair closer than a caption line pushed apart; every
 * label keeps its line's colour-free identity either way, since the legend
 * and the table carry the same names. Exported for its unit test.
 */
export function endLabelOffsets(
  finals: ReadonlyMap<string, number>,
  allValues: readonly number[]
): ReadonlyMap<string, number> {
  const offsets = new Map<string, number>();
  if (finals.size < 2 || allValues.length === 0) return offsets;
  const high = Math.max(...allValues);
  const span = high - Math.min(...allValues);
  if (span <= 0) {
    // Every plotted value equal: fan the labels out below the shared line.
    [...finals.keys()].forEach((key, index) => offsets.set(key, index * LABEL_PITCH));
    return offsets;
  }
  const estimated = [...finals.entries()]
    .map(([key, value]) => ({ key, y: ((high - value) / span) * PLOT_HEIGHT }))
    .sort((a, b) => a.y - b.y);
  let floor = Number.NEGATIVE_INFINITY;
  for (const label of estimated) {
    const y = Math.max(label.y, floor);
    offsets.set(label.key, y - label.y);
    floor = y + LABEL_PITCH;
  }
  return offsets;
}

/**
 * The overlaid trend (frontend spec §3): one line per company for the picked
 * measure, 2px marks, no dots, gaps where a year does not compute. Identity
 * never rides on colour alone: each line ends in its company's name, the
 * legend sits above, hover speaks the numbers, and the table view renders the
 * same series in text. Animation stays off, as on every chart here: the
 * chart states a history, it does not perform one.
 */
export function CompareChart({
  series,
  fyLabels,
  kind,
  currency
}: {
  series: readonly CompareSeries[];
  fyLabels: readonly FyLabel[];
  kind: MetricFormat;
  currency: CurrencyCode;
}): ReactElement | null {
  if (fyLabels.length < 2) return null;
  const rows = rowsFor(series, fyLabels);
  const lastIndexByKey = new Map<string, number>(
    series.map((one) => [
      one.key,
      rows.reduce((last, row, index) => (row[one.key] === null ? last : index), -1)
    ])
  );
  const plotted = rows.flatMap((row) =>
    series.map((one) => row[one.key]).filter((value): value is number => typeof value === 'number')
  );
  const finals = new Map<string, number>();
  for (const one of series) {
    const last = lastIndexByKey.get(one.key) ?? -1;
    const value = last >= 0 ? rows[last]?.[one.key] : undefined;
    if (typeof value === 'number') finals.set(one.key, value);
  }
  const labelOffsets = endLabelOffsets(finals, plotted);
  const format = (value: number) => formatMetricValue({ status: 'ok', value }, kind, currency);

  // Recharts invokes the label renderer per point and requires an element
  // back; every point except the line's end renders an empty group.
  const endLabelFor =
    (one: CompareSeries) =>
    (props: { x?: number | string; y?: number | string; index?: number }): ReactElement => {
      if (props.index !== lastIndexByKey.get(one.key)) return <g />;
      const x = typeof props.x === 'number' ? props.x : 0;
      const y = typeof props.y === 'number' ? props.y : 0;
      return (
        <text
          x={x + 6}
          y={y + (labelOffsets.get(one.key) ?? 0)}
          fill={colour.textSecondary}
          fontSize={11}
          dominantBaseline="central"
          textAnchor="start"
        >
          {one.name}
        </text>
      );
    };

  return (
    <div className={styles.frame} aria-hidden="true">
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={rows} margin={{ top: 8, right: 88, bottom: 0, left: 8 }}>
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
            formatter={(value, name) => [format(Number(value)), String(name)]}
            isAnimationActive={false}
            contentStyle={{
              backgroundColor: colour.surfaceElevated,
              border: `1px solid ${colour.border}`,
              borderRadius: '10px',
              color: colour.textPrimary,
              fontSize: '13px'
            }}
          />
          {series.map((one) => (
            <Line
              key={one.key}
              type="linear"
              dataKey={one.key}
              name={one.name}
              stroke={one.colour}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 3 }}
              connectNulls={false}
              isAnimationActive={false}
              label={endLabelFor(one)}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
