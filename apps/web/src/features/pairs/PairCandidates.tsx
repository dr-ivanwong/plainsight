/**
 * The candidate table: every pair that passed the scan's gates, its
 * statistics beside the fundamentals join. The owner qualifies or
 * declines a pair here without leaving the app: each leg links to its
 * dashboard, and a pair whose legs both live in the library links to
 * Compare.
 */
import type { PairScanReport } from '@plainsight/api-contract';
import { Link } from '@tanstack/react-router';
import type { ReactElement } from 'react';

import { formatHalfLife, formatPValue, formatRatio } from './format';
import type { LegIndex, PairLeg } from './legs';
import * as styles from './pairCandidates.css';

function LegCell({ ticker, leg }: { ticker: string; leg: PairLeg | undefined }): ReactElement {
  if (leg === undefined) {
    return (
      <td className={styles.legCell}>
        <span className={styles.legTicker}>{ticker}</span>
        <span className={styles.legNote}>Not in the library</span>
      </td>
    );
  }
  return (
    <td className={styles.legCell}>
      <Link to="/company/$id" params={{ id: leg.companyId }} className={styles.legLink}>
        {ticker}
      </Link>
      <span className={styles.legNote}>{leg.sectorLabel ?? 'Unclassified'}</span>
      {leg.activeFlagCount > 0 ? (
        <span className={styles.legFlags}>
          {leg.activeFlagCount} {leg.activeFlagCount === 1 ? 'flag' : 'flags'} to investigate
        </span>
      ) : (
        <span className={styles.legNote}>No active flags</span>
      )}
    </td>
  );
}

export function PairCandidates({
  report,
  legs,
  onOpenPair
}: {
  report: PairScanReport;
  legs: LegIndex;
  onOpenPair: (ticker1: string, ticker2: string) => void;
}): ReactElement {
  if (report.candidates.length === 0) {
    return <p className={styles.empty}>No pairs pass the candidate gates in this run.</p>;
  }
  const ordered = [...report.candidates].sort((a, b) => a.pValue - b.pValue);
  return (
    <div className={styles.scroller}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col" className={styles.textHead}>
              Pair
            </th>
            <th scope="col" className={styles.numericHead}>
              Hedge ratio
            </th>
            <th scope="col" className={styles.numericHead}>
              Half-life
            </th>
            <th scope="col" className={styles.numericHead}>
              p-value
            </th>
            <th scope="col" className={styles.numericHead}>
              Correlation
            </th>
            <th scope="col" className={styles.textHead}>
              First leg
            </th>
            <th scope="col" className={styles.textHead}>
              Second leg
            </th>
            <th scope="col" className={styles.textHead}>
              <span className={styles.legNote}>Side by side</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {ordered.map((candidate) => {
            const leg1 = legs.get(candidate.ticker1);
            const leg2 = legs.get(candidate.ticker2);
            return (
              <tr key={`${candidate.ticker1}-${candidate.ticker2}`}>
                <td className={styles.pairCell}>
                  <button
                    type="button"
                    className={styles.pairButton}
                    onClick={() => onOpenPair(candidate.ticker1, candidate.ticker2)}
                  >
                    {candidate.ticker1}–{candidate.ticker2}
                  </button>
                </td>
                <td className={styles.numericCell}>{formatRatio(candidate.beta)}</td>
                <td className={styles.numericCell}>{formatHalfLife(candidate.halfLifeDays)}</td>
                <td className={styles.numericCell}>{formatPValue(candidate.pValue)}</td>
                <td className={styles.numericCell}>{formatRatio(candidate.correlation)}</td>
                <LegCell ticker={candidate.ticker1} leg={leg1} />
                <LegCell ticker={candidate.ticker2} leg={leg2} />
                <td className={styles.legCell}>
                  {leg1 !== undefined && leg2 !== undefined ? (
                    <Link
                      to="/compare"
                      search={{ ids: `${leg1.companyId},${leg2.companyId}` }}
                      className={styles.legLink}
                    >
                      Compare
                    </Link>
                  ) : (
                    <span className={styles.legNote}>n/a</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
