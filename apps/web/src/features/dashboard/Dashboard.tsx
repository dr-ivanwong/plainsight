import {
  formatMetricValue,
  METRICS,
  NOT_MEANINGFUL_PHRASES,
  type MetricFormat,
  type MetricId,
  type MetricSeries
} from '@plainsight/calc-engine';
import { Link } from '@tanstack/react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { Fragment, useState, type ReactElement } from 'react';

import { MetricCard, type HistoryEntry } from '../../components/MetricCard';
import { RedFlagBanner } from '../../components/RedFlagBanner';
import { SegmentedControl } from '../../components/SegmentedControl';
import { okPoints, type SparkPoint } from '../../components/Sparkline';
import { db, setMeta } from '../../db';
import type { CompanyMetrics } from '../../hooks/useMetrics';
import { useRedFlags } from '../../hooks/useRedFlags';
import * as buttons from '../../styles/buttons.css';
import * as styles from './dashboard.css';
import { entrySearchFor } from './entrySearch';
import { cardHealth } from './healthSignal';
import { KeyStats } from './KeyStats';
import { MetricSheet } from './MetricSheet';
import { MetricTable } from './MetricTable';
import { PriceCard } from './PriceCard';
import { DASHBOARD_SECTIONS } from './sections';
import { TrendSection } from './TrendSection';

const STALE_PRICE_MS = 90 * 86_400_000;

/** The year-range scopes (dashboard design plan §5.5); the control exists only past five years. */
type YearRange = 'last5' | 'last10' | 'all';

const YEAR_RANGE_OPTIONS: readonly { value: YearRange; label: string }[] = [
  { value: 'last5', label: 'Last 5 years' },
  { value: 'last10', label: 'Last 10 years' },
  { value: 'all', label: 'All' }
];

/** The card grid and the practitioner table (dashboard design plan §5.4); cards are the default. */
const VIEW_OPTIONS: readonly { value: 'cards' | 'table'; label: string }[] = [
  { value: 'cards', label: 'Cards' },
  { value: 'table', label: 'Table' }
];

/**
 * The company dashboard (frontend spec §3): hero facts, then the twelve-card
 * grid in its five groups (dashboard design plan §5.2). Insufficient cards
 * are the door back into data entry, landing on the first missing number.
 * Sparklines, deltas and the red-flag section join with the dashboard-depth
 * slice.
 */
export function Dashboard({
  metrics,
  metric,
  onMetricClose
}: {
  metrics: CompanyMetrics;
  /** The open detail sheet, addressed by the `?metric=` search param. */
  metric?: MetricId;
  onMetricClose: () => void;
}): ReactElement {
  const { company, price, report } = metrics;
  const flags = useRedFlags(company.id, report);
  const [showDismissed, setShowDismissed] = useState(false);
  // Not persisted by design: the range resets to the default each visit
  // (dashboard design plan §5.5). Cards and sparklines deliberately ignore it.
  const [yearRange, setYearRange] = useState<YearRange>('last5');
  const rangedFyLabels =
    yearRange === 'all'
      ? report.fyLabels
      : report.fyLabels.slice(yearRange === 'last5' ? -5 : -10);
  // The cards-or-table choice persists beside the theme preference.
  const tableViewRow = useLiveQuery(() => db.meta.get('dashboardTableView'), []);
  const view: 'cards' | 'table' = tableViewRow?.value === true ? 'table' : 'cards';
  const hero = [company.sector, report.latestFy, company.currency]
    .filter((part): part is string => typeof part === 'string' && part !== '')
    .join(' · ');
  const priceIsStale =
    price !== null && Date.now() - Date.parse(price.asOf) > STALE_PRICE_MS;

  // Sparklines draw the labelled years that computed; they need at least two
  // (data-sufficiency policy), which Sparkline itself enforces.
  const sparkFor = (series: MetricSeries): SparkPoint[] => okPoints(series, report.fyLabels);

  // The card-level health signal reads active flags only: a dismissed flag
  // has been reviewed, so it stops claiming the dot.
  const activeRuleIds = flags?.active.map((flag) => flag.ruleId) ?? [];

  // The multi-year row (dashboard design plan §4.6): the latest five labelled
  // years, from three years of history up. Always the same five whatever the
  // range control says: ranges are suffixes sharing one tail, and the card
  // face pins its width at five; the table and charts carry longer ranges.
  const historyFor = (
    series: MetricSeries,
    kind: MetricFormat
  ): HistoryEntry[] | undefined => {
    if (report.fyLabels.length < 3) return undefined;
    return report.fyLabels.slice(-5).map((fy) => {
      const value = series.values[fy];
      if (value === undefined || value.status === 'insufficient_data') {
        return { fy, display: 'n/a', spoken: 'not enough data' };
      }
      if (value.status === 'not_meaningful') {
        const phrase = NOT_MEANINGFUL_PHRASES[value.reason];
        return { fy, display: 'n/m', spoken: phrase.replace('n/m:', 'not meaningful:') };
      }
      return { fy, display: formatMetricValue(value, kind, company.currency) };
    });
  };

  // One dashboard card. The section map supplies the ids, which the dashboard
  // test holds to the dictionary's card flags (the metric-budget decision).
  const renderCard = (id: MetricId): ReactElement | null => {
    const def = METRICS[id];
    const series = report.metrics[id];
    const latest = series.latest;
    if (latest === null) return null;

    const valuation = id === 'pe' || id === 'fcfYield';
    if (valuation && price === null) {
      // Both valuation cards collapse into the single price card.
      return id === 'pe' ? <PriceCard key="price" company={company} /> : null;
    }

    const spark = sparkFor(series);
    const health = cardHealth(id, series.delta, activeRuleIds);
    const history = historyFor(series, def.format);
    if (latest.status === 'insufficient_data' && report.latestFy !== null) {
      return (
        <Link
          key={id}
          to="/company/$id/entry"
          params={{ id: company.id }}
          search={entrySearchFor(latest.missing, report.latestFy)}
          className={styles.cardLink}
        >
          <MetricCard
            label={def.label}
            value={latest}
            kind={def.format}
            currency={company.currency}
            spark={spark}
            delta={series.delta ?? undefined}
            health={health}
            healthDirection={def.healthDirection}
            history={history}
          />
        </Link>
      );
    }

    return (
      <Link
        key={id}
        to="/company/$id"
        params={{ id: company.id }}
        search={{ metric: id }}
        className={styles.cardLink}
      >
        <MetricCard
          label={def.label}
          value={latest}
          kind={def.format}
          currency={company.currency}
          spark={spark}
          delta={series.delta ?? undefined}
          health={health}
          healthDirection={def.healthDirection}
          history={history}
          footnote={valuation && price !== null ? `as of ${price.asOf}` : undefined}
          stale={valuation && priceIsStale}
        />
      </Link>
    );
  };

  return (
    <>
      <header className={styles.chrome}>
        <Link to="/" className={styles.back}>
          ‹ Library
        </Link>
        <Link
          to="/company/$id/entry"
          params={{ id: company.id }}
          className={styles.editData}
        >
          Edit data
        </Link>
      </header>

      <div className={styles.hero}>
        <h1 className={styles.name}>{company.name}</h1>
        {hero === '' ? null : <p className={styles.heroFacts}>{hero}</p>}
      </div>

      {report.fyLabels.length === 0 ? (
        <section className={styles.empty}>
          <p className={styles.emptyNote}>
            No statements yet. Enter the first fiscal year and the twelve measures appear here.
          </p>
          <Link
            to="/company/$id/entry"
            params={{ id: company.id }}
            className={buttons.primaryAction}
          >
            Add the first year
          </Link>
        </section>
      ) : (
        <>
          <KeyStats metrics={metrics} />

          <div className={styles.controlsRow}>
            {report.fyLabels.length > 5 ? (
              <SegmentedControl
                label="Year range"
                options={YEAR_RANGE_OPTIONS}
                value={yearRange}
                onChange={setYearRange}
              />
            ) : null}
            <div className={styles.viewControl}>
              <SegmentedControl
                label="Dashboard view"
                options={VIEW_OPTIONS}
                value={view}
                onChange={(next) => void setMeta(db, 'dashboardTableView', next === 'table')}
              />
            </div>
          </div>

          {view === 'table' ? (
            <MetricTable metrics={metrics} fyLabels={rangedFyLabels} activeRuleIds={activeRuleIds} />
          ) : (
            <section className={styles.grid} aria-label="Metrics">
              {DASHBOARD_SECTIONS.map(({ label, ids }) => (
                <Fragment key={label}>
                  <h2 className={styles.sectionLabel}>{label}</h2>
                  {ids.map((id) => renderCard(id))}
                </Fragment>
              ))}
            </section>
          )}

          {report.fyLabels.length === 1 ? (
            <p className={styles.trendHint}>Add more years to see trends.</p>
          ) : null}

          <TrendSection metrics={metrics} fyLabels={rangedFyLabels} />

          {flags !== undefined && (flags.active.length > 0 || flags.dismissed.length > 0) ? (
            <section className={styles.flagSection} aria-label="Items to investigate">
              <h2 className={styles.flagsHeading}>Items to investigate</h2>
              {flags.active.map((flag) => (
                <RedFlagBanner
                  key={flag.ruleId}
                  flag={flag}
                  onDismiss={() => void flags.dismiss(flag.ruleId)}
                />
              ))}
              {flags.dismissed.length > 0 ? (
                <>
                  <button
                    type="button"
                    className={styles.dismissedToggle}
                    aria-expanded={showDismissed}
                    onClick={() => setShowDismissed((open) => !open)}
                  >
                    {flags.dismissed.length} dismissed
                  </button>
                  {showDismissed
                    ? flags.dismissed.map((flag) => (
                        <RedFlagBanner
                          key={flag.ruleId}
                          flag={flag}
                          muted
                          onRestore={() => void flags.restore(flag.ruleId)}
                        />
                      ))
                    : null}
                </>
              ) : null}
            </section>
          ) : null}

          <Link to="/company/$id/thesis" params={{ id: company.id }} className={styles.thesisRow}>
            <span className={styles.thesisTitle}>Thesis</span>
            <span className={styles.thesisHint}>
              Business, moat, valuation, what kills it: in your own words.
            </span>
          </Link>
        </>
      )}

      {metric === undefined ? null : (
        <MetricSheet metricId={metric} metrics={metrics} onClose={onMetricClose} />
      )}
    </>
  );
}
