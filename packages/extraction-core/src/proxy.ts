/**
 * The proxy view of the registry (backend spec section 7): for each rung, the
 * one upstream URL and the provider's auth-header convention. The server
 * proxy resolves both from here, so nothing about the destination ever comes
 * from a request; these facts mirror the adapters, which own them for the
 * client-direct path.
 */
import type { AdapterKind, RegistryEntry } from './registry.js';

export interface ProxyTarget {
  /** The exact upstream endpoint; the request contributes nothing to it. */
  readonly url: string;
  /** The header the provider reads its key from. */
  readonly authHeaderName: string;
  /** The header value carrying the caller's key, in the provider's scheme. */
  authHeaderValue(key: string): string;
}

const TARGETS: Readonly<Record<AdapterKind, (entry: RegistryEntry) => ProxyTarget>> = {
  anthropic: (entry) => ({
    url: `${entry.baseUrl}/v1/messages`,
    authHeaderName: 'x-api-key',
    authHeaderValue: (key) => key
  }),
  gemini: (entry) => ({
    url: `${entry.baseUrl}/v1beta/models/${entry.model}:generateContent`,
    authHeaderName: 'x-goog-api-key',
    authHeaderValue: (key) => key
  }),
  'openai-compatible': (entry) => ({
    url: `${entry.baseUrl}/chat/completions`,
    authHeaderName: 'authorization',
    authHeaderValue: (key) => `Bearer ${key}`
  })
};

export const proxyTargetFor = (entry: RegistryEntry): ProxyTarget =>
  TARGETS[entry.adapter](entry);
