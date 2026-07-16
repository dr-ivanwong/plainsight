import type { MetricId } from '@plainsight/calc-engine';

/**
 * The five metric groups the dashboard renders its cards under (dashboard
 * design plan §5.2). Grouping is presentation, not dictionary semantics, so
 * the map lives here rather than in the calc-engine. Flattened, the ids must
 * equal the dictionary's card metrics exactly, in dictionary order; the
 * dashboard test holds the map to that.
 */
export interface DashboardSection {
  readonly label: string;
  readonly ids: readonly MetricId[];
}

export const DASHBOARD_SECTIONS: readonly DashboardSection[] = [
  { label: 'Profitability', ids: ['grossMargin', 'operatingMargin', 'netMargin'] },
  { label: 'Returns', ids: ['roe', 'roic'] },
  { label: 'Safety', ids: ['debtToEquity', 'currentRatio', 'interestCoverage'] },
  { label: 'Cash', ids: ['fcf', 'fcfConversion'] },
  { label: 'Valuation', ids: ['pe', 'fcfYield'] }
];
