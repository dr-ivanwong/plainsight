// The provider grouping: registry rungs sharing a credential collapse into
// one key-owning row, with the pinned data-policy words and the provisional
// cheapest-first ladder.
import { describe, expect, it } from 'vitest';

import { keyedProviders, provisionalLadder } from './providers';

describe('keyedProviders', () => {
  it('groups the registry into the four key-owning providers, in registry order', () => {
    expect(keyedProviders().map((provider) => provider.id)).toEqual([
      'groq',
      'deepseek',
      'gemini',
      'anthropic'
    ]);
  });

  it('folds rungs sharing a credential into one provider', () => {
    const anthropic = keyedProviders().find((provider) => provider.id === 'anthropic');
    expect(anthropic?.rungs.map((rung) => rung.model)).toEqual([
      'claude-haiku-4-5-20251001',
      'claude-sonnet-5'
    ]);
  });

  it('speaks each policy in the pinned plain words', () => {
    const byId = new Map(keyedProviders().map((provider) => [provider.id, provider.policyWords]));
    expect(byId.get('deepseek')).toBe('May train on inputs; public documents only.');
    expect(byId.get('anthropic')).toBe('No-training endpoint.');
  });
});

describe('provisionalLadder', () => {
  it('walks cheapest first, frontier last', () => {
    const ladder = provisionalLadder();
    expect(ladder[0]).toBe('Groq Llama 3.3 70B');
    expect(ladder.at(-1)).toBe('Claude Sonnet 5');
    expect(ladder).toHaveLength(5);
  });
});
