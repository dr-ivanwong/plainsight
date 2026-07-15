/**
 * The cheap-first escalation walk (main plan section 6): try each rung in
 * ladder order; a provider failure, a missing credential, or output that
 * stays unparseable after the single repair retry escalates to the next
 * rung. Every attempt is recorded so the scorecard, the review queue, and
 * the job trail can say exactly what was tried; the validation gates
 * downstream remain the safety, this walk only spends money well.
 */
import { providerFor } from './adapters/factory.js';
import { ProviderCallError, type ProviderFailureKind } from './adapters/http.js';
import type { AdapterConfig } from './adapters/shared.js';
import { EXTRACTION_PROMPT_VERSION, buildExtractionPrompt, buildRepairPrompt } from './prompt.js';
import { parseExtractionResponse, type ExtractionProvider, type PreparedDocument } from './provider.js';
import type { RegistryEntry } from './registry.js';
import type { ExtractionProvenance, ExtractionResult } from './schemas.js';

export type AttemptFailureKind = ProviderFailureKind | 'unparseable' | 'no_credential';

export interface AttemptRecord {
  readonly rungId: string;
  readonly model: string;
  /** True when the rung got its repair retry before failing or succeeding. */
  readonly repaired: boolean;
  readonly failure?: { readonly kind: AttemptFailureKind; readonly detail: string };
}

export type LadderOutcome =
  | {
      readonly ok: true;
      readonly result: ExtractionResult;
      readonly provenance: ExtractionProvenance;
      readonly attempts: readonly AttemptRecord[];
    }
  | { readonly ok: false; readonly attempts: readonly AttemptRecord[] };

export interface RunExtractionOptions {
  readonly document: PreparedDocument;
  /** ladderFor(...) output, or the bake-off's pinned order once it exists. */
  readonly ladder: readonly RegistryEntry[];
  /**
   * Key lookup per rung: SSM-backed in Lambda, the device-local BYOK table
   * in the browser. Returning undefined skips the rung (no key configured).
   */
  readonly credentialFor: (
    entry: RegistryEntry
  ) => Promise<string | undefined> | string | undefined;
  readonly adapterConfig?: AdapterConfig;
  /** Test seam; defaults to the real three-adapter factory. */
  readonly providerFactory?: (entry: RegistryEntry, config: AdapterConfig) => ExtractionProvider;
}

export async function runExtraction(options: RunExtractionOptions): Promise<LadderOutcome> {
  const factory = options.providerFactory ?? providerFor;
  const prompt = buildExtractionPrompt();
  const attempts: AttemptRecord[] = [];

  for (const entry of options.ladder) {
    const apiKey = await options.credentialFor(entry);
    if (apiKey === undefined) {
      attempts.push({
        rungId: entry.id,
        model: entry.model,
        repaired: false,
        failure: { kind: 'no_credential', detail: 'no key configured for this rung' }
      });
      continue;
    }

    const provider = factory(entry, options.adapterConfig ?? {});
    let repaired = false;
    try {
      let raw = await provider.extract({ document: options.document, prompt }, apiKey);
      let parsed = parseExtractionResponse(raw);
      if (!parsed.ok) {
        repaired = true;
        raw = await provider.extract(
          {
            document: options.document,
            prompt,
            repair: { previousResponse: raw, followUp: buildRepairPrompt(parsed.problem) }
          },
          apiKey
        );
        parsed = parseExtractionResponse(raw);
      }
      if (!parsed.ok) {
        attempts.push({
          rungId: entry.id,
          model: entry.model,
          repaired,
          failure: { kind: 'unparseable', detail: parsed.problem }
        });
        continue;
      }
      attempts.push({ rungId: entry.id, model: entry.model, repaired });
      return {
        ok: true,
        result: parsed.result,
        provenance: {
          provider: entry.id,
          model: entry.model,
          promptVersion: EXTRACTION_PROMPT_VERSION
        },
        attempts
      };
    } catch (error) {
      // Provider failures escalate; anything else is a bug and propagates.
      if (!(error instanceof ProviderCallError)) throw error;
      attempts.push({
        rungId: entry.id,
        model: entry.model,
        repaired,
        failure: { kind: error.kind, detail: error.message }
      });
    }
  }

  return { ok: false, attempts };
}
