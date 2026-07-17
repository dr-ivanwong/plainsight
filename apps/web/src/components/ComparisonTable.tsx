import { METRIC_IDS, METRICS, type MetricsReport, type MetricValue } from '@plainsight/calc-engine';
import { Link } from '@tanstack/react-router';
import type { ReactElement } from 'react';

import * as styles from './comparisonTable.css';
import { StatusValue } from './StatusValue';

export interface CompareColumn {
  companyId: string;
  name: string;
  report: MetricsReport;
}

/**
 * The winners of one comparison row: the highest ok value (lowest where lower
 * is better), ticking every tied leader. Nothing wins with fewer than two
 * comparable values, and nothing wins when all comparable values are equal:
 * a tick that every column carries says nothing.
 */
export function bestOfRow(
  values: readonly (MetricValue | null)[],
  higherIsBetter: boolean
): ReadonlySet<number> {
  const comparable = values.flatMap((value, index) =>
    value !== null && value.status === 'ok' ? [{ index, value: value.value }] : []
  );
  if (comparable.length < 2) return new Set();
  const best = higherIsBetter
    ? Math.max(...comparable.map((entry) => entry.value))
    : Math.min(...comparable.map((entry) => entry.value));
  const winners = comparable.filter((entry) => entry.value === best);
  if (winners.length === comparable.length) return new Set();
  return new Set(winners.map((entry) => entry.index));
}

/** The column's context line: each company compares at its own latest year, stated plainly. */
const columnFacts = (report: MetricsReport): string =>
  [report.latestFy, report.currency].filter((fact) => fact !== null).join(' · ');

/**
 * The compare grid (frontend spec §5): the twelve card metrics as rows,
 * companies as columns, best-in-row subtly ticked. With mixed currencies the
 * absolute money rows hide (currency policy, data-model spec §4); ratios and
 * percentages compare freely. Values render through StatusValue, so the
 * degenerate cases speak the pinned phrases here exactly as they do on the
 * dashboard.
 */
export function ComparisonTable({
  columns,
  hideAbsolutes
}: {
  columns: readonly CompareColumn[];
  hideAbsolutes: boolean;
}): ReactElement {
  const rows = METRIC_IDS.map((id) => METRICS[id]).filter(
    (def) => def.card && !(hideAbsolutes && def.format === 'money')
  );

  return (
    <div className={styles.scroller}>
      <table className={styles.table}>
        <caption className={styles.srOnly}>
          Each company&apos;s latest fiscal year, side by side
        </caption>
        <thead>
          <tr>
            <th scope="col" className={styles.labelHead}>
              Measure
            </th>
            {columns.map((column) => (
              <th key={column.companyId} scope="col" className={styles.companyHead}>
                <Link
                  to="/company/$id"
                  params={{ id: column.companyId }}
                  className={styles.companyLink}
                >
                  {column.name}
                </Link>
                {columnFacts(column.report) === '' ? null : (
                  <span className={styles.companyFacts}>{columnFacts(column.report)}</span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((def) => {
            const latests = columns.map((column) => column.report.metrics[def.id].latest);
            const best = bestOfRow(latests, def.higherIsBetter);
            return (
              <tr key={def.id}>
                <th scope="row" className={styles.rowLabel}>
                  {def.label}
                </th>
                {columns.map((column, index) => {
                  const latest = column.report.metrics[def.id].latest;
                  const currency = column.report.currency;
                  return (
                    <td key={column.companyId} className={styles.cell}>
                      {latest === null || currency === null ? (
                        <span className={styles.noData}>No data</span>
                      ) : (
                        <StatusValue
                          value={latest}
                          kind={def.format}
                          currency={currency}
                          scale="table"
                        />
                      )}
                      {best.has(index) ? (
                        <>
                          <span className={styles.tick} aria-hidden="true">
                            {' ✓'}
                          </span>
                          <span className={styles.srOnly}>Best of the group</span>
                        </>
                      ) : null}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
