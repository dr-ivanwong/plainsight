/**
 * The upload-job worker (backend spec §6): walks the honest stage labels the
 * review screen mirrors, preprocessing to extracting to validating, and
 * lands on review_required or failed. The server never writes an upload's
 * figures anywhere canonical; the result waits on the job for the reviewer,
 * and the confirmed data lands in the client's own library.
 */
import type { ExtractionAttempt } from '@plainsight/api-contract';
import {
  extractionProvenanceSchema,
  extractionResultSchema,
  EXTRACTION_PROMPT_VERSION,
  type LadderOutcome,
  type PreparedDocument
} from '@plainsight/extraction-core';
import type { PreprocessOutcome } from '@plainsight/extraction-core/pdf';
import type { JobStore } from '../db/jobStore.js';

export interface UploadJobDeps {
  jobs: JobStore;
  getObject(objectKey: string): Promise<Uint8Array>;
  preprocess(bytes: Uint8Array): Promise<PreprocessOutcome>;
  extract(document: PreparedDocument, confidential: boolean): Promise<LadderOutcome>;
  extractionEnabled(): Promise<boolean>;
}

export interface UploadJobOutcome {
  outcome: 'job_missing' | 'already_started' | 'disabled' | 'failed' | 'review_required';
  jobId: string;
}

const attemptsWire = (outcome: LadderOutcome): ExtractionAttempt[] =>
  outcome.attempts.map((attempt) => ({
    provider: attempt.rungId,
    model: attempt.model,
    promptVersion: EXTRACTION_PROMPT_VERSION,
    outcome: attempt.failure?.kind ?? 'extracted'
  }));

export async function runUploadJob(deps: UploadJobDeps, jobId: string): Promise<UploadJobOutcome> {
  const job = await deps.jobs.getJob(jobId);
  if (job === undefined) return { outcome: 'job_missing', jobId };
  // An async retry of the same invoke must not re-spend: only a queued job runs.
  if (job.state !== 'queued') return { outcome: 'already_started', jobId };

  const fail = async (
    detail: string,
    attempts: ExtractionAttempt[] = [],
    nextRung: string | null = null
  ): Promise<UploadJobOutcome> => {
    await deps.jobs.patchJob(jobId, {
      state: 'failed',
      attempts,
      failure: { detail, nextRung }
    });
    return { outcome: 'failed', jobId };
  };

  if (!(await deps.extractionEnabled())) {
    await fail('Extraction is disabled at the budget kill switch.');
    return { outcome: 'disabled', jobId };
  }

  await deps.jobs.patchJob(jobId, { state: 'preprocessing' });
  let bytes: Uint8Array;
  try {
    bytes = await deps.getObject(job.objectKey);
  } catch {
    return fail('The upload could not be read; it may have expired from the seven-day bucket.');
  }

  const prepared = await deps.preprocess(bytes);
  if (!prepared.ok) {
    return fail(`Preprocessing refused the document: ${prepared.reason}.`);
  }

  await deps.jobs.patchJob(jobId, { state: 'extracting' });
  const outcome = await deps.extract(prepared.document, job.confidential);
  const attempts = attemptsWire(outcome);
  if (!outcome.ok) {
    return fail(
      attempts.length === 0
        ? 'No provider rung was available: no key parameters are configured.'
        : 'Every available ladder rung failed; the attempts name each outcome.',
      attempts
    );
  }

  await deps.jobs.patchJob(jobId, { state: 'validating', attempts });
  const result = extractionResultSchema.safeParse(outcome.result);
  const provenance = extractionProvenanceSchema.safeParse(outcome.provenance);
  if (!result.success || !provenance.success) {
    return fail('The extraction answered outside the pinned schema.', attempts);
  }

  await deps.jobs.patchJob(jobId, {
    state: 'review_required',
    attempts,
    review: { result: result.data, provenance: provenance.data }
  });
  return { outcome: 'review_required', jobId };
}
