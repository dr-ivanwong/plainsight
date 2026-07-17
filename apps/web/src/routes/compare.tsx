import type { MetricId } from '@plainsight/calc-engine';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useMemo, type ReactElement } from 'react';

import { CompareScreen } from '../features/compare/CompareScreen';
import { DEFAULT_TREND_METRIC, trendOptions } from '../features/compare/CompareTrend';
import { useCompanies } from '../hooks/useCompanies';
import { MAX_COMPARE, useComparison } from '../hooks/useComparison';
import { compareSearchSchema } from './-search';

// The compare screen (frontend spec §1.1); the 2–4 company selection encodes
// in `?ids=a,b,c` and the trend measure in `?metric=`, so a comparison is
// bookmarkable and relaunch-safe.
export const Route = createFileRoute('/compare')({
  validateSearch: compareSearchSchema,
  component: CompareRoute
});

function CompareRoute(): ReactElement | null {
  const { ids, metric } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const companies = useCompanies();

  // The address is a wish list; the library is the truth. Duplicates, unknown
  // ids and overflow drop quietly, so a stale bookmark degrades to the picker.
  const selectedIds = useMemo(() => {
    if (companies === undefined) return [];
    const known = new Set(companies.map((company) => company.id));
    const parsed = (ids ?? '')
      .split(',')
      .map((id) => id.trim())
      .filter((id) => id !== '');
    return [...new Set(parsed)].filter((id) => known.has(id)).slice(0, MAX_COMPARE);
  }, [ids, companies]);

  const comparison = useComparison(selectedIds);

  // First render only, while the live query attaches (frontend spec §3).
  if (companies === undefined) return null;

  const onToggle = (id: string): void => {
    const next = selectedIds.includes(id)
      ? selectedIds.filter((selected) => selected !== id)
      : [...selectedIds, id];
    void navigate({
      search: (previous) => ({ ...previous, ids: next.length === 0 ? undefined : next.join(',') }),
      replace: true
    });
  };

  const onTrendMetricChange = (next: MetricId): void => {
    void navigate({ search: (previous) => ({ ...previous, metric: next }), replace: true });
  };

  // A measure the trend cannot show (a hidden money row in a mixed-currency
  // comparison, or a stale bookmark) degrades to the default, never an error.
  const requested = metric ?? DEFAULT_TREND_METRIC;
  const trendMetric =
    comparison !== undefined && trendOptions(comparison.mixedCurrencies).includes(requested)
      ? requested
      : DEFAULT_TREND_METRIC;

  return (
    <CompareScreen
      companies={companies}
      selectedIds={selectedIds}
      comparison={comparison}
      onToggle={onToggle}
      trendMetric={trendMetric}
      onTrendMetricChange={onTrendMetricChange}
    />
  );
}
