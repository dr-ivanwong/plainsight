/**
 * The pair detail sheet: every statistic beside its inputs and meaning,
 * the tap-to-derivation discipline applied to the sleeve. What the sheet
 * shows is exactly what the artefact carries: the training window, the
 * criteria, the fitted numbers, and the gate-by-gate candidate verdict,
 * with the fundamentals join for both legs.
 */
import type { PairRow, PairScanReport } from '@plainsight/api-contract';
import { Link } from '@tanstack/react-router';
import type { ReactElement } from 'react';

import { SheetShell } from '../../components/SheetShell';
import { formatHalfLife, formatPValue, formatRatio } from './format';
import type { LegIndex, PairLeg } from './legs';
import * as styles from './pairSheet.css';

function findPair(report: PairScanReport, pairKey: string): PairRow | undefined {
  const [first, second] = pairKey.split('-');
  if (first === undefined || second === undefined) return undefined;
  return report.pairs.find(
    (row) =>
      (row.ticker1 === first && row.ticker2 === second) ||
      (row.ticker1 === second && row.ticker2 === first)
  );
}

function Gate({ label, met }: { label: string; met: boolean }): ReactElement {
  return (
    <li className={styles.gate}>
      <span className={met ? styles.gateMet : styles.gateUnmet}>{met ? 'met' : 'not met'}</span>
      <span>{label}</span>
    </li>
  );
}

function Statistic({
  label,
  value,
  meaning
}: {
  label: string;
  value: string;
  meaning: string;
}): ReactElement {
  return (
    <div className={styles.statistic}>
      <dt className={styles.statisticLabel}>{label}</dt>
      <dd className={styles.statisticValue}>{value}</dd>
      <dd className={styles.statisticMeaning}>{meaning}</dd>
    </div>
  );
}

function LegBlock({ ticker, leg }: { ticker: string; leg: PairLeg | undefined }): ReactElement {
  return (
    <div className={styles.leg}>
      <span className={styles.legTicker}>{ticker}</span>
      {leg === undefined ? (
        <span className={styles.legNote}>
          Not in the library; add it to see its statements beside the statistics.
        </span>
      ) : (
        <>
          <Link to="/company/$id" params={{ id: leg.companyId }} className={styles.legLink}>
            {leg.name}
          </Link>
          <span className={styles.legNote}>{leg.sectorLabel ?? 'Unclassified'}</span>
          <span className={leg.activeFlagCount > 0 ? styles.legFlags : styles.legNote}>
            {leg.activeFlagCount > 0
              ? `${String(leg.activeFlagCount)} ${leg.activeFlagCount === 1 ? 'flag' : 'flags'} to investigate`
              : 'No active flags'}
          </span>
        </>
      )}
    </div>
  );
}

export function PairSheet({
  report,
  pairKey,
  legs,
  onClose
}: {
  report: PairScanReport;
  pairKey: string;
  legs: LegIndex;
  onClose: () => void;
}): ReactElement | null {
  const row = findPair(report, pairKey);
  if (row === undefined) return null;
  const leg1 = legs.get(row.ticker1);
  const leg2 = legs.get(row.ticker2);
  const { criteria, window } = report;
  const halfLifeGate =
    row.halfLifeValid &&
    row.halfLifeDays !== null &&
    row.halfLifeDays <= criteria.maxCandidateHalfLifeDays;
  return (
    <SheetShell open onClose={onClose} label={`${row.ticker1} and ${row.ticker2}`}>
      <div className={styles.sheet}>
        <h2 className={styles.title}>
          {row.ticker1}–{row.ticker2}
        </h2>
        <p className={styles.provenance}>
          Fitted on the training window {window.start} to {window.splitDate} ({row.sharedTrainDays}{' '}
          shared days); the holdout after it stays untouched until validation. Run {report.runDate}
          , engine {report.engineVersion}.
        </p>

        <dl className={styles.statistics}>
          <Statistic
            label="Cointegration p-value"
            value={formatPValue(row.pValue)}
            meaning={`The chance of co-movement this tight if the pair were unrelated; the scan keeps pairs under ${String(criteria.maxPValue)}, and about one in twenty unrelated pairs clears that bar by luck.`}
          />
          <Statistic
            label="Hedge ratio"
            value={formatRatio(row.beta)}
            meaning={`Least squares of ${row.ticker1} on ${row.ticker2} over the training window (intercept ${formatRatio(row.intercept)}); the spread is ${row.ticker1} minus ${formatRatio(row.beta)} times ${row.ticker2}.`}
          />
          <Statistic
            label="Half-life"
            value={formatHalfLife(row.halfLifeDays)}
            meaning={`Days for the spread to revert halfway, from regressing its daily changes on its lagged level; the candidate band tops out at ${String(criteria.maxCandidateHalfLifeDays)} days${row.halfLifeValid ? '' : ', and this fit sits outside the validity band'}.`}
          />
          <Statistic
            label="Correlation"
            value={formatRatio(row.correlation)}
            meaning="How tightly the two price series move together; co-movement is not cointegration, which is why the test above carries the vote."
          />
        </dl>

        <h3 className={styles.verdict}>
          {row.candidate ? 'Candidate' : 'Not a candidate'}
        </h3>
        <ul className={styles.gates}>
          <Gate
            label={`Significance under ${String(criteria.maxPValue)}`}
            met={row.pValue < criteria.maxPValue}
          />
          <Gate
            label={`Half-life valid and inside ${String(criteria.maxCandidateHalfLifeDays)} days`}
            met={halfLifeGate}
          />
          <Gate label="Positive hedge ratio" met={row.beta > 0} />
        </ul>

        <h3 className={styles.legsTitle}>The businesses behind the spread</h3>
        <p className={styles.legsCaption}>
          A spread between two businesses is only as understandable as the businesses; the library
          is where that understanding lives.
        </p>
        <LegBlock ticker={row.ticker1} leg={leg1} />
        <LegBlock ticker={row.ticker2} leg={leg2} />
        {leg1 !== undefined && leg2 !== undefined ? (
          <Link
            to="/compare"
            search={{ ids: `${leg1.companyId},${leg2.companyId}` }}
            className={styles.compareLink}
          >
            Compare the two side by side
          </Link>
        ) : null}
      </div>
    </SheetShell>
  );
}
