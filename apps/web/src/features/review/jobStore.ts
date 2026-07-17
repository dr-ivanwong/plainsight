import type {
  AttemptRecord,
  ExtractionProvenance,
  ExtractionResult,
  LadderOutcome,
  PreparedDocument,
  RegistryEntry
} from '@plainsight/extraction-core';
import type { PreprocessOutcome } from '@plainsight/extraction-core/pdf';

/**
 * The client-direct extraction job store (frontend spec §6: an in-page job
 * runner, not a server poll). Jobs are ephemeral by design: they live in
 * memory for the tab's life, the URL carries only the id, and a reload with
 * a stale id degrades to the plain entry screen. Nothing lands in storage
 * until the review is accepted, so an abandoned job costs nothing.
 */

interface JobFacts {
  readonly id: string;
  readonly companyId: string;
  readonly fileName: string;
}

export type ExtractionJob =
  | (JobFacts & { readonly phase: 'reading' })
  | (JobFacts & { readonly phase: 'extracting'; readonly rung: string | null })
  | (JobFacts & {
      readonly phase: 'succeeded';
      readonly result: ExtractionResult;
      readonly provenance: ExtractionProvenance;
      readonly attempts: readonly AttemptRecord[];
      readonly pageCount: number;
    })
  | (JobFacts & {
      readonly phase: 'failed';
      readonly detail: string;
      readonly attempts: readonly AttemptRecord[];
      readonly nextRung: RegistryEntry | null;
    })
  | (JobFacts & {
      readonly phase: 'unreadable';
      readonly reason: 'scanned_document' | 'statements_not_found' | 'rasteriser_required';
    });

export interface JobDeps {
  preprocess(bytes: Uint8Array): Promise<PreprocessOutcome>;
  /** The keyed ladder, split into the chosen provider's rungs and the escalation tail behind them. */
  ladderPlan(needsVision: boolean): {
    chosen: readonly RegistryEntry[];
    remaining: readonly RegistryEntry[];
  };
  extract(
    document: PreparedDocument,
    ladder: readonly RegistryEntry[],
    onRung: (label: string) => void
  ): Promise<LadderOutcome>;
}

interface JobRuntime {
  readonly deps: JobDeps;
  document?: PreparedDocument;
  remaining: readonly RegistryEntry[];
  settled: Promise<void>;
}

const jobs = new Map<string, ExtractionJob>();
const runtimes = new Map<string, JobRuntime>();
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function set(job: ExtractionJob): void {
  jobs.set(job.id, job);
  emit();
}

export function subscribeJobs(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getJob(id: string): ExtractionJob | undefined {
  return jobs.get(id);
}

export function dismissJob(id: string): void {
  jobs.delete(id);
  runtimes.delete(id);
  runtimePageCount.delete(id);
  emit();
}

/** Resolves when the job reaches a terminal phase; the tests' clock. */
export function jobSettled(id: string): Promise<void> {
  return runtimes.get(id)?.settled ?? Promise.resolve();
}

/** The last attempt's failure, spoken plainly with its rung's label. */
function failureDetail(attempts: readonly AttemptRecord[], ladder: readonly RegistryEntry[]): string {
  const last = [...attempts].reverse().find((attempt) => attempt.failure !== undefined);
  if (last?.failure === undefined) return 'No usable model rung: no key covers this document.';
  const label = ladder.find((entry) => entry.id === last.rungId)?.label ?? last.model;
  return `${label}: ${last.failure.detail}`;
}

async function walk(
  id: string,
  facts: JobFacts,
  runtime: JobRuntime,
  document: PreparedDocument,
  ladder: readonly RegistryEntry[],
  remainingAfter: readonly RegistryEntry[]
): Promise<void> {
  set({ ...facts, phase: 'extracting', rung: null });
  const outcome = await runtime.deps.extract(document, ladder, (label) =>
    set({ ...facts, phase: 'extracting', rung: label })
  );
  if (outcome.ok) {
    const pageCount = runtimePageCount.get(id) ?? 0;
    set({
      ...facts,
      phase: 'succeeded',
      result: outcome.result,
      provenance: outcome.provenance,
      attempts: outcome.attempts,
      pageCount
    });
    return;
  }
  runtime.remaining = remainingAfter;
  set({
    ...facts,
    phase: 'failed',
    detail: failureDetail(outcome.attempts, ladder),
    attempts: outcome.attempts,
    nextRung: remainingAfter[0] ?? null
  });
}

const runtimePageCount = new Map<string, number>();

async function run(id: string, facts: JobFacts, bytes: Uint8Array, runtime: JobRuntime): Promise<void> {
  try {
    const pre = await runtime.deps.preprocess(bytes);
    if (!pre.ok) {
      set({ ...facts, phase: 'unreadable', reason: pre.reason });
      return;
    }
    runtime.document = pre.document;
    runtimePageCount.set(id, pre.pageCount);
    const plan = runtime.deps.ladderPlan(pre.needsVision);
    if (plan.chosen.length === 0 && plan.remaining.length === 0) {
      set({
        ...facts,
        phase: 'failed',
        detail: 'No usable model rung: no key covers this document.',
        attempts: [],
        nextRung: null
      });
      return;
    }
    if (plan.chosen.length === 0) {
      // The picked provider cannot carry this document (a text-only provider
      // met a scan); offer the tail as the retry rather than failing silent.
      runtime.remaining = plan.remaining;
      set({
        ...facts,
        phase: 'failed',
        detail: 'The picked provider has no rung that can read this document.',
        attempts: [],
        nextRung: plan.remaining[0] ?? null
      });
      return;
    }
    await walk(id, facts, runtime, pre.document, plan.chosen, plan.remaining);
  } catch (error) {
    set({
      ...facts,
      phase: 'failed',
      detail: String(error),
      attempts: [],
      nextRung: runtime.remaining[0] ?? null
    });
  }
}

export function startFilingJob(input: {
  companyId: string;
  fileName: string;
  bytes: Uint8Array;
  deps: JobDeps;
}): string {
  const id = crypto.randomUUID();
  const facts: JobFacts = { id, companyId: input.companyId, fileName: input.fileName };
  const runtime: JobRuntime = { deps: input.deps, remaining: [], settled: Promise.resolve() };
  runtimes.set(id, runtime);
  set({ ...facts, phase: 'reading' });
  runtime.settled = run(id, facts, input.bytes, runtime);
  return id;
}

/** Continue a failed job down the escalation tail; after this walk the tail is spent. */
export function retryJob(id: string): void {
  const job = jobs.get(id);
  const runtime = runtimes.get(id);
  if (job === undefined || runtime === undefined || job.phase !== 'failed') return;
  if (runtime.document === undefined || runtime.remaining.length === 0) return;
  const facts: JobFacts = { id, companyId: job.companyId, fileName: job.fileName };
  const ladder = runtime.remaining;
  runtime.settled = walk(id, facts, runtime, runtime.document, ladder, []);
}
