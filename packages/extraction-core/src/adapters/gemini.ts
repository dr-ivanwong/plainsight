/**
 * The native Gemini adapter: POST generateContent with the key in the
 * x-goog-api-key header, never in the URL (credentials never travel in URLs,
 * house privacy rule).
 */
import { z } from 'zod';

import type { ExtractionProvider, ExtractionRequest } from '../provider.js';
import type { RegistryEntry } from '../registry.js';
import { ProviderCallError, postJson } from './http.js';
import { sectionText, resolveConfig, type AdapterConfig } from './shared.js';

const responseSchema = z.object({
  candidates: z
    .array(
      z.object({
        content: z.object({ parts: z.array(z.object({ text: z.string().optional() })) }).optional()
      })
    )
    .optional()
});

type Part = { text: string } | { inline_data: { mime_type: 'image/png'; data: string } };

function userParts(request: ExtractionRequest): Part[] {
  const parts: Part[] = [{ text: request.prompt }];
  for (const section of request.document.sections) {
    const text = sectionText(section);
    if (text !== undefined) parts.push({ text });
    if (section.imagePngBase64 !== undefined) {
      parts.push({ inline_data: { mime_type: 'image/png', data: section.imagePngBase64 } });
    }
  }
  return parts;
}

export function geminiProvider(
  entry: RegistryEntry,
  config: AdapterConfig = {}
): ExtractionProvider {
  const resolved = resolveConfig(config);
  return {
    entry,
    async extract(request, apiKey) {
      const contents: { role: 'user' | 'model'; parts: Part[] }[] = [
        { role: 'user', parts: userParts(request) }
      ];
      if (request.repair !== undefined) {
        contents.push(
          { role: 'model', parts: [{ text: request.repair.previousResponse }] },
          { role: 'user', parts: [{ text: request.repair.followUp }] }
        );
      }
      const body = await postJson({
        url: `${entry.baseUrl}/v1beta/models/${entry.model}:generateContent`,
        headers: { 'x-goog-api-key': apiKey },
        body: { contents, generationConfig: { maxOutputTokens: resolved.maxOutputTokens } },
        timeoutMs: resolved.timeoutMs,
        fetchImpl: resolved.fetchImpl
      });
      const parsed = responseSchema.safeParse(body);
      if (!parsed.success) {
        throw new ProviderCallError('bad_response', 'unexpected Gemini response shape');
      }
      const text = (parsed.data.candidates?.[0]?.content?.parts ?? [])
        .map((part) => part.text ?? '')
        .join('');
      if (text === '') throw new ProviderCallError('bad_response', 'empty Gemini response');
      return text;
    }
  };
}
