/**
 * The API boundary (main plan §5: Zod validates every boundary, API included).
 * Same-origin /v1/* by design: CloudFront fronts the API on the app's own
 * origin, so the CSP connect-src stays 'self'. Everything here is an optional
 * enhancement; every failure maps to a typed result the import flow renders
 * as its known degraded state, and malformed payloads are indistinguishable
 * from outages, because unvalidated data must never reach storage.
 */
import {
  errorEnvelopeSchema,
  financialsResponseSchema,
  ingestingBodySchema,
  searchResponseSchema,
  type FinancialsResponse,
  type SearchResponse
} from '@plainsight/api-contract';

/** Dev override for pointing at a deployed API; production is same-origin. */
const apiOrigin = (): string =>
  (import.meta.env as Record<string, string | undefined>)['VITE_API_ORIGIN'] ?? '';

export type FinancialsFetch =
  | { kind: 'ok'; data: FinancialsResponse }
  | { kind: 'ingesting'; retryAfterSeconds: number }
  | { kind: 'unavailable'; message: string };

const OFFLINE_HINT = 'The import service is unreachable. You can enter the numbers manually.';

/**
 * Ticker search (backend spec §8). Throws on any failure: the query layer
 * owns retry and error state, and the sheet renders the standard hint.
 */
export async function searchTickers(q: string, signal?: AbortSignal): Promise<SearchResponse> {
  const response = await fetch(
    `${apiOrigin()}/v1/search?q=${encodeURIComponent(q)}`,
    signal === undefined ? {} : { signal }
  );
  if (!response.ok) throw new Error(`search failed: HTTP ${response.status}`);
  return searchResponseSchema.parse(await response.json());
}

/**
 * The financials read (backend spec §2): 200 with the standardised
 * statements, or 202 while a cold ticker ingests, or the typed degraded
 * state. Never throws.
 */
export async function fetchFinancials(ticker: string): Promise<FinancialsFetch> {
  let response: Response;
  try {
    response = await fetch(
      `${apiOrigin()}/v1/companies/${encodeURIComponent(ticker)}/financials?years=10`
    );
  } catch {
    return { kind: 'unavailable', message: OFFLINE_HINT };
  }

  if (response.status === 202) {
    const body = ingestingBodySchema.safeParse(await response.json().catch(() => null));
    return {
      kind: 'ingesting',
      retryAfterSeconds: body.success ? body.data.error.details[0].retryAfterSeconds : 5
    };
  }
  if (response.ok) {
    const body = financialsResponseSchema.safeParse(await response.json().catch(() => null));
    if (!body.success) {
      return { kind: 'unavailable', message: OFFLINE_HINT };
    }
    return { kind: 'ok', data: body.data };
  }

  const envelope = errorEnvelopeSchema.safeParse(await response.json().catch(() => null));
  return {
    kind: 'unavailable',
    message: envelope.success ? envelope.data.error.message : OFFLINE_HINT
  };
}
