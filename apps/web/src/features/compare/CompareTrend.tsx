import {
  METRIC_IDS,
  METRICS,
  type FyLabel,
  type MetricId
} from '@plainsight/calc-engine';
import { lazy, Suspense, useState, type ReactElement } from 'react';

import { SegmentedControl } from '../../components/SegmentedControl';
import { StatusValue } from '../../components/StatusValue';
import type { CompanyMetrics } from '../../hooks/useMetrics';
import { colour } from '../../styles/tokens.css';
import * as styles from './compareTrend.css';
import { useSeriesSlots } from './seriesSlots';

// The chart library loads only when a trend first renders; the picker and
// grid never pay for it.
const CompareChart = lazy(() =>
  import('./CompareChart').then((module) => ({ default: module.CompareChart }))
);

/** The ramp as CSS variables, darkest first; a company's slot picks its step. */
const SLOT_COLOURS = [
  colour.chartSeries1,
  colour.chartSeries2,
  colour.chartSeries3,
  colour.chartSeries4
] as const;

export const DEFAULT_TREND_METRIC: MetricId = 'roe';

/**
 * The measures the trend can show: the card metrics, minus absolute money
 * rows when the comparison mixes currencies (currency policy, data-model
 * spec §4), exactly as the grid hides them.
 */
export function trendOptions(mixedCurrencies: boolean): MetricId[] {
  return METRIC_IDS.filter((id) => {
    const def = METRICS[id];
    return def.card && !(mixedCurrencies && def.format === 'money');
  });
}

/**
 * The overlaid trend with its measure control (frontend spec §3) and the
 * table fallback every chart carries (frontend spec §8). The picked measure
 * lives in `?metric=`, so a bookmarked comparison restores its chart; the
 * chart-or-table view stays local, as on the metric sheet.
 */
export function CompareTrend({
  columns,
  mixedCurrencies,
  metricId,
  onMetricChange
}: {
  columns: readonly CompanyMetrics[];
  mixedCurrencies: boolean;
  metricId: MetricId;
  onMetricChange: (next: MetricId) => void;
}): ReactElement | null {
  const [view, setView] = useState<'chart' | 'table'>('chart');
  const slots = useSeriesSlots(columns.map(({ company }) => company.id));

  const fyLabels: FyLabel[] = [...new Set(columns.flatMap(({ report }) => report.fyLabels))].sort();
  if (fyLabels.length < 2) return null;

  const def = METRICS[metricId];
  const options = trendOptions(mixedCurrencies).map((id) => ({
    value: id,
    label: METRICS[id].label
  }));
  const currency = columns.find(({ report }) => report.currency !== null)?.report.currency ?? null;
  if (currency === null) return null;

  const series = columns.map(({ company, report }) => ({
    key: company.id,
    name: company.name,
    colour: SLOT_COLOURS[slots.get(company.id) ?? 0] ?? SLOT_COLOURS[0],
    values: report.metrics[metricId].values
  }));

  return (
    <section className={styles.section} aria-label="Trend">
      <SegmentedControl
        label="Trend measure"
        options={options}
        value={metricId}
        onChange={onMetricChange}
        wrap
      />

      <ul className={styles.legend}>
        {series.map((one) => (
          <li key={one.key} className={styles.legendItem}>
            <span className={styles.legendDot} style={{ backgroundColor: one.colour }} />
            {one.name}
          </li>
        ))}
      </ul>

      {view === 'chart' ? (
        <Suspense fallback={null}>
          <CompareChart series={series} fyLabels={fyLabels} kind={def.format} currency={currency} />
        </Suspense>
      ) : (
        <div className={styles.scroller}>
          <table className={styles.table}>
            <caption className={styles.srOnly}>
              {def.label} by fiscal year, each company in its own column
            </caption>
            <thead>
              <tr>
                <th scope="col" className={styles.yearHead}>
                  Year
                </th>
                {series.map((one) => (
                  <th key={one.key} scope="col" className={styles.companyHead}>
                    {one.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {fyLabels.map((fy) => (
                <tr key={fy}>
                  <th scope="row" className={styles.yearHead}>
                    {fy}
                  </th>
                  {series.map((one) => {
                    const value = one.values[fy];
                    return (
                      <td key={one.key} className={styles.cell}>
                        {value === undefined ? (
                          <span className={styles.noData}>No data</span>
                        ) : (
                          <StatusValue
                            value={value}
                            kind={def.format}
                            currency={currency}
                            scale="table"
                          />
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <button
        type="button"
        className={styles.viewToggle}
        onClick={() => setView((current) => (current === 'chart' ? 'table' : 'chart'))}
      >
        {view === 'chart' ? 'Show table' : 'Show chart'}
      </button>
    </section>
  );
}
