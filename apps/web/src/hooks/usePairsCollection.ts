/**
 * The sleeve's read side (integration plan §4): one authenticated GET of
 * the pair scan collection, ridden through TanStack Query. Cached-last
 * within the session with the fetch stamp surfaced; the sleeve
 * deliberately skips Dexie, because this client authors nothing (the app
 * never trades and never writes sleeve data).
 */
import {
  errorEnvelopeSchema,
  pairsArtefactCollectionSchema,
  type PairsArtefactCollection
} from '@plainsight/api-contract';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { apiOrigin } from '../api/client';
import { getAccessToken } from '../auth/session';

export type PairsFetch =
  | { kind: 'ok'; collection: PairsArtefactCollection }
  /** Not an error: the sleeve simply requires the one seat to be signed in. */
  | { kind: 'signed_out' };

export const PAIRS_QUERY_KEY = ['pairsArtefacts', 'pair-scan'] as const;

export async function fetchPairsCollection(
  fetchImpl: typeof fetch = fetch
): Promise<PairsFetch> {
  const token = await getAccessToken();
  if (token.status === 'signed_out') return { kind: 'signed_out' };
  if (token.status === 'unavailable') {
    throw new Error('The session could not be refreshed; retry when back online.');
  }
  const response = await fetchImpl(`${apiOrigin()}/v1/pairs/artefacts/pair-scan`, {
    headers: { authorization: `Bearer ${token.accessToken}` }
  });
  if (!response.ok) {
    const envelope = errorEnvelopeSchema.safeParse(await response.json().catch(() => undefined));
    throw new Error(
      envelope.success
        ? envelope.data.error.message
        : `The sleeve read failed (${String(response.status)}).`
    );
  }
  return {
    kind: 'ok',
    collection: pairsArtefactCollectionSchema.parse(await response.json())
  };
}

export function usePairsCollection(): UseQueryResult<PairsFetch> {
  return useQuery({
    queryKey: PAIRS_QUERY_KEY,
    queryFn: () => fetchPairsCollection(),
    staleTime: 5 * 60_000
  });
}
