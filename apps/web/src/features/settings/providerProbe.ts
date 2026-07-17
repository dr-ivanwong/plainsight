import type { RegistryEntry } from '@plainsight/extraction-core';

/**
 * The runtime CORS probe behind each row's Test button (frontend spec §3):
 * the cheapest authenticated request each provider offers (a model listing;
 * no tokens spent), made from the browser with the stored key.
 *
 * - 'direct': the browser reached the provider and the key was accepted;
 *   client-direct extraction works here.
 * - 'proxy': the request never got through (CORS or network); this provider
 *   needs the authenticated server proxy when it arrives.
 * - 'failed': the provider answered and turned the key away.
 */
export type ProbeResult = 'direct' | 'proxy' | 'failed';

export interface ProbeRequest {
  url: string;
  headers: Record<string, string>;
}

/** Anthropic's browser CORS support is explicit opt-in via this header. */
export function probeRequest(entry: RegistryEntry, key: string): ProbeRequest {
  if (entry.adapter === 'anthropic') {
    return {
      url: `${entry.baseUrl}/v1/models`,
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      }
    };
  }
  if (entry.adapter === 'gemini') {
    return {
      url: `${entry.baseUrl}/v1beta/models`,
      headers: { 'x-goog-api-key': key }
    };
  }
  return {
    url: `${entry.baseUrl}/models`,
    headers: { Authorization: `Bearer ${key}` }
  };
}

type FetchLike = (url: string, init: { headers: Record<string, string> }) => Promise<{
  ok: boolean;
  status: number;
}>;

/**
 * One probe, outcome-mapped. Any response proves the browser can reach the
 * provider; only an auth rejection reads as a failed key. A thrown fetch is
 * the CORS-or-network case: the request never arrived.
 */
export async function runProbe(
  entry: RegistryEntry,
  key: string,
  fetchLike: FetchLike = fetch
): Promise<ProbeResult> {
  const request = probeRequest(entry, key);
  try {
    const response = await fetchLike(request.url, { headers: request.headers });
    if (response.ok) return 'direct';
    return response.status === 401 || response.status === 403 ? 'failed' : 'direct';
  } catch {
    return 'proxy';
  }
}
