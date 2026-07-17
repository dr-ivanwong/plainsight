// The in-page extraction job: phases in order, the typed refusals in place,
// the plainly-spoken failure with the next rung offered, and the retry that
// walks the remaining tail exactly once.
import { REGISTRY, type LadderOutcome, type RegistryEntry } from '@plainsight/extraction-core';
import { describe, expect, it } from 'vitest';

import {
  dismissJob,
  getJob,
  jobSettled,
  retryJob,
  startFilingJob,
  type JobDeps
} from './jobStore';

const bytes = new Uint8Array([1]);
const rung = (id: string): RegistryEntry => {
  const entry = REGISTRY.find((candidate) => candidate.id === id);
  if (entry === undefined) throw new Error(`no rung ${id}`);
  return entry;
};

const document = { sections: [{ text: 'REVENUE 100' }] };
const okPreprocess: JobDeps['preprocess'] = async () => ({
  ok: true,
  document,
  needsVision: false,
  window: { from: 1, to: 2 },
  pageCount: 12
});

const success: LadderOutcome = {
  ok: true,
  result: { years: [{ fy: 'FY2024', endDate: '2024-06-30', currency: 'AUD', fields: {} }] } as never,
  provenance: { provider: 'anthropic-haiku-4.5', model: 'm', promptVersion: 'v' },
  attempts: [{ rungId: 'anthropic-haiku-4.5', model: 'm', repaired: false }]
};

describe('the extraction job store', () => {
  it('walks reading, extracting, succeeded, with the rung named live', async () => {
    const seen: string[] = [];
    const id = startFilingJob({
      companyId: 'c',
      fileName: 'AR2024.pdf',
      bytes,
      deps: {
        preprocess: okPreprocess,
        ladderPlan: () => ({ chosen: [rung('anthropic-haiku-4.5')], remaining: [] }),
        extract: async (_doc, _ladder, onRung) => {
          seen.push(getJob(id)?.phase ?? 'missing');
          onRung('Claude Haiku 4.5');
          const state = getJob(id);
          if (state?.phase === 'extracting') seen.push(state.rung ?? 'null');
          return success;
        }
      }
    });
    expect(getJob(id)?.phase).toBe('reading');
    await jobSettled(id);

    const settled = getJob(id);
    expect(settled?.phase).toBe('succeeded');
    if (settled?.phase === 'succeeded') {
      expect(settled.result.years).toHaveLength(1);
      expect(settled.pageCount).toBe(12);
      expect(settled.provenance.provider).toBe('anthropic-haiku-4.5');
    }
    expect(seen).toEqual(['extracting', 'Claude Haiku 4.5']);
    dismissJob(id);
  });

  it('maps a typed preprocessor refusal to the unreadable phase', async () => {
    const id = startFilingJob({
      companyId: 'c',
      fileName: 'scan.pdf',
      bytes,
      deps: {
        preprocess: async () => ({ ok: false, reason: 'scanned_document', pageCount: 40 }),
        ladderPlan: () => ({ chosen: [], remaining: [] }),
        extract: async () => success
      }
    });
    await jobSettled(id);

    const settled = getJob(id);
    expect(settled?.phase).toBe('unreadable');
    if (settled?.phase === 'unreadable') expect(settled.reason).toBe('scanned_document');
    dismissJob(id);
  });

  it('speaks a failed walk plainly and offers the tail, which retry then spends', async () => {
    const failed: LadderOutcome = {
      ok: false,
      attempts: [
        {
          rungId: 'gemini-2.5-flash',
          model: 'gemini-2.5-flash',
          repaired: false,
          failure: { kind: 'server', detail: 'the provider answered 500' }
        }
      ]
    };
    let walks = 0;
    const id = startFilingJob({
      companyId: 'c',
      fileName: 'AR2024.pdf',
      bytes,
      deps: {
        preprocess: okPreprocess,
        ladderPlan: () => ({
          chosen: [rung('gemini-2.5-flash')],
          remaining: [rung('anthropic-haiku-4.5'), rung('anthropic-sonnet-5')]
        }),
        extract: async () => {
          walks += 1;
          return walks === 1 ? failed : success;
        }
      }
    });
    await jobSettled(id);

    const after = getJob(id);
    expect(after?.phase).toBe('failed');
    if (after?.phase === 'failed') {
      expect(after.detail).toBe('Gemini 2.5 Flash: the provider answered 500');
      expect(after.nextRung?.id).toBe('anthropic-haiku-4.5');
    }

    retryJob(id);
    await jobSettled(id);
    expect(getJob(id)?.phase).toBe('succeeded');
    dismissJob(id);
  });

  it('fails honestly when no keyed rung can carry the document', async () => {
    const id = startFilingJob({
      companyId: 'c',
      fileName: 'AR2024.pdf',
      bytes,
      deps: {
        preprocess: okPreprocess,
        ladderPlan: () => ({ chosen: [], remaining: [] }),
        extract: async () => success
      }
    });
    await jobSettled(id);

    const settled = getJob(id);
    expect(settled?.phase).toBe('failed');
    if (settled?.phase === 'failed') {
      expect(settled.detail).toBe('No usable model rung: no key covers this document.');
      expect(settled.nextRung).toBeNull();
    }
    dismissJob(id);
  });

  it('offers the tail when only the picked provider cannot carry the document', async () => {
    const id = startFilingJob({
      companyId: 'c',
      fileName: 'AR2024.pdf',
      bytes,
      deps: {
        preprocess: okPreprocess,
        ladderPlan: () => ({ chosen: [], remaining: [rung('anthropic-haiku-4.5')] }),
        extract: async () => success
      }
    });
    await jobSettled(id);

    const settled = getJob(id);
    expect(settled?.phase).toBe('failed');
    if (settled?.phase === 'failed') expect(settled.nextRung?.id).toBe('anthropic-haiku-4.5');

    retryJob(id);
    await jobSettled(id);
    expect(getJob(id)?.phase).toBe('succeeded');
    dismissJob(id);
  });
});
