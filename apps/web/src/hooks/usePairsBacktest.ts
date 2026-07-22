/**
 * The backtest read (integration plan §4, slice 4): the same query shape
 * as the scan kind, its own cache key, the shared token-and-envelope
 * path from pairsRead.
 */
import {
  pairsBacktestCollectionSchema,
  type PairsBacktestCollection
} from '@plainsight/api-contract';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { fetchPairsRead, type PairsRead } from './pairsRead';

export type PairsBacktestFetch = PairsRead<PairsBacktestCollection>;

export const PAIRS_BACKTEST_QUERY_KEY = ['pairsArtefacts', 'backtest'] as const;

export async function fetchPairsBacktest(
  fetchImpl: typeof fetch = fetch
): Promise<PairsBacktestFetch> {
  return fetchPairsRead(
    'backtest',
    (raw) => pairsBacktestCollectionSchema.parse(raw),
    fetchImpl
  );
}

export function usePairsBacktest(): UseQueryResult<PairsBacktestFetch> {
  return useQuery({
    queryKey: PAIRS_BACKTEST_QUERY_KEY,
    queryFn: () => fetchPairsBacktest(),
    staleTime: 5 * 60_000
  });
}
