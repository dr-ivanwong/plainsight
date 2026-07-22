import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useMemo, type ReactElement } from 'react';

import { BacktestScreen } from '../features/pairs/BacktestScreen';
import { buildLegIndex } from '../features/pairs/legs';
import { useCompanies } from '../hooks/useCompanies';
import { useLibraryReports } from '../hooks/useLibraryReports';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { usePairsBacktest } from '../hooks/usePairsBacktest';
import { backtestSearchSchema } from './-search';

// The backtest surface (integration plan §4, slice 4; frontend spec §1.1
// as amended 2026-07-22): the engine's train and holdout results per
// candidate pair, the windows visibly separate, the assumptions and the
// stated criteria beside the outcomes. `?pair=` focuses one pair.
export const Route = createFileRoute('/pairs/backtest')({
  validateSearch: backtestSearchSchema,
  component: BacktestRoute
});

function BacktestRoute(): ReactElement {
  const { pair } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const query = usePairsBacktest();
  const companies = useCompanies();
  const online = useOnlineStatus();

  const collection = query.data?.kind === 'ok' ? query.data.collection : undefined;

  const legCompanies = useMemo(() => {
    const tickers = new Set(
      (collection?.latest?.pairs ?? []).flatMap((row) => [row.ticker1, row.ticker2])
    );
    return (companies ?? []).filter(
      (company) =>
        company.exchange === 'ASX' &&
        company.ticker !== undefined &&
        tickers.has(company.ticker)
    );
  }, [companies, collection]);
  const legReports = useLibraryReports(legCompanies);
  const legs = useMemo(() => buildLegIndex(legReports ?? []), [legReports]);

  const status = ((): 'loading' | 'signed_out' | 'error' | 'ready' => {
    if (query.data?.kind === 'ok') return 'ready';
    if (query.data?.kind === 'signed_out') return 'signed_out';
    if (query.isError) return 'error';
    return 'loading';
  })();

  return (
    <BacktestScreen
      status={status}
      errorMessage={query.error instanceof Error ? query.error.message : undefined}
      onRetry={() => void query.refetch()}
      collection={collection}
      fetchedAt={query.dataUpdatedAt === 0 ? undefined : query.dataUpdatedAt}
      online={online}
      legs={legs}
      focusPair={pair}
      onFocusPair={(ticker1, ticker2) =>
        void navigate({
          search: { pair: `${ticker1}-${ticker2}` },
          replace: true
        })
      }
    />
  );
}
