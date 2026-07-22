/**
 * The fundamentals join (integration plan §4): candidates' legs matched
 * into the library so the research surface can show what the analyser
 * already knows about each business. Statistics select pairs; this index
 * is how fundamentals qualify them.
 */
import { SECTOR_LABELS } from '../../db/sectors';
import type { LibraryReportRow } from '../../hooks/useLibraryReports';

export interface PairLeg {
  companyId: string;
  name: string;
  sectorLabel: string | undefined;
  activeFlagCount: number;
}

export type LegIndex = ReadonlyMap<string, PairLeg>;

export function buildLegIndex(rows: readonly LibraryReportRow[]): LegIndex {
  const index = new Map<string, PairLeg>();
  for (const row of rows) {
    const ticker = row.company.ticker;
    if (ticker === undefined) continue;
    index.set(ticker, {
      companyId: row.company.id,
      name: row.company.name,
      sectorLabel: row.company.sector === undefined ? undefined : SECTOR_LABELS[row.company.sector],
      activeFlagCount: row.activeFlagCount
    });
  }
  return index;
}
