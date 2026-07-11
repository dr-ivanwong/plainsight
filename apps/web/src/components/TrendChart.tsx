import {
  formatMetricValue,
  type CurrencyCode,
  type MetricFormat
} from '@plainsight/calc-engine';
import type { ReactElement } from 'react';
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { colour } from '../styles/tokens.css';
import type { SparkPoint } from './Sparkline';
import * as styles from './trendChart.css';

const tickFor = (kind: MetricFormat) => (value: number) => {
  if (kind === 'percent') return `${Math.round(value * 100)}%`;
  if (kind === 'coverage') return `${Math.round(value)}×`;
  if (kind === 'money') return '';
  return String(value);
};

/**
 * The detail sheet's full ten-year chart (frontend spec §5). Animation stays
 * off: the chart states a history, it does not perform one, and reduced
 * motion then needs no special case. Fewer than two computed years renders
 * nothing; the table fallback beside it always carries the numbers.
 */
export function TrendChart({
  points,
  kind,
  currency
}: {
  points: readonly SparkPoint[];
  kind: MetricFormat;
  currency: CurrencyCode;
}): ReactElement | null {
  if (points.length < 2) return null;
  const format = (value: number) =>
    formatMetricValue({ status: 'ok', value }, kind, currency);

  return (
    <div className={styles.frame}>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={[...points]} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
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
          <Line
            type="linear"
            dataKey="value"
            stroke={colour.accent}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 3 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
