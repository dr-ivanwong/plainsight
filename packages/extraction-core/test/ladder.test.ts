import { describe, expect, it } from 'vitest';

import {
  EXTRACTION_PROMPT_VERSION,
  ProviderCallError,
  REGISTRY,
  runExtraction,
  type ExtractionProvider,
  type ExtractionRequest,
  type PreparedDocument,
  type RegistryEntry
} from '../src/index.js';

const document: PreparedDocument = { sections: [{ page: 1, text: 'Revenue 100' }] };

const validResponse = JSON.stringify({
  years: [
    {
      fy: 'FY2025',
      endDate: '2025-06-30',
      currency: 'AUD',
      scale: 'millions',
      fields: { revenue: { value: 100, page: 1, confidence: 1 } }
    }
  ]
});

/** A scripted provider: each call shifts the next behaviour off the queue. */
function scripted(
  behaviours: Record<string, (string | ProviderCallError)[]>,
  calls: { rungId: string; repair: boolean }[]
) {
  return (entry: RegistryEntry): ExtractionProvider => ({
    entry,
    extract(request: ExtractionRequest) {
      calls.push({ rungId: entry.id, repair: request.repair !== undefined });
      const next = behaviours[entry.id]?.shift();
      if (next === undefined) throw new Error(`unscripted call to ${entry.id}`);
      if (next instanceof ProviderCallError) return Promise.reject(next);
      return Promise.resolve(next);
    }
  });
}

const ladder = REGISTRY;
const keys = () => 'key';

describe('the cheap-first ladder walk', () => {
  it('stops at the first rung that parses, with provenance and a clean attempt log', async () => {
    const calls: { rungId: string; repair: boolean }[] = [];
    const outcome = await runExtraction({
      document,
      ladder,
      credentialFor: keys,
      providerFactory: scripted({ 'groq-llama-3.3-70b': [validResponse] }, calls)
    });

    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.result.years[0]?.fy).toBe('FY2025');
      expect(outcome.provenance).toEqual({
        provider: 'groq-llama-3.3-70b',
        model: 'llama-3.3-70b-versatile',
        promptVersion: EXTRACTION_PROMPT_VERSION
      });
      expect(outcome.attempts).toEqual([
        { rungId: 'groq-llama-3.3-70b', model: 'llama-3.3-70b-versatile', repaired: false }
      ]);
    }
    expect(calls).toEqual([{ rungId: 'groq-llama-3.3-70b', repair: false }]);
  });

  it('repairs once on the same rung before escalating, and the retry can win', async () => {
    const calls: { rungId: string; repair: boolean }[] = [];
    const outcome = await runExtraction({
      document,
      ladder,
      credentialFor: keys,
      providerFactory: scripted(
        { 'groq-llama-3.3-70b': ['not json at all', validResponse] },
        calls
      )
    });

    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.attempts).toEqual([
        { rungId: 'groq-llama-3.3-70b', model: 'llama-3.3-70b-versatile', repaired: true }
      ]);
    }
    expect(calls).toEqual([
      { rungId: 'groq-llama-3.3-70b', repair: false },
      { rungId: 'groq-llama-3.3-70b', repair: true }
    ]);
  });

  it('escalates on rate limits, unparseable-after-repair, and missing keys, recording each', async () => {
    const calls: { rungId: string; repair: boolean }[] = [];
    const outcome = await runExtraction({
      document,
      ladder,
      credentialFor: (entry) => (entry.id === 'gemini-2.5-flash' ? undefined : 'key'),
      providerFactory: scripted(
        {
          'groq-llama-3.3-70b': [new ProviderCallError('rate_limited', 'HTTP 429', 429)],
          'deepseek-chat': ['prose', 'more prose'],
          'anthropic-haiku-4.5': [validResponse]
        },
        calls
      )
    });

    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.provenance.provider).toBe('anthropic-haiku-4.5');
      expect(outcome.attempts.map((attempt) => [attempt.rungId, attempt.failure?.kind])).toEqual([
        ['groq-llama-3.3-70b', 'rate_limited'],
        ['deepseek-chat', 'unparseable'],
        ['gemini-2.5-flash', 'no_credential'],
        ['anthropic-haiku-4.5', undefined]
      ]);
    }
  });

  it('a provider failure during the repair call escalates too', async () => {
    const outcome = await runExtraction({
      document,
      ladder: ladder.slice(0, 2),
      credentialFor: keys,
      providerFactory: scripted(
        {
          'groq-llama-3.3-70b': ['prose', new ProviderCallError('server', 'HTTP 500', 500)],
          'deepseek-chat': [validResponse]
        },
        []
      )
    });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.attempts[0]).toMatchObject({
        rungId: 'groq-llama-3.3-70b',
        repaired: true,
        failure: { kind: 'server' }
      });
    }
  });

  it('returns ok false with the full trail when every rung fails', async () => {
    const outcome = await runExtraction({
      document,
      ladder: ladder.slice(0, 2),
      credentialFor: keys,
      providerFactory: scripted(
        {
          'groq-llama-3.3-70b': [new ProviderCallError('timeout', 'no response')],
          'deepseek-chat': [new ProviderCallError('auth', 'HTTP 401', 401)]
        },
        []
      )
    });
    expect(outcome).toMatchObject({ ok: false });
    expect(outcome.attempts.map((attempt) => attempt.failure?.kind)).toEqual(['timeout', 'auth']);
  });

  it('uses the real three-adapter factory by default', async () => {
    const outcome = await runExtraction({
      document,
      ladder: ladder.slice(0, 1),
      credentialFor: keys,
      adapterConfig: {
        fetchImpl: () =>
          Promise.resolve(
            new Response(
              JSON.stringify({ choices: [{ message: { content: validResponse } }] }),
              { status: 200 }
            )
          )
      }
    });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.provenance.provider).toBe('groq-llama-3.3-70b');
  });

  it('lets a non-provider error propagate: bugs are not escalation', async () => {
    await expect(
      runExtraction({
        document,
        ladder: ladder.slice(0, 1),
        credentialFor: keys,
        providerFactory: (entry) => ({
          entry,
          extract() {
            throw new TypeError('undefined is not a function');
          }
        })
      })
    ).rejects.toThrow(TypeError);
  });
});
