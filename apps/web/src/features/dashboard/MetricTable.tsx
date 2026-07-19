import {
  formatMetricValue,
  METRICS,
  NOT_MEANINGFUL_PHRASES,
  type FyLabel,
  type MetricId,
  type MetricValue,
  type RuleId
} from '@plainsight/calc-engine';
import { Link } from '@tanstack/react-router';
import type { KeyboardEvent, ReactElement } from 'react';

import { DeltaChip } from '../../components/DeltaChip';
import type { CompanyMetrics } from '../../hooks/useMetrics';
import { entrySearchFor } from './entrySearch';
import { cardHealth } from './healthSignal';
import * as styles from './metricTable.css';
import { PriceCard } from './PriceCard';
import { DASHBOARD_SECTIONS } from './sections';

/**
 * The practitioner table view (dashboard design plan §5.4): the same twelve
 * measures as the card grid, metrics as rows and fiscal years as columns,
 * grouped under the cards' five section labels. Cells speak short forms
 * ("n/m", "n/a") and carry the full pinned phrase as their accessible name;
 * the year columns follow the dashboard's year-range control. Arrow keys move
 * between the metric links, the table's focusable spine (the data-entry
 * grid's vertical model; cells hold no focusable content, so horizontal
 * movement stays with the scroller).
 */
export function MetricTable({
  metrics,
  fyLabels,
  activeRuleIds
}: {
  metrics: CompanyMetrics;
  /** The fiscal years in the picked range, ascending. */
  fyLabels: readonly FyLabel[];
  /** Fired, undismissed rules; they feed the row-level health dots. */
  activeRuleIds: readonly RuleId[];
}): ReactElement {
  const { company, price, report } = metrics;
  const showDelta = report.fyLabels.length > 1;
  const columnCount = 1 + fyLabels.length + (showDelta ? 1 : 0);

  const handleKeyDown = (event: KeyboardEvent<HTMLTableElement>): void => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    const target = event.target;
    if (!(target instanceof HTMLElement) || target.dataset['rowLink'] === undefined) return;
    const links = [...event.currentTarget.querySelectorAll<HTMLElement>('[data-row-link]')];
    const next = links[links.indexOf(target) + (event.key === 'ArrowDown' ? 1 : -1)];
    if (next !== undefined) {
      event.preventDefault();
      next.focus();
    }
  };

  const cellFor = (id: MetricId, fy: FyLabel, value: MetricValue | undefined): ReactElement => {
    if (value === undefined) {
      return <span className={styles.quiet}>No data</span>;
    }
    if (value.status === 'ok') {
      return <>{formatMetricValue(value, METRICS[id].format, company.currency)}</>;
    }
    if (value.status === 'not_meaningful') {
      const phrase = NOT_MEANINGFUL_PHRASES[value.reason];
      return (
        <span className={styles.quiet} aria-label={phrase.replace('n/m:', 'not meaningful:')}>
          n/m
        </span>
      );
    }
    const count = value.missing.length;
    if (fy === report.latestFy) {
      // The latest year's gap is the door back into data entry, as on its card.
      return (
        <Link
          to="/company/$id/entry"
          params={{ id: company.id }}
          search={entrySearchFor(value.missing, fy)}
          className={styles.cellLink}
          aria-label={`Add the ${count} missing ${count === 1 ? 'number' : 'numbers'}`}
        >
          n/a
        </Link>
      );
    }
    return (
      <span className={styles.quiet} aria-label="not enough data">
        n/a
      </span>
    );
  };

  const rowFor = (id: MetricId): ReactElement => {
    const def = METRICS[id];
    const series = report.metrics[id];
    const health = cardHealth(id, series.delta, activeRuleIds);
    return (
      <tr key={id}>
        <th scope="row" className={styles.rowHead}>
          <Link
            to="/company/$id"
            params={{ id: company.id }}
            search={{ metric: id }}
            className={styles.rowLink}
            data-row-link=""
          >
            {health === undefined ? null : (
              <span
                role="img"
                aria-label={health === 'healthy' ? 'improving' : 'worth investigating'}
                className={health === 'healthy' ? styles.dotHealthy : styles.dotInvestigate}
              />
            )}
            {def.label}
          </Link>
        </th>
        {fyLabels.map((fy) => (
          <td key={fy} className={styles.cell}>
            {cellFor(id, fy, series.values[fy])}
          </td>
        ))}
        {showDelta ? (
          <td className={styles.cell}>
            {series.delta === null ? null : (
              <DeltaChip
                delta={series.delta}
                kind={def.format}
                currency={company.currency}
                healthDirection={def.healthDirection}
              />
            )}
          </td>
        ) : null}
      </tr>
    );
  };

  return (
    <section aria-label="Metrics">
      <div className={styles.scroller}>
        <table className={styles.table} onKeyDown={handleKeyDown}>
          <caption className={styles.srOnly}>
            The twelve measures by fiscal year, grouped as on the cards
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
              {showDelta ? (
                <th scope="col" className={styles.yearHead}>
                  5y delta
                </th>
              ) : null}
            </tr>
          </thead>
          {DASHBOARD_SECTIONS.map(({ label, ids }) => {
            // Both valuation rows collapse into the one enter-price row until
            // a price exists, mirroring the card collapse.
            const collapsed = price === null && ids.includes('pe');
            return (
              <tbody key={label}>
                <tr>
                  <th colSpan={columnCount} scope="colgroup" className={styles.sectionRow}>
                    {label}
                  </th>
                </tr>
                {collapsed ? (
                  <tr>
                    <td colSpan={columnCount} className={styles.priceCell}>
                      <PriceCard company={company} />
                    </td>
                  </tr>
                ) : (
                  ids.map((id) => rowFor(id))
                )}
              </tbody>
            );
          })}
        </table>
      </div>
    </section>
  );
}
