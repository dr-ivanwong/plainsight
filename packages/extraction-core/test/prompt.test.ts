import { LINE_ITEM_IDS } from '@plainsight/calc-engine';
import { describe, expect, it } from 'vitest';

import {
  EXTRACTION_PROMPT_VERSION,
  buildExtractionPrompt,
  buildRepairPrompt,
  parseExtractionResponse
} from '../src/index.js';

describe('the extraction prompt', () => {
  it('is the pinned version', () => {
    expect(EXTRACTION_PROMPT_VERSION).toBe('statements-1');
  });

  it('names every canonical line item with its entry hint', () => {
    const prompt = buildExtractionPrompt();
    for (const id of LINE_ITEM_IDS) {
      expect(prompt).toContain(`- ${id}: `);
    }
  });

  it('carries the corpus-proved reading rules', () => {
    const prompt = buildExtractionPrompt();
    expect(prompt).toContain('CONSOLIDATED');
    expect(prompt).toContain('notPrinted');
    expect(prompt).toContain('attributable to owners of the parent');
    expect(prompt).toContain('INCLUDES non-controlling interests');
    expect(prompt).toContain('exact number of shares');
    expect(prompt).toContain('ONLY this JSON object');
  });

  it('the repair prompt embeds the problem verbatim', () => {
    expect(buildRepairPrompt('the response contained no JSON object')).toContain(
      'the response contained no JSON object'
    );
  });
});

describe('parseExtractionResponse', () => {
  const validJson = JSON.stringify({
    years: [
      {
        fy: 'FY2025',
        endDate: '2025-06-30',
        currency: 'AUD',
        scale: 'millions',
        fields: { revenue: { value: 2343.1, page: 128, confidence: 1 } }
      }
    ]
  });

  it('parses clean JSON and JSON wrapped in fences or prose', () => {
    for (const raw of [
      validJson,
      `\`\`\`json\n${validJson}\n\`\`\``,
      `Here are the extracted statements:\n${validJson}\nLet me know if you need more.`
    ]) {
      const parsed = parseExtractionResponse(raw);
      expect(parsed.ok).toBe(true);
      if (parsed.ok) {
        expect(parsed.result.years[0]?.fields.revenue).toMatchObject({ value: 2343.1 });
      }
    }
  });

  it('reports a repairable problem for each failure shape', () => {
    const noJson = parseExtractionResponse('I could not find any financial statements.');
    expect(noJson).toEqual({ ok: false, problem: 'the response contained no JSON object' });

    const badJson = parseExtractionResponse('{"years": [}');
    expect(badJson.ok).toBe(false);
    if (!badJson.ok) expect(badJson.problem).toContain('not valid JSON');

    const badSchema = parseExtractionResponse('{"years": []}');
    expect(badSchema.ok).toBe(false);
    if (!badSchema.ok) {
      expect(badSchema.problem).toContain('did not match the schema');
      expect(badSchema.problem).toContain('years');
    }
  });
});
