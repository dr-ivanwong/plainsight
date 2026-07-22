/**
 * The sleeve's shared read path (integration plan §4): one authenticated
 * GET per artefact kind, the same token dance and envelope handling for
 * every kind. The sleeve deliberately skips Dexie: this client authors
 * nothing (the app never trades and never writes sleeve data), so the
 * query cache is the whole requirement.
 */
import { errorEnvelopeSchema } from '@plainsight/api-contract';

import { apiOrigin } from '../api/client';
import { getAccessToken } from '../auth/session';

export type PairsRead<T> =
  | { kind: 'ok'; collection: T }
  /** Not an error: the sleeve simply requires the one seat to be signed in. */
  | { kind: 'signed_out' };

export async function fetchPairsRead<T>(
  kindSlug: string,
  parse: (raw: unknown) => T,
  fetchImpl: typeof fetch = fetch
): Promise<PairsRead<T>> {
  const token = await getAccessToken();
  if (token.status === 'signed_out') return { kind: 'signed_out' };
  if (token.status === 'unavailable') {
    throw new Error('The session could not be refreshed; retry when back online.');
  }
  const response = await fetchImpl(`${apiOrigin()}/v1/pairs/artefacts/${kindSlug}`, {
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
  return { kind: 'ok', collection: parse(await response.json()) };
}
