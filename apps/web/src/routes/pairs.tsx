import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect, useMemo, type ReactElement } from 'react';

import { db } from '../db';
import { setMeta } from '../db/meta';
import { PairsScreen, type PairsView } from '../features/pairs/PairsScreen';
import { buildLegIndex } from '../features/pairs/legs';
import { useCompanies } from '../hooks/useCompanies';
import { useLibraryReports } from '../hooks/useLibraryReports';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { usePairsCollection } from '../hooks/usePairsCollection';
import { pairsSearchSchema } from './-search';

// The pairs research surface (integration plan §4; frontend spec §1.1 as
// amended 2026-07-22): the matrix and candidate table over the latest
// published scan, with the fundamentals join into the library. The pair
// sheet encodes in `?pair=`, the matrix measure in `?view=`.
export const Route = createFileRoute('/pairs')({
  validateSearch: pairsSearchSchema,
  component: PairsRoute
});

function PairsRoute(): ReactElement {
  const { pair, view } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const query = usePairsCollection();
  const companies = useCompanies();
  const online = useOnlineStatus();

  const collection = query.data?.kind === 'ok' ? query.data.collection : undefined;

  // The rail's progressive gate (frontend spec §1.2): the device remembers
  // whether the sleeve has artefacts, so Pairs survives a reload without a
  // launch-time fetch. Kept current on every successful read, both ways.
  useEffect(() => {
    if (query.data === undefined || query.data.kind !== 'ok') return;
    void setMeta(db, 'pairsSeen', query.data.collection.history.length > 0);
  }, [query.data]);

  // The fundamentals join: candidates' legs matched into the library by
  // bare ASX code (the engine's universe and the company records share the
  // convention: bare ticker plus the exchange field).
  const legCompanies = useMemo(() => {
    const universe = new Set(collection?.latest?.universe ?? []);
    return (companies ?? []).filter(
      (company) =>
        company.exchange === 'ASX' &&
        company.ticker !== undefined &&
        universe.has(company.ticker)
    );
  }, [companies, collection]);
  const legReports = useLibraryReports(legCompanies);
  const legs = useMemo(() => buildLegIndex(legReports ?? []), [legReports]);

  const activeView: PairsView = view ?? 'correlation';

  const status = ((): 'loading' | 'signed_out' | 'error' | 'ready' => {
    if (query.data?.kind === 'ok') return 'ready';
    if (query.data?.kind === 'signed_out') return 'signed_out';
    if (query.isError) return 'error';
    return 'loading';
  })();

  return (
    <PairsScreen
      status={status}
      errorMessage={query.error instanceof Error ? query.error.message : undefined}
      onRetry={() => void query.refetch()}
      collection={collection}
      fetchedAt={query.dataUpdatedAt === 0 ? undefined : query.dataUpdatedAt}
      online={online}
      legs={legs}
      view={activeView}
      onViewChange={(next) =>
        void navigate({ search: (previous) => ({ ...previous, view: next }), replace: true })
      }
      openPair={pair}
      onOpenPair={(ticker1, ticker2) =>
        void navigate({
          search: (previous) => ({ ...previous, pair: `${ticker1}-${ticker2}` })
        })
      }
      onClosePair={() =>
        void navigate({
          search: (previous) => ({ ...previous, pair: undefined }),
          replace: true
        })
      }
    />
  );
}
