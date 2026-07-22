/**
 * The correlation-and-cointegration matrix: the whole scanned universe as
 * a shaded grid, one cell per pair, both measures a toggle apart. The
 * grid is a visual summary and deliberately hidden from assistive
 * technology; the candidate table and the pair sheet carry the same
 * statistics accessibly (the screen says so beside the toggle).
 */
import type { PairRow, PairScanReport } from '@plainsight/api-contract';
import { useMemo, type CSSProperties, type ReactElement } from 'react';

import { colour } from '../../styles/tokens.css';
import { formatPValue, formatRatio } from './format';
import type { PairsView } from './PairsScreen';
import * as styles from './pairsMatrix.css';

function pairKeyOf(ticker1: string, ticker2: string): string {
  return ticker1 < ticker2 ? `${ticker1}|${ticker2}` : `${ticker2}|${ticker1}`;
}

function cellStyle(row: PairRow, view: PairsView): CSSProperties {
  if (view === 'correlation') {
    const strength = Math.round(Math.min(Math.abs(row.correlation), 1) * 90);
    const base = row.correlation >= 0 ? colour.accent : colour.textSecondary;
    return { backgroundColor: `color-mix(in srgb, ${base} ${String(strength)}%, transparent)` };
  }
  const strength = row.pValue < 0.01 ? 85 : row.pValue < 0.05 ? 45 : 8;
  return {
    backgroundColor: `color-mix(in srgb, ${colour.accent} ${String(strength)}%, transparent)`
  };
}

export function PairsMatrix({
  report,
  view,
  onOpenPair
}: {
  report: PairScanReport;
  view: PairsView;
  onOpenPair: (ticker1: string, ticker2: string) => void;
}): ReactElement {
  const index = useMemo(() => {
    const map = new Map<string, PairRow>();
    for (const row of report.pairs) {
      map.set(pairKeyOf(row.ticker1, row.ticker2), row);
    }
    return map;
  }, [report]);
  const universe = report.universe;
  return (
    <div className={styles.scroller} aria-hidden="true">
      <table className={styles.table}>
        <thead>
          <tr>
            <th className={styles.cornerCell} />
            {universe.map((ticker) => (
              <th key={ticker} className={styles.columnHead}>
                <span className={styles.columnLabel}>{ticker}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {universe.map((rowTicker) => (
            <tr key={rowTicker}>
              <th className={styles.rowHead}>{rowTicker}</th>
              {universe.map((columnTicker) => {
                if (rowTicker === columnTicker) {
                  return <td key={columnTicker} className={styles.diagonalCell} />;
                }
                const row = index.get(pairKeyOf(rowTicker, columnTicker));
                if (row === undefined) {
                  return (
                    <td
                      key={columnTicker}
                      className={styles.emptyCell}
                      title={`${rowTicker} and ${columnTicker}: insufficient shared history`}
                    />
                  );
                }
                const summary = `${rowTicker} and ${columnTicker}: correlation ${formatRatio(row.correlation)}, cointegration p ${formatPValue(row.pValue)}`;
                return (
                  <td key={columnTicker} className={styles.cell}>
                    <button
                      type="button"
                      tabIndex={-1}
                      className={styles.cellButton}
                      style={cellStyle(row, view)}
                      title={summary}
                      onClick={() => onOpenPair(row.ticker1, row.ticker2)}
                    />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
