import {
  LINE_ITEMS,
  METRIC_IDS,
  METRICS,
  type FyLabel,
  type LineItemId,
  type MetricId,
  type MetricSeries
} from '@plainsight/calc-engine';
import { Link } from '@tanstack/react-router';
import { useState, type FormEvent, type ReactElement } from 'react';

import { MetricCard } from '../../components/MetricCard';
import { parseEntryText } from '../../components/moneyEntry';
import { RedFlagBanner } from '../../components/RedFlagBanner';
import type { SparkPoint } from '../../components/Sparkline';
import { db, putPrice, type CompanyRecord } from '../../db';
import type { CompanyMetrics } from '../../hooks/useMetrics';
import { useRedFlags } from '../../hooks/useRedFlags';
import * as buttons from '../../styles/buttons.css';
import * as styles from './dashboard.css';
import { MetricSheet } from './MetricSheet';

/** The 12 dashboard cards come straight from the dictionary's card flags (the metric-budget decision). */
const CARD_IDS: readonly MetricId[] = METRIC_IDS.filter((id) => METRICS[id].card);

const STALE_PRICE_MS = 90 * 86_400_000;

const localToday = (): string => {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

/** The pinned deep link (data-model spec §10): the first missing item, in its home statement. */
function entrySearchFor(missing: readonly LineItemId[], fy: FyLabel) {
  const first = missing[0];
  if (first === undefined) return { fy };
  return { stmt: LINE_ITEMS[first].statement, fy, focus: first };
}

/**
 * The two valuation cards collapse into one enter-price card until a price
 * exists (frontend spec §3); on save they expand in place through the live
 * query. Price is a sibling record, not a line item.
 */
function PriceCard({ company }: { company: CompanyRecord }): ReactElement {
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const parsed = parseEntryText(String(form.get('price') ?? ''), {
      scale: 'ones',
      unit: 'money',
      signed: false
    });
    const asOf = String(form.get('asOf') ?? '');
    if (!parsed.ok || parsed.minor === null || parsed.minor <= 0) {
      setError('Enter the share price as a positive amount.');
      return;
    }
    try {
      await putPrice(db, {
        companyId: company.id,
        amountMinor: parsed.minor,
        currency: company.currency,
        asOf
      });
    } catch {
      setError('Could not save the price.');
    }
  }

  return (
    <article className={styles.priceCard} aria-label="Enter today's price">
      <h3 className={styles.priceTitle}>Enter today&apos;s price</h3>
      <p className={styles.priceNote}>
        The two valuation measures need a share price in {company.currency}.
      </p>
      <form className={styles.priceForm} onSubmit={(event) => void handleSubmit(event)}>
        <label className={styles.priceField}>
          <span className={styles.priceLabel}>Price</span>
          <input
            className={styles.priceInput}
            name="price"
            inputMode="decimal"
            autoComplete="off"
            required
          />
        </label>
        <label className={styles.priceField}>
          <span className={styles.priceLabel}>As of</span>
          <input
            className={styles.priceInput}
            name="asOf"
            type="date"
            defaultValue={localToday()}
            required
          />
        </label>
        <button type="submit" className={buttons.secondaryAction}>
          Save
        </button>
      </form>
      {error === null ? null : (
        <p role="alert" className={styles.priceError}>
          {error}
        </p>
      )}
    </article>
  );
}

/**
 * The company dashboard (frontend spec §3): hero facts, then the twelve-card
 * grid. Insufficient cards are the door back into data entry, landing on the
 * first missing number. Sparklines, deltas and the red-flag section join with
 * the dashboard-depth slice.
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
  const hero = [company.sector, report.latestFy, company.currency]
    .filter((part): part is string => typeof part === 'string' && part !== '')
    .join(' · ');
  const priceIsStale =
    price !== null && Date.now() - Date.parse(price.asOf) > STALE_PRICE_MS;

  // Sparklines draw the labelled years that computed; they need at least two
  // (data-sufficiency policy), which Sparkline itself enforces.
  const sparkFor = (series: MetricSeries): SparkPoint[] =>
    report.fyLabels.flatMap((fy) => {
      const value = series.values[fy];
      return value !== undefined && value.status === 'ok' ? [{ fy, value: value.value }] : [];
    });

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
          <section className={styles.grid} aria-label="Metrics">
            {CARD_IDS.map((id) => {
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
                    footnote={valuation && price !== null ? `as of ${price.asOf}` : undefined}
                    stale={valuation && priceIsStale}
                  />
                </Link>
              );
            })}
          </section>

          {report.fyLabels.length === 1 ? (
            <p className={styles.trendHint}>Add more years to see trends.</p>
          ) : null}

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
        </>
      )}

      {metric === undefined ? null : (
        <MetricSheet metricId={metric} metrics={metrics} onClose={onMetricClose} />
      )}
    </>
  );
}
