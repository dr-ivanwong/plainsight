/**
 * What all three adapters share: how a prepared document flattens into
 * message parts, and the config every adapter takes. Text sections carry
 * their printed page number inline so the model can cite pages in the
 * per-field provenance; images travel only to vision rungs.
 */
import type { PreparedDocument, PreparedSection } from '../provider.js';
import { ProviderCallError, type FetchLike } from './http.js';

export interface AdapterConfig {
  readonly fetchImpl?: FetchLike;
  readonly timeoutMs?: number;
  readonly maxOutputTokens?: number;
}

export interface ResolvedAdapterConfig {
  readonly fetchImpl: FetchLike;
  readonly timeoutMs: number;
  readonly maxOutputTokens: number;
}

export function resolveConfig(config: AdapterConfig): ResolvedAdapterConfig {
  return {
    fetchImpl: config.fetchImpl ?? ((input, init) => globalThis.fetch(input, init)),
    timeoutMs: config.timeoutMs ?? 120_000,
    maxOutputTokens: config.maxOutputTokens ?? 8_192
  };
}

/** A text section, prefixed with its printed page so citations are possible. */
export function sectionText(section: PreparedSection): string | undefined {
  if (section.text === undefined) return undefined;
  return section.page === undefined ? section.text : `[printed page ${section.page}]\n${section.text}`;
}

/**
 * Text-only rungs must never be routed image-only sections; that is a
 * routing bug (ladderFor filters on vision), surfaced as a bad_request so
 * the ladder escalates past the rung instead of extracting from silence.
 */
export function flattenTextOnly(document: PreparedDocument, rungLabel: string): string {
  const texts: string[] = [];
  for (const section of document.sections) {
    const text = sectionText(section);
    if (text === undefined) {
      throw new ProviderCallError(
        'bad_request',
        `${rungLabel} is text-only but a section carries no text layer`
      );
    }
    texts.push(text);
  }
  return texts.join('\n\n');
}
