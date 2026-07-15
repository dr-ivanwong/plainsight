/**
 * The OpenAI-compatible adapter, covering most of the registry by protocol
 * (DeepSeek and Groq today; the plan lists the wider set). Text-only until a
 * vision rung registers on this protocol: the registered rungs are text
 * rungs, and flattenTextOnly makes a mis-routed image a loud bad_request
 * rather than a silent half-read.
 */
import { z } from 'zod';

import type { ExtractionProvider } from '../provider.js';
import type { RegistryEntry } from '../registry.js';
import { ProviderCallError, postJson } from './http.js';
import { flattenTextOnly, resolveConfig, type AdapterConfig } from './shared.js';

const responseSchema = z.object({
  choices: z.array(z.object({ message: z.object({ content: z.string().nullable() }) }))
});

export function openaiCompatibleProvider(
  entry: RegistryEntry,
  config: AdapterConfig = {}
): ExtractionProvider {
  const resolved = resolveConfig(config);
  return {
    entry,
    async extract(request, apiKey) {
      const documentText = flattenTextOnly(request.document, entry.label);
      const messages: { role: 'user' | 'assistant'; content: string }[] = [
        { role: 'user', content: `${request.prompt}\n\n${documentText}` }
      ];
      if (request.repair !== undefined) {
        messages.push(
          { role: 'assistant', content: request.repair.previousResponse },
          { role: 'user', content: request.repair.followUp }
        );
      }
      const body = await postJson({
        url: `${entry.baseUrl}/chat/completions`,
        headers: { authorization: `Bearer ${apiKey}` },
        body: { model: entry.model, max_tokens: resolved.maxOutputTokens, messages },
        timeoutMs: resolved.timeoutMs,
        fetchImpl: resolved.fetchImpl
      });
      const parsed = responseSchema.safeParse(body);
      if (!parsed.success) {
        throw new ProviderCallError('bad_response', 'unexpected OpenAI-compatible response shape');
      }
      const text = parsed.data.choices[0]?.message.content ?? '';
      if (text === '') {
        throw new ProviderCallError('bad_response', 'empty OpenAI-compatible response');
      }
      return text;
    }
  };
}
