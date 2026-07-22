import {
  formatMetricValue,
  METRICS,
  NOT_MEANINGFUL_PHRASES,
  type CurrencyCode,
  type MetricValue
} from '@plainsight/calc-engine';
import { Link } from '@tanstack/react-router';
import { useState, type ReactElement } from 'react';

import { okPoints, Sparkline } from '../../components/Sparkline';
import type { CompanyRecord } from '../../db';
import { useLibraryReports, type LibraryReportRow } from '../../hooks/useLibraryReports';
import * as styles from './libraryTable.css';

type MetricColumn = 'roe' | 'netMargin' | 'debtToEquity';
type SortKey = 'name' | 'ticker' | 'fy' | 'flags' | MetricColumn;

interface SortState {
  key: SortKey;
  dir: 'asc' | 'desc';
}

const METRIC_COLUMNS: readonly MetricColumn[] = ['roe', 'netMargin', 'debtToEquity'];

/** Figures read best biggest-first; words read best alphabetically. */
const DESC_FIRST: ReadonlySet<SortKey> = new Set(['roe', 'netMargin', 'debtToEquity', 'flags']);

function sortValue(row: LibraryReportRow, key: SortKey): string | number | null {
  switch (key) {
    case 'name':
      return row.company.name.toLowerCase();
    case 'ticker':
      return row.company.ticker?.toLowerCase() ?? null;
    case 'fy':
      return row.report.latestFy;
    case 'flags':
      return row.activeFlagCount;
    default: {
      const latest = row.report.metrics[key].latest;
      return latest !== null && latest.status === 'ok' ? latest.value : null;
    }
  }
}

/** Rows without a value sink to the bottom in either direction: absence is not a rank. */
export function sortRows(
  rows: readonly LibraryReportRow[],
  sort: SortState | null
): readonly LibraryReportRow[] {
  if (sort === null) return rows;
  return [...rows].sort((a, b) => {
    const av = sortValue(a, sort.key);
    const bv = sortValue(b, sort.key);
    if (av === null && bv === null) return 0;
    if (av === null) return 1;
    if (bv === null) return -1;
    const cmp =
      typeof av === 'number' && typeof bv === 'number'
        ? av - bv
        : String(av).localeCompare(String(bv));
    return sort.dir === 'asc' ? cmp : -cmp;
  });
}

function MetricCell({
  latest,
  column,
  currency
}: {
  latest: MetricValue | null;
  column: MetricColumn;
  currency: CurrencyCode;
}) {
  if (latest === null) {
    return <span className={styles.quiet}>No data</span>;
  }
  if (latest.status === 'ok') {
    return <>{formatMetricValue(latest, METRICS[column].format, currency)}</>;
  }
  if (latest.status === 'not_meaningful') {
    const phrase = NOT_MEANINGFUL_PHRASES[latest.reason];
    return (
      <span className={styles.quiet} aria-label={phrase.replace('n/m:', 'not meaningful:')}>
        n/m
      </span>
    );
  }
  return (
    <span className={styles.quiet} aria-label="not enough data">
      n/a
    </span>
  );
}

/**
 * The library's screener reading (finance-look gap plan §5): one company per
 * row, the pinned four figures as sortable columns, the ROE microsparkline
 * carrying the shape. Desktop width only; the rows remain the default and
 * the phone's only mode. Sorting is client-side and resets each visit: a
 * personal library is tens of rows, and a sort is a question, not a setting.
 */
export function LibraryTable({
  companies
}: {
  companies: readonly CompanyRecord[];
}): ReactElement | null {
  const rows = useLibraryReports(companies);
  const [sort, setSort] = useState<SortState | null>(null);

  if (rows === undefined) return null;
  const ordered = sortRows(rows, sort);

  const toggle = (key: SortKey): void => {
    setSort((current) =>
      current?.key === key
        ? { key, dir: current.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: DESC_FIRST.has(key) ? 'desc' : 'asc' }
    );
  };

  const sortHead = (key: SortKey, label: string, numeric: boolean): ReactElement => (
    <th
      scope="col"
      className={numeric ? styles.numericHead : styles.textHead}
      aria-sort={
        sort?.key === key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined
      }
    >
      <button type="button" className={styles.sortButton} onClick={() => toggle(key)}>
        {label}
        {sort?.key === key ? (
          <span aria-hidden="true">{sort.dir === 'asc' ? ' ▲' : ' ▼'}</span>
        ) : null}
      </button>
    </th>
  );

  return (
    <div className={styles.scroller}>
      <table className={styles.table}>
        <caption className={styles.srOnly}>
          The library as a screener: companies as rows, latest figures as sortable columns
        </caption>
        <thead>
          <tr>
            {sortHead('name', 'Company', false)}
            {sortHead('ticker', 'Ticker', false)}
            {sortHead('fy', 'Latest FY', false)}
            {sortHead('roe', 'ROE', true)}
            {sortHead('netMargin', 'Net margin', true)}
            {sortHead('debtToEquity', 'Debt-to-equity', true)}
            {sortHead('flags', 'Flags', true)}
            <th scope="col" className={styles.sparkHead}>
              <span className={styles.srOnly}>ROE trend</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {ordered.map(({ company, report, activeFlagCount }) => {
            const badge = [company.ticker, company.exchange].filter(Boolean).join(' · ');
            const spark = okPoints(report.metrics.roe, report.fyLabels);
            return (
              <tr key={company.id}>
                <th scope="row" className={styles.rowHead}>
                  <Link
                    to="/company/$id"
                    params={{ id: company.id }}
                    className={styles.nameLink}
                    aria-label={
                      company.sample ? `${company.name}, sample data` : company.name
                    }
                  >
                    <span className={styles.name}>{company.name}</span>
                    {company.sample ? <span className={styles.sampleChip}>Sample</span> : null}
                  </Link>
                </th>
                <td className={styles.textCell}>
                  {badge === '' ? <span className={styles.quiet}>n/a</span> : badge}
                </td>
                <td className={styles.textCell}>
                  {report.latestFy ?? <span className={styles.quiet}>No data</span>}
                </td>
                {METRIC_COLUMNS.map((column) => (
                  <td key={column} className={styles.numericCell}>
                    <MetricCell
                      latest={report.metrics[column].latest}
                      column={column}
                      currency={company.currency}
                    />
                  </td>
                ))}
                <td className={styles.numericCell}>
                  {activeFlagCount > 0 ? (
                    <span
                      className={styles.flagCount}
                      aria-label={`${activeFlagCount} ${activeFlagCount === 1 ? 'flag' : 'flags'}`}
                    >
                      ● {activeFlagCount}
                    </span>
                  ) : null}
                </td>
                <td className={styles.sparkCell}>
                  {spark.length < 2 ? null : <Sparkline points={spark} />}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
