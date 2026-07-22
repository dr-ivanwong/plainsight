import {
  formatMetricValue,
  METRICS,
  type CurrencyCode,
  type FyLabel,
  type MetricId
} from '@plainsight/calc-engine';
import { useLiveQuery } from 'dexie-react-hooks';
import { lazy, Suspense, useState, type ReactElement } from 'react';

import { SegmentedControl } from '../../components/SegmentedControl';
import { StatusValue } from '../../components/StatusValue';
import { BENCHMARK_DEFAULTS, db } from '../../db';
import { useBenchmarks } from '../../hooks/useBenchmarks';
import type { CompanyMetrics } from '../../hooks/useMetrics';
import { BenchmarkEditor } from './BenchmarkEditor';
import { DASHBOARD_SECTIONS } from './sections';
import type { TrendPoint } from './TrendMiniChart';
import * as styles from './trendSection.css';

/**
 * The line's right-edge words (dashboard design plan §6.5): a reference by
 * default, but while the coverage line sits at the fragility rule's own
 * pinned floor it speaks as the rule's line rather than a coincidence.
 */
export function benchmarkLabelFor(
  id: MetricId,
  value: number,
  currency: CurrencyCode
): string {
  const figure = formatMetricValue({ status: 'ok', value }, METRICS[id].format, currency);
  const ruleLine = id === 'interestCoverage' && value === BENCHMARK_DEFAULTS.interestCoverage;
  return `${figure} ${ruleLine ? 'rule threshold' : 'reference'}`;
}

// The chart library loads only when the section first renders a chart; the
// picker and the table fallback never pay for it.
const TrendMiniChart = lazy(() =>
  import('./TrendMiniChart').then((module) => ({ default: module.TrendMiniChart }))
);

/**
 * The dashboard's trends section (dashboard design plan §6): one metric group
 * at a time as small multiples on a shared run of fiscal years, with the
 * table fallback every chart carries (frontend spec §8). Absent below three
 * labelled years: trend shape needs at least three points; the sparklines
 * and delta chips carry the story until then. The years drawn come from the
 * dashboard's year-range control (dashboard design plan §5.5); presence
 * gates on the full history regardless of the range picked.
 */
export function TrendSection({
  metrics,
  fyLabels
}: {
  metrics: CompanyMetrics;
  /** The fiscal years in the picked range, ascending. */
  fyLabels: readonly FyLabel[];
}): ReactElement | null {
  const { company, report } = metrics;
  const [groupLabel, setGroupLabel] = useState<string>(DASHBOARD_SECTIONS[0]?.label ?? '');
  const [view, setView] = useState<'chart' | 'table'>('chart');
  const benchmarks = useBenchmarks();
  const educationRow = useLiveQuery(() => db.meta.get('educationLayerOff'), []);
  const educationOff = educationRow?.value === true;

  const group = DASHBOARD_SECTIONS.find((section) => section.label === groupLabel);
  if (report.fyLabels.length < 3 || group === undefined) return null;

  const options = DASHBOARD_SECTIONS.map((section) => ({
    value: section.label,
    label: section.label
  }));

  return (
    <section className={styles.section} aria-label="Trends">
      <h2 className={styles.heading}>Trends</h2>

      <SegmentedControl
        label="Trend group"
        options={options}
        value={group.label}
        onChange={setGroupLabel}
      />

      {view === 'chart' ? (
        <div className={styles.chartRow}>
          {group.ids.map((id) => {
            const def = METRICS[id];
            const series = report.metrics[id];
            const points: TrendPoint[] = fyLabels.map((fy) => {
              const value = series.values[fy];
              return {
                fy,
                value: value !== undefined && value.status === 'ok' ? value.value : null
              };
            });
            const plottable = points.filter((point) => point.value !== null).length >= 2;
            const benchmark = benchmarks?.[id];
            return (
              <figure key={id} className={styles.chartCell}>
                <figcaption className={styles.chartLabel}>{def.label}</figcaption>
                {plottable ? (
                  <Suspense fallback={<div className={styles.chartGhost} />}>
                    <TrendMiniChart
                      points={points}
                      kind={def.format}
                      currency={company.currency}
                      benchmark={benchmark}
                      benchmarkLabel={
                        benchmark === undefined
                          ? undefined
                          : benchmarkLabelFor(id, benchmark, company.currency)
                      }
                      healthDirection={def.healthDirection}
                    />
                  </Suspense>
                ) : (
                  <p className={styles.chartEmpty}>
                    {series.latest === null ? (
                      'No data'
                    ) : (
                      <StatusValue
                        value={series.latest}
                        kind={def.format}
                        currency={company.currency}
                        scale="table"
                      />
                    )}
                  </p>
                )}
                {def.format === 'money' ? null : (
                  // An absolute-money reference needs the entry-scale
                  // conversation this small field cannot hold; the money
                  // chart keeps its editor away until someone misses it.
                  <BenchmarkEditor
                    metricId={id}
                    kind={def.format}
                    currency={company.currency}
                    value={benchmark}
                    educationOff={educationOff}
                  />
                )}
              </figure>
            );
          })}
        </div>
      ) : (
        <div className={styles.scroller}>
          <table className={styles.table}>
            <caption className={styles.srOnly}>
              {group.label} trends by fiscal year, metrics as rows
            </caption>
            <thead>
              <tr>
                <th scope="col" className={styles.metricColHead}>
                  Metric
                </th>
                {fyLabels.map((fy) => (
                  <th key={fy} scope="col" className={styles.yearHead}>
                    {fy}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {group.ids.map((id) => (
                <tr key={id}>
                  <th scope="row" className={styles.metricRowHead}>
                    {METRICS[id].label}
                  </th>
                  {fyLabels.map((fy) => {
                    const value = report.metrics[id].values[fy];
                    return (
                      <td key={fy} className={styles.cell}>
                        {value === undefined ? (
                          <span className={styles.noData}>No data</span>
                        ) : (
                          <StatusValue
                            value={value}
                            kind={METRICS[id].format}
                            currency={company.currency}
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
        {view === 'chart' ? 'Show table' : 'Show charts'}
      </button>
    </section>
  );
}
