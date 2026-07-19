import {
  formatMetricValue,
  formatMoneyMinor,
  LINE_ITEMS,
  METRIC_IDS,
  METRICS,
  metricInputs,
  NOT_MEANINGFUL_PHRASES,
  type FyLabel,
  type LineItemId,
  type MetricId
} from '@plainsight/calc-engine';
import { useLiveQuery } from 'dexie-react-hooks';
import { lazy, Suspense, useState, type ReactElement } from 'react';

import { DeltaChip } from '../../components/DeltaChip';
import { formatEntryText, unitOf } from '../../components/moneyEntry';
import { SOURCE_WORD } from '../../components/provenanceWords';
import { SheetShell } from '../../components/SheetShell';
import { okPoints } from '../../components/Sparkline';
import { StatusValue } from '../../components/StatusValue';

// The chart library loads only when a sheet first opens; nothing else in the
// app pays for it.
const TrendChart = lazy(() =>
  import('../../components/TrendChart').then((module) => ({ default: module.TrendChart }))
);
import { db, type StatementRecord } from '../../db';
import type { CompanyMetrics } from '../../hooks/useMetrics';
import { useStatements } from '../../hooks/useStatements';
import { METRIC_COPY, REASON_EXPLAINERS } from './metricCopy';
import * as styles from './metricSheet.css';
import { deriveSheetFigures, replaceTokens } from './sheetDerivation';

const USES_PRICE: ReadonlySet<MetricId> = new Set(['pe', 'earningsYield', 'fcfYield']);

interface InputRow {
  id: string;
  label: string;
  text: string;
  source?: string;
  filingUrl?: string;
  derived: boolean;
}

/**
 * The metric detail sheet (frontend spec §3), addressed by `?metric=` so it
 * survives bookmarks and the system back gesture closes it. Top to bottom:
 * the ten-year chart with its table fallback, the pinned formula with this
 * year's actual figures substituted, every input with its value and
 * provenance (the by-hand reproducibility contract), the plain explanation,
 * and the Owner's lens while the education layer is on.
 */
export function MetricSheet({
  metricId,
  metrics,
  onClose
}: {
  metricId: MetricId;
  metrics: CompanyMetrics;
  onClose: () => void;
}): ReactElement | null {
  const { company, price, report } = metrics;
  const statements = useStatements(company.id);
  const educationRow = useLiveQuery(() => db.meta.get('educationLayerOff'), []);
  const [view, setView] = useState<'chart' | 'table'>('chart');

  if (statements === undefined) return null;

  const educationOff = educationRow?.value === true;
  const def = METRICS[metricId];
  const copy = METRIC_COPY[metricId];
  const series = report.metrics[metricId];
  const latest = series.latest;
  const latestFy = report.latestFy;
  const points = okPoints(series, report.fyLabels);
  const companions = METRIC_IDS.filter((id) => METRICS[id].detailHostId === metricId);

  const rowFor = (itemId: LineItemId, fy: FyLabel | null): StatementRecord | undefined =>
    statements.find((row) => row.fy === fy && row.statement === LINE_ITEMS[itemId].statement);

  const amountText = (itemId: LineItemId, amountMinor: number): string =>
    unitOf(itemId) === 'money'
      ? formatMoneyMinor(amountMinor, company.currency)
      : formatEntryText(amountMinor, { scale: 'ones', unit: 'count' });

  const resolvedAmount = (
    itemId: LineItemId,
    fy: FyLabel | null
  ): { minor: number; derived: boolean } | null => {
    const row = rowFor(itemId, fy);
    const entry = row?.values[itemId];
    if (entry?.kind === 'entered') return { minor: entry.amountMinor, derived: false };
    if (entry?.kind === 'not_reported_zero') return { minor: 0, derived: false };
    if (itemId === 'grossProfit') {
      // Derived from its siblings when the filing omits it (as-reported precedence).
      const revenue = row?.values.revenue;
      const cost = row?.values.costOfRevenue;
      if (revenue?.kind === 'entered' && cost !== undefined) {
        const costMinor = cost.kind === 'entered' ? cost.amountMinor : 0;
        return { minor: revenue.amountMinor - costMinor, derived: true };
      }
    }
    return null;
  };

  const inputRowFor = (itemId: LineItemId, fy: FyLabel | null, labelledYear: boolean): InputRow => {
    const row = rowFor(itemId, fy);
    const entry = row?.values[itemId];
    const resolved = resolvedAmount(itemId, fy);
    const text =
      entry?.kind === 'not_reported_zero'
        ? '∅0 (not reported)'
        : resolved !== null
          ? amountText(itemId, resolved.minor)
          : 'not entered';
    // The chip names the filing itself where one is recorded (the by-hand
    // reproducibility contract reaches the source document), and links out
    // when the filing carries a URL.
    const filing = row?.provenance.filing;
    return {
      id: labelledYear ? `${itemId}-${fy}` : itemId,
      label: labelledYear ? `${LINE_ITEMS[itemId].label}, ${fy}` : LINE_ITEMS[itemId].label,
      text,
      derived: resolved?.derived ?? false,
      ...(row === undefined
        ? {}
        : {
            source:
              filing === undefined
                ? SOURCE_WORD[row.provenance.source]
                : `${SOURCE_WORD[row.provenance.source]} ${filing.documentId}`
          }),
      ...(filing?.url === undefined ? {} : { filingUrl: filing.url })
    };
  };

  // The substituted equation and the derived figures come from one place, so
  // the sheet's arithmetic can never drift from the engine's (the averaged
  // denominator basis, data-model section 4).
  const derivation = deriveSheetFigures({
    metricId,
    latest,
    latestFy,
    currency: company.currency,
    resolve: (itemId, fy) => resolvedAmount(itemId, fy)?.minor ?? null,
    amountText,
    priceText: price === null ? null : formatMoneyMinor(price.amountMinor, price.currency)
  });

  const inputRows: InputRow[] = metricInputs(metricId).map((itemId) =>
    inputRowFor(itemId, latestFy, false)
  );
  if (USES_PRICE.has(metricId)) {
    inputRows.push({
      id: 'price',
      label: 'Share price',
      text:
        price === null
          ? 'not entered'
          : `${formatMoneyMinor(price.amountMinor, price.currency)} as of ${price.asOf}`,
      derived: false,
      ...(price === null ? {} : { source: 'entered by hand' })
    });
  }
  if (derivation.priorFy !== null) {
    for (const itemId of derivation.priorInputs) {
      inputRows.push(inputRowFor(itemId, derivation.priorFy, true));
    }
  }
  for (const figure of derivation.derivedRows) {
    inputRows.push({ id: figure.id, label: figure.label, text: figure.text, derived: true });
  }

  const humanisedFormula = derivation.humanisedFormula;
  const substituted = derivation.substituted;
  const inputsHeading =
    latestFy === null
      ? null
      : derivation.priorFy === null
        ? `This year, ${latestFy}`
        : `Inputs, ${derivation.priorFy} and ${latestFy}`;

  return (
    <SheetShell open onClose={onClose} label={def.label}>
      <div className={styles.sheet}>
        <header className={styles.head}>
          <h2 className={styles.title}>{def.label}</h2>
          <button type="button" className={styles.close} aria-label="Close" onClick={onClose}>
            ✕
          </button>
        </header>

        {latest === null ? null : (
          <div className={styles.valueRow}>
            <StatusValue value={latest} kind={def.format} currency={company.currency} />
            {latest.status === 'ok' && latest.basis !== undefined ? (
              <span className={styles.basisBadge}>{latest.basis} basis</span>
            ) : null}
            {series.delta === null ? null : (
              <DeltaChip
                delta={series.delta}
                kind={def.format}
                currency={company.currency}
                healthDirection={def.healthDirection}
              />
            )}
          </div>
        )}

        {latest !== null && latest.status === 'not_meaningful' ? (
          <p className={styles.explainer}>{REASON_EXPLAINERS[latest.reason]}</p>
        ) : null}

        {points.length >= 2 ? (
          <div className={styles.trend}>
            {view === 'chart' ? (
              <Suspense fallback={null}>
                <TrendChart points={points} kind={def.format} currency={company.currency} />
              </Suspense>
            ) : null}
            {view === 'table' ? (
              <table className={styles.table}>
                <tbody>
                  {report.fyLabels.map((fy) => {
                    const value = series.values[fy];
                    return (
                      <tr key={fy}>
                        <th scope="row" className={styles.tableYear}>
                          {fy}
                        </th>
                        <td className={styles.tableValue}>
                          {value === undefined
                            ? 'insufficient data'
                            : formatMetricValue(value, def.format, company.currency)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : null}
            <button
              type="button"
              className={styles.viewToggle}
              onClick={() => setView((current) => (current === 'chart' ? 'table' : 'chart'))}
            >
              {view === 'chart' ? 'Show table' : 'Show chart'}
            </button>
          </div>
        ) : null}

        <section className={styles.block} aria-label="Formula">
          <h3 className={styles.blockTitle}>Formula</h3>
          <p className={styles.formula}>{humanisedFormula}</p>
          {substituted === null ? null : <p className={styles.formula}>{substituted}</p>}
        </section>

        {inputsHeading === null ? null : (
          <section className={styles.block} aria-label={inputsHeading}>
            <h3 className={styles.blockTitle}>{inputsHeading}</h3>
            <ul className={styles.inputs}>
              {inputRows.map((row) => (
                <li key={row.id} className={styles.inputRow}>
                  <span className={styles.inputLabel}>
                    {row.label}
                    {row.derived ? ' (derived)' : ''}
                  </span>
                  <span className={styles.inputValue}>{row.text}</span>
                  {row.source === undefined ? null : row.filingUrl === undefined ? (
                    <span className={styles.sourceChip}>{row.source}</span>
                  ) : (
                    <a
                      className={styles.sourceLink}
                      href={row.filingUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {row.source}
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className={styles.block} aria-label="What it measures">
          <p className={styles.prose}>{copy.plain}</p>
        </section>

        {educationOff ? null : (
          <section className={styles.block} aria-label="Owner's lens">
            <h3 className={styles.blockTitle}>Owner&apos;s lens</h3>
            <p className={styles.prose}>{copy.ownersLens}</p>
          </section>
        )}

        {companions.map((companionId) => {
          const companion = METRICS[companionId];
          const companionLatest = report.metrics[companionId].latest;
          return (
            <section key={companionId} className={styles.companion} aria-label={companion.label}>
              <div className={styles.companionRow}>
                <span className={styles.companionLabel}>{companion.label}</span>
                <span className={styles.companionValue}>
                  {companionLatest === null
                    ? NOT_MEANINGFUL_PHRASES.no_price
                    : formatMetricValue(companionLatest, companion.format, company.currency)}
                </span>
              </div>
              <details className={styles.companionDetails}>
                <summary className={styles.companionSummary}>Formula</summary>
                <p className={styles.formula}>
                  {replaceTokens(companion.formula, (id) => LINE_ITEMS[id].label.toLowerCase())}
                </p>
              </details>
              <p className={styles.prose}>{METRIC_COPY[companionId].plain}</p>
            </section>
          );
        })}
      </div>
    </SheetShell>
  );
}
