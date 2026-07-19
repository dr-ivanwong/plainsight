import {
  formatMetricValue,
  type CurrencyCode,
  type FyLabel,
  type MetricFormat
} from '@plainsight/calc-engine';
import type { ReactElement } from 'react';
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { tickFor } from '../../components/TrendChart';
import { colour } from '../../styles/tokens.css';
import * as styles from './trendSection.css';

export interface TrendPoint {
  fy: FyLabel;
  /** Null where the year did not compute; the line gaps there, never interpolates (dashboard design plan §6.2). */
  value: number | null;
}

/**
 * One metric's small-multiple chart in the dashboard's trends section
 * (dashboard design plan §6.2): a neutral stroke over the sparkline's grounding
 * fill, its own y-axis, gaps for non-computable years. Animation stays off, as
 * on every chart here: the chart states a history, it does not perform one.
 * The frame hides from the accessibility tree; the section's table view
 * carries the same numbers as text.
 */
export function TrendMiniChart({
  points,
  kind,
  currency
}: {
  points: readonly TrendPoint[];
  kind: MetricFormat;
  currency: CurrencyCode;
}): ReactElement {
  const format = (value: number) =>
    formatMetricValue({ status: 'ok', value }, kind, currency);

  return (
    <div className={styles.chartFrame} aria-hidden="true">
      <ResponsiveContainer width="100%" height={160}>
        <AreaChart data={[...points]} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
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
