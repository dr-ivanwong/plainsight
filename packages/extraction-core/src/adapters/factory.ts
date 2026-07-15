/** One interface, three adapters (main plan section 6): the dispatch. */
import type { ExtractionProvider } from '../provider.js';
import type { RegistryEntry } from '../registry.js';
import { anthropicProvider } from './anthropic.js';
import { geminiProvider } from './gemini.js';
import { openaiCompatibleProvider } from './openaiCompatible.js';
import type { AdapterConfig } from './shared.js';

export function providerFor(entry: RegistryEntry, config: AdapterConfig = {}): ExtractionProvider {
  switch (entry.adapter) {
    case 'anthropic':
      return anthropicProvider(entry, config);
    case 'gemini':
      return geminiProvider(entry, config);
    case 'openai-compatible':
      return openaiCompatibleProvider(entry, config);
  }
}
