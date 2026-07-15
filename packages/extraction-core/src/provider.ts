/**
 * The narrow provider interface (main plan section 6: one interface, three
 * adapters) and the response parser the adapters share. Adapters are dumb by
 * design: they move the prompt and the prepared document to a provider and
 * return raw text; parsing, validation, and the single repair retry live
 * here, once, provider-agnostic.
 */
import { extractionResultSchema, type ExtractionResult } from './schemas.js';
import type { RegistryEntry } from './registry.js';

/**
 * One section of a prepared document (the preprocessor's output): the text
 * layer where one exists, and a PNG page render for vision rungs. Text-only
 * rungs must only be routed sections that carry text.
 */
export interface PreparedSection {
  /** Printed page number, where the preprocessor could determine it. */
  readonly page?: number;
  readonly text?: string;
  readonly imagePngBase64?: string;
}

export interface PreparedDocument {
  readonly title?: string;
  readonly sections: readonly PreparedSection[];
}

export interface ExtractionRequest {
  readonly document: PreparedDocument;
  /** buildExtractionPrompt() output. */
  readonly prompt: string;
  /**
   * The single repair retry, as a continued conversation: the model's
   * previous answer and the buildRepairPrompt() follow-up. Adapters place
   * both verbatim; the ladder decides when.
   */
  readonly repair?: {
    readonly previousResponse: string;
    readonly followUp: string;
  };
}

/**
 * One registered rung, callable. The credential travels per call and is
 * never stored on the adapter: the same instance serves SSM-held keys in
 * Lambda and BYOK keys in the browser.
 */
export interface ExtractionProvider {
  readonly entry: RegistryEntry;
  extract(request: ExtractionRequest, apiKey: string): Promise<string>;
}

export type ParsedExtraction =
  | { readonly ok: true; readonly result: ExtractionResult }
  | { readonly ok: false; readonly problem: string };

/**
 * Parse a raw model response into the extraction contract. Tolerant of the
 * two failure shapes cheap models actually produce (prose around the JSON,
 * code fences) and strict about everything else; the returned problem string
 * is written to be fed straight into buildRepairPrompt.
 */
export function parseExtractionResponse(raw: string): ParsedExtraction {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end <= start) {
    return { ok: false, problem: 'the response contained no JSON object' };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.slice(start, end + 1));
  } catch (error) {
    // JSON.parse only throws SyntaxError, whose String() form carries the
    // position detail the repair retry can use.
    return { ok: false, problem: `the response was not valid JSON (${String(error)})` };
  }
  const checked = extractionResultSchema.safeParse(parsed);
  if (!checked.success) {
    // The brace slice above guarantees an object at the root, so every issue
    // path is non-empty.
    const issues = checked.error.issues
      .slice(0, 5)
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    return { ok: false, problem: `the JSON did not match the schema (${issues})` };
  }
  return { ok: true, result: checked.data };
}
