import { describe, expect, it } from 'vitest';
import { proxyTargetFor, REGISTRY, type RegistryEntry } from '../src/index.js';

const entryOf = (id: string): RegistryEntry => {
  const entry = REGISTRY.find((candidate) => candidate.id === id);
  if (entry === undefined) throw new Error(`no registry entry ${id}`);
  return entry;
};

describe('the proxy view of the registry (backend spec section 7)', () => {
  it('anthropic rungs target /v1/messages with the key in x-api-key', () => {
    const target = proxyTargetFor(entryOf('anthropic-haiku-4.5'));
    expect(target.url).toBe('https://api.anthropic.com/v1/messages');
    expect(target.authHeaderName).toBe('x-api-key');
    expect(target.authHeaderValue('k-123')).toBe('k-123');
  });

  it('gemini rungs target the model generateContent URL with x-goog-api-key', () => {
    const target = proxyTargetFor(entryOf('gemini-2.5-flash'));
    expect(target.url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent'
    );
    expect(target.authHeaderName).toBe('x-goog-api-key');
    expect(target.authHeaderValue('k-123')).toBe('k-123');
  });

  it('openai-compatible rungs target /chat/completions with a bearer', () => {
    const target = proxyTargetFor(entryOf('groq-llama-3.3-70b'));
    expect(target.url).toBe('https://api.groq.com/openai/v1/chat/completions');
    expect(target.authHeaderName).toBe('authorization');
    expect(target.authHeaderValue('k-123')).toBe('Bearer k-123');
  });

  it('resolves a target for every registry entry, and never from request data', () => {
    for (const entry of REGISTRY) {
      const target = proxyTargetFor(entry);
      expect(target.url.startsWith(entry.baseUrl)).toBe(true);
      expect(target.authHeaderName.length).toBeGreaterThan(0);
    }
  });
});
