/**
 * The native Anthropic adapter: POST /v1/messages, key in x-api-key, and the
 * explicit browser opt-in header Anthropic provides for exactly the BYOK
 * client-direct pattern (main plan section 6). The header is inert
 * server-side, so it is sent unconditionally rather than forked per runtime.
 */
import { z } from 'zod';

import type { ExtractionProvider, ExtractionRequest } from '../provider.js';
import type { RegistryEntry } from '../registry.js';
import { ProviderCallError, postJson } from './http.js';
import { sectionText, resolveConfig, type AdapterConfig } from './shared.js';

const responseSchema = z.object({
  content: z.array(z.object({ type: z.string(), text: z.string().optional() }))
});

type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'base64'; media_type: 'image/png'; data: string } };

function userParts(request: ExtractionRequest): ContentPart[] {
  const parts: ContentPart[] = [{ type: 'text', text: request.prompt }];
  for (const section of request.document.sections) {
    const text = sectionText(section);
    if (text !== undefined) parts.push({ type: 'text', text });
    if (section.imagePngBase64 !== undefined) {
      parts.push({
        type: 'image',
        source: { type: 'base64', media_type: 'image/png', data: section.imagePngBase64 }
      });
    }
  }
  return parts;
}

export function anthropicProvider(
  entry: RegistryEntry,
  config: AdapterConfig = {}
): ExtractionProvider {
  const resolved = resolveConfig(config);
  return {
    entry,
    async extract(request, apiKey) {
      const messages: { role: 'user' | 'assistant'; content: ContentPart[] | string }[] = [
        { role: 'user', content: userParts(request) }
      ];
      if (request.repair !== undefined) {
        messages.push(
          { role: 'assistant', content: request.repair.previousResponse },
          { role: 'user', content: request.repair.followUp }
        );
      }
      const body = await postJson({
        url: `${entry.baseUrl}/v1/messages`,
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: { model: entry.model, max_tokens: resolved.maxOutputTokens, messages },
        timeoutMs: resolved.timeoutMs,
        fetchImpl: resolved.fetchImpl
      });
      const parsed = responseSchema.safeParse(body);
      if (!parsed.success) {
        throw new ProviderCallError('bad_response', 'unexpected Anthropic response shape');
      }
      const text = parsed.data.content
        .filter((part) => part.type === 'text' && part.text !== undefined)
        .map((part) => part.text)
        .join('');
      if (text === '') throw new ProviderCallError('bad_response', 'empty Anthropic response');
      return text;
    }
  };
}
