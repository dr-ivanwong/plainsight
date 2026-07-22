/**
 * One pair's equity per dollar of one-unit capital, training and holdout
 * as separate series over one calendar: each window normalises to 1.0 at
 * its own start, the holdout region is shaded, and the split is where
 * the shading begins. The chart states a history, it does not perform
 * one (animation off, the house rule); it hides from the accessibility
 * tree, the stats table beside it carrying the same numbers as text.
 */
import type { BacktestPair } from '@plainsight/api-contract';
import type { ReactElement } from 'react';
import {
  Line,
  LineChart,
  ReferenceArea,
  ResponsiveContainer,
  XAxis,
  YAxis
} from 'recharts';

import { colour } from '../../styles/tokens.css';
import * as styles from './backtest.css';

interface EquityPoint {
  date: string;
  train: number | null;
  holdout: number | null;
}

export function equityPoints(pair: BacktestPair): EquityPoint[] {
  const points: EquityPoint[] = [];
  const trainCapital = pair.train.capitalPerUnit;
  pair.train.equity.dates.forEach((date, index) => {
    points.push({
      date,
      train: (pair.train.equity.values[index] ?? trainCapital) / trainCapital,
      holdout: null
    });
  });
  const holdoutCapital = pair.holdout.capitalPerUnit;
  pair.holdout.equity.dates.forEach((date, index) => {
    points.push({
      date,
      train: null,
      holdout: (pair.holdout.equity.values[index] ?? holdoutCapital) / holdoutCapital
    });
  });
  return points;
}

export function EquityChart({ pair }: { pair: BacktestPair }): ReactElement {
  const points = equityPoints(pair);
  return (
    <div className={styles.chartFrame} aria-hidden="true">
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <XAxis
            dataKey="date"
            interval="preserveStartEnd"
            minTickGap={80}
            tick={{ fontSize: 11, fill: colour.textSecondary }}
            tickLine={false}
            axisLine={{ stroke: colour.border }}
          />
          <YAxis
            width={44}
            domain={['auto', 'auto']}
            tick={{ fontSize: 11, fill: colour.textSecondary }}
            tickFormatter={(value: number) => value.toFixed(2)}
            tickLine={false}
            axisLine={false}
          />
          <ReferenceArea
            x1={pair.holdout.start}
            x2={pair.holdout.end}
            fill={colour.accent}
            fillOpacity={0.07}
          />
          <Line
            dataKey="train"
            stroke={colour.chartSeries2}
            dot={false}
            strokeWidth={1.5}
            isAnimationActive={false}
          />
          <Line
            dataKey="holdout"
            stroke={colour.accent}
            dot={false}
            strokeWidth={1.5}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
