/**
 * Cached SSM parameter reads. The EDGAR contact address is configuration that
 * must never be hardcoded in the repository (SEC fair-access requirement,
 * backend spec §9), so it lives in a plain SSM parameter created out-of-band
 * and referenced by name, the same pattern as the pipeline's provider keys
 * (cdk spec §1.4) and the runtime feature flags.
 */
import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';

const CACHE_TTL_MS = 60 * 60 * 1000;

interface CacheEntry {
  value: string;
  fetchedAt: number;
}

const cache = new Map<string, CacheEntry>();
let client: SSMClient | undefined;

export async function getCachedParameter(
  name: string,
  now: () => number = Date.now,
  ttlMs: number = CACHE_TTL_MS
): Promise<string> {
  const hit = cache.get(name);
  if (hit !== undefined && now() - hit.fetchedAt < ttlMs) return hit.value;
  client ??= new SSMClient({});
  const result = await client.send(new GetParameterCommand({ Name: name }));
  const value = result.Parameter?.Value;
  if (value === undefined || value === '') {
    throw new Error(`SSM parameter ${name} is missing or empty`);
  }
  cache.set(name, { value, fetchedAt: now() });
  return value;
}

/** Test seam: the module cache is per-container state. */
export function clearParameterCache(): void {
  cache.clear();
}
