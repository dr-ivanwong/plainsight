import { describe, expect, it } from 'vitest';

import { ADAPTER_KINDS, REGISTRY, ladderFor } from '../src/index.js';

describe('the provider registry', () => {
  it('carries the owner-approved bake-off providers', () => {
    const bases = new Set(REGISTRY.map((entry) => new URL(entry.baseUrl).hostname));
    expect(bases).toEqual(
      new Set([
        'api.groq.com',
        'api.deepseek.com',
        'generativelanguage.googleapis.com',
        'api.anthropic.com'
      ])
    );
  });

  it('has unique rung ids and only the three adapters', () => {
    const ids = REGISTRY.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const entry of REGISTRY) {
      expect(ADAPTER_KINDS).toContain(entry.adapter);
    }
  });

  it('names an SSM parameter, never a key, on every rung', () => {
    for (const entry of REGISTRY) {
      expect(entry.credentialParameter).toMatch(/^\/app\/prod\/extraction\/[a-z-]+$/);
      // A key pasted where a parameter name belongs would not match the
      // parameter-name shape above; belt and braces, assert no key prefixes.
      expect(entry.credentialParameter).not.toMatch(/sk-|AIza|gsk_/);
    }
  });

  it('ladders cheap-first for the ordinary public filing', () => {
    const ladder = ladderFor({ needsVision: false, confidential: false });
    expect(ladder.map((entry) => entry.id)).toEqual([
      'groq-llama-3.3-70b',
      'deepseek-chat',
      'gemini-2.5-flash',
      'anthropic-haiku-4.5',
      'anthropic-sonnet-5'
    ]);
  });

  it('drops text-only rungs when the document needs vision', () => {
    const ladder = ladderFor({ needsVision: true, confidential: false });
    expect(ladder.every((entry) => entry.vision)).toBe(true);
    expect(ladder.map((entry) => entry.id)).toEqual([
      'gemini-2.5-flash',
      'anthropic-haiku-4.5',
      'anthropic-sonnet-5'
    ]);
  });

  it('routes confidential documents only to paid, no-training rungs', () => {
    const ladder = ladderFor({ needsVision: false, confidential: true });
    expect(ladder.length).toBeGreaterThan(0);
    for (const entry of ladder) {
      expect(entry.costTier).not.toBe('free');
      expect(entry.dataPolicy.trainsOnInputs).toBe(false);
    }
    expect(ladder.map((entry) => entry.id)).not.toContain('deepseek-chat');
  });

  it('always keeps a frontier escalation available', () => {
    for (const needsVision of [false, true]) {
      for (const confidential of [false, true]) {
        const ladder = ladderFor({ needsVision, confidential });
        expect(ladder.at(-1)?.costTier).toBe('frontier');
      }
    }
  });
});
