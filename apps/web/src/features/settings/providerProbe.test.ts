// The runtime CORS probe: the cheapest authenticated request per adapter
// kind, and the three-way outcome mapping. Any answer proves reachability;
// only an auth rejection reads as a failed key; a request that never
// arrives is the via-proxy case.
import { REGISTRY, type RegistryEntry } from '@plainsight/extraction-core';
import { describe, expect, it } from 'vitest';

import { probeRequest, runProbe } from './providerProbe';

const entryFor = (adapter: RegistryEntry['adapter']): RegistryEntry => {
  const entry = REGISTRY.find((candidate) => candidate.adapter === adapter);
  if (entry === undefined) throw new Error(`no registry entry for ${adapter}`);
  return entry;
};

describe('probeRequest', () => {
  it('asks Anthropic for its model list with the explicit browser-access header', () => {
    const request = probeRequest(entryFor('anthropic'), 'k');
    expect(request.url).toBe('https://api.anthropic.com/v1/models');
    expect(request.headers['x-api-key']).toBe('k');
    expect(request.headers['anthropic-dangerous-direct-browser-access']).toBe('true');
  });

  it('asks Gemini with its key header', () => {
    const request = probeRequest(entryFor('gemini'), 'k');
    expect(request.url).toBe('https://generativelanguage.googleapis.com/v1beta/models');
    expect(request.headers['x-goog-api-key']).toBe('k');
  });

  it('asks an OpenAI-compatible host with a bearer token', () => {
    const request = probeRequest(entryFor('openai-compatible'), 'k');
    expect(request.url).toMatch(/\/models$/);
    expect(request.headers.Authorization).toBe('Bearer k');
  });
});

describe('runProbe', () => {
  const entry = entryFor('anthropic');

  it('reads an ok answer as direct', async () => {
    expect(await runProbe(entry, 'k', async () => ({ ok: true, status: 200 }))).toBe('direct');
  });

  it('reads an auth rejection as a failed key', async () => {
    expect(await runProbe(entry, 'k', async () => ({ ok: false, status: 401 }))).toBe('failed');
    expect(await runProbe(entry, 'k', async () => ({ ok: false, status: 403 }))).toBe('failed');
  });

  it('reads any other answer as reachable', async () => {
    expect(await runProbe(entry, 'k', async () => ({ ok: false, status: 429 }))).toBe('direct');
  });

  it('reads a request that never arrived as the proxy case', async () => {
    expect(
      await runProbe(entry, 'k', async () => {
        throw new TypeError('Failed to fetch');
      })
    ).toBe('proxy');
  });
});
