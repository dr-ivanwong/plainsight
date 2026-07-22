// @vitest-environment jsdom

// The job strip on the entry screen (frontend spec §3): honest stage labels
// in a live region, the plainly-spoken failure with the next rung by name,
// retry walking the tail, and a stale job id degrading to the plain screen.
import 'fake-indexeddb/auto';
import { REGISTRY, type LadderOutcome } from '@plainsight/extraction-core';
import { createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createCompany, db, type CompanyRecord } from '../../db';
import { routeTree } from '../../routeTree.gen';
import { dismissJob, startFilingJob, type JobDeps } from './jobStore';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

afterEach(() => {
  vi.restoreAllMocks();
});

const seedCompany = (): Promise<CompanyRecord> =>
  createCompany(db, { name: 'Wesfarmers', currency: 'AUD' });

function renderAt(path: string) {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] })
  });
  render(<RouterProvider router={router} />);
  return router;
}

const document = { sections: [{ text: 'REVENUE 100' }] };
const okPreprocess: JobDeps['preprocess'] = async () => ({
  ok: true,
  document,
  needsVision: false,
  window: { from: 1, to: 2 },
  pageCount: 8
});

const haiku = REGISTRY.find((entry) => entry.id === 'anthropic-haiku-4.5');
if (haiku === undefined) throw new Error('registry lost its haiku rung');

const success: LadderOutcome = {
  ok: true,
  result: {
    years: [{ fy: 'FY2024', endDate: '2024-06-30', currency: 'AUD', fields: {} }]
  } as never,
  provenance: { provider: 'anthropic-haiku-4.5', model: 'm', promptVersion: 'v' },
  attempts: [{ rungId: 'anthropic-haiku-4.5', model: 'm', repaired: false }]
};

describe('the extraction job strip', () => {
  it('narrates a running job in a live region', async () => {
    const company = await seedCompany();
    const id = startFilingJob({
      companyId: company.id,
      fileName: 'AR2024.pdf',
      bytes: new Uint8Array([1]),
      deps: {
        preprocess: () => new Promise(() => undefined),
        ladderPlan: () => ({ chosen: [], remaining: [] }),
        extract: async () => success
      }
    });
    renderAt(`/company/${company.id}/entry?job=${id}`);

    const strip = await screen.findByRole('status', { name: 'Extraction' });
    expect(strip).toHaveTextContent('Reading pages…');
    dismissJob(id);
  });

  it('speaks a failure plainly, then retry walks the tail to success', async () => {
    const company = await seedCompany();
    let walks = 0;
    const id = startFilingJob({
      companyId: company.id,
      fileName: 'AR2024.pdf',
      bytes: new Uint8Array([1]),
      deps: {
        preprocess: okPreprocess,
        ladderPlan: () => ({
          chosen: [REGISTRY.find((entry) => entry.id === 'gemini-2.5-flash')!],
          remaining: [haiku]
        }),
        extract: async () => {
          walks += 1;
          if (walks === 1) {
            return {
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
          }
          return success;
        }
      }
    });
    renderAt(`/company/${company.id}/entry?job=${id}`);

    expect(
      await screen.findByText('Gemini 2.5 Flash: the provider answered 500')
    ).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Try Claude Haiku 4.5' }));

    // Success hands the layout straight to review mode.
    expect(await screen.findByText(/Review before saving/)).toBeVisible();
    expect(screen.getByText('Claude Haiku 4.5')).toBeVisible();
    dismissJob(id);
  });

  it('dismisses back to the plain entry screen, clearing the address', async () => {
    const company = await seedCompany();
    const id = startFilingJob({
      companyId: company.id,
      fileName: 'scan.pdf',
      bytes: new Uint8Array([1]),
      deps: {
        preprocess: async () => ({ ok: false, reason: 'scanned_document', pageCount: 3 }),
        ladderPlan: () => ({ chosen: [], remaining: [] }),
        extract: async () => success
      }
    });
    const router = renderAt(`/company/${company.id}/entry?job=${id}`);

    expect(await screen.findByText(/scan with no text layer/)).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));

    await waitFor(() =>
      expect(screen.queryByRole('status', { name: 'Extraction' })).not.toBeInTheDocument()
    );
    expect(router.state.location.search).toEqual({});
  });

  it('degrades a stale job id to the plain entry screen', async () => {
    const company = await seedCompany();
    renderAt(`/company/${company.id}/entry?job=ghost`);

    expect(await screen.findByRole('heading', { name: 'Data entry' })).toBeVisible();
    expect(screen.queryByRole('status', { name: 'Extraction' })).not.toBeInTheDocument();
  });

  it('offers the file import online and the quiet pill offline', async () => {
    const company = await seedCompany();
    renderAt(`/company/${company.id}/entry`);
    expect(await screen.findByRole('button', { name: 'Import a file' })).toBeVisible();
  });

  it('keeps the upload sheet in the address, so closing clears it', async () => {
    const company = await seedCompany();
    const router = renderAt(`/company/${company.id}/entry?upload=1`);

    const sheet = await screen.findByRole('dialog', { name: 'Import a file' });
    expect(sheet).toBeVisible();

    fireEvent.click(within(sheet).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(router.state.location.search).toEqual({}));
    expect(screen.queryByRole('dialog', { name: 'Import a file' })).not.toBeInTheDocument();
  });

  it('hides the file import behind the pill offline', async () => {
    vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(false);
    const company = await seedCompany();
    renderAt(`/company/${company.id}/entry`);

    expect(await screen.findByRole('heading', { name: 'Data entry' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Import a file' })).not.toBeInTheDocument();
    expect(screen.getByText('Offline')).toBeVisible();
  });
});
