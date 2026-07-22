/**
 * The pair-scan read (integration plan §4), ridden through TanStack
 * Query: cached-last within the session with the fetch stamp surfaced.
 * The shared token-and-envelope path lives in pairsRead.
 */
import {
  pairsArtefactCollectionSchema,
  type PairsArtefactCollection
} from '@plainsight/api-contract';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { fetchPairsRead, type PairsRead } from './pairsRead';

export type PairsFetch = PairsRead<PairsArtefactCollection>;

export const PAIRS_QUERY_KEY = ['pairsArtefacts', 'pair-scan'] as const;

export async function fetchPairsCollection(
  fetchImpl: typeof fetch = fetch
): Promise<PairsFetch> {
  return fetchPairsRead(
    'pair-scan',
    (raw) => pairsArtefactCollectionSchema.parse(raw),
    fetchImpl
  );
}

export function usePairsCollection(): UseQueryResult<PairsFetch> {
  return useQuery({
    queryKey: PAIRS_QUERY_KEY,
    queryFn: () => fetchPairsCollection(),
    staleTime: 5 * 60_000
  });
}
