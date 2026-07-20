// @vitest-environment jsdom

// Extraction review mode (frontend spec §3): the banner, the pinned
// confidence bands, the mandatory low-confidence confirmations gating Save,
// the live gates marking fields, and the save that writes statements with
// per-field extraction provenance.
import 'fake-indexeddb/auto';
import { REGISTRY, type LadderOutcome } from '@plainsight/extraction-core';
import { createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createCompany, db, setMeta, type CompanyRecord } from '../../db';
import { routeTree } from '../../routeTree.gen';
import { dismissJob, startFilingJob, jobSettled, type JobDeps } from './jobStore';

beforeEach(async () => {
  await db.delete();
  await db.open();
  await setMeta(db, 'onboardingDone', true);
});

const seedCompany = (): Promise<CompanyRecord> =>
  createCompany(db, { name: 'CSL', ticker: 'CSL', currency: 'AUD' });

function renderAt(path: string) {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] })
  });
  render(<RouterProvider router={router} />);
  return router;
}

const outcome: LadderOutcome = {
  ok: true,
  result: {
    years: [
      {
        fy: 'FY2024',
        endDate: '2024-06-30',
        currency: 'AUD',
        scale: 'millions',
        fields: {
          revenue: { value: 44_189, page: 84, confidence: 0.97 },
          costOfRevenue: { value: 30_000, confidence: 0.82 },
          netIncome: { value: 2_557, confidence: 0.55 },
          interestExpense: { notPrinted: true, confidence: 0.93 },
          totalAssets: { value: 27_000, confidence: 0.96 },
          totalLiabilities: { value: 17_000, confidence: 0.96 },
          totalEquity: { value: 10_000, confidence: 0.96 }
        }
      }
    ],
    warnings: ['FY2023 was restated in this report.']
  },
  provenance: { provider: 'anthropic-haiku-4.5', model: 'm', promptVersion: 'v3' },
  attempts: [{ rungId: 'anthropic-haiku-4.5', model: 'm', repaired: false }]
};

const haiku = REGISTRY.find((entry) => entry.id === 'anthropic-haiku-4.5');
if (haiku === undefined) throw new Error('registry lost its haiku rung');

const deps: JobDeps = {
  preprocess: async () => ({
    ok: true,
    document: { sections: [{ page: 84, text: 'the income statement' }] },
    needsVision: false,
    window: { from: 84, to: 84 },
    pageCount: 180
  }),
  ladderPlan: () => ({ chosen: [haiku], remaining: [] }),
  extract: async () => outcome,
  makePageRenderer: async () => ({
    render: async () => 'data:image/png;base64,QQ==',
    destroy: () => undefined
  })
};

async function openReview(company: CompanyRecord, jobDeps: JobDeps = deps) {
  const id = startFilingJob({
    companyId: company.id,
    fileName: 'AR2024.pdf',
    bytes: new Uint8Array([1]),
    deps: jobDeps
  });
  await jobSettled(id);
  const router = renderAt(`/company/${company.id}/entry?job=${id}`);
  await screen.findByText(/Review before saving/);
  return { id, router };
}

describe('extraction review mode', () => {
  it('wears the banner, the warning, and the prefilled grid', async () => {
    const company = await seedCompany();
    const { id } = await openReview(company);

    expect(screen.getByText('AR2024.pdf')).toBeVisible();
    expect(screen.getByText('Claude Haiku 4.5')).toBeVisible();
    expect(screen.getByText('FY2023 was restated in this report.')).toBeVisible();
    expect(screen.getByLabelText('Revenue, FY2024')).toHaveValue('44,189');
    dismissJob(id);
  });

  it('gates Save on the low-confidence confirmation, spoken plainly', async () => {
    const company = await seedCompany();
    const { id } = await openReview(company);

    const save = screen.getByRole('button', { name: 'Save to the library' });
    expect(save).toBeDisabled();
    expect(screen.getByText(/1 low-confidence figure needs confirming/)).toBeVisible();

    fireEvent.click(
      screen.getByRole('button', { name: /Confirm Net income, FY2024, read at 55% confidence/ })
    );
    await waitFor(() => expect(save).toBeEnabled());
    dismissJob(id);
  });

  it('accepts the high band in one action', async () => {
    const company = await seedCompany();
    const { id } = await openReview(company);

    fireEvent.click(screen.getByRole('button', { name: 'Accept all ≥ 90%' }));
    // Revenue (0.97) now wears its tick; the amber 0.82 keeps its number.
    expect((await screen.findAllByText('✓ confirmed')).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole('button', { name: /Accept Cost of revenue, FY2024/ })).toBeVisible();
    dismissJob(id);
  });

  it('keeps a not-printed claim empty until the reviewer asserts it themselves', async () => {
    const company = await seedCompany();
    const { id } = await openReview(company);

    // The claim surfaces as a hint beside an empty cell, never as a value
    // (data-model spec §8: only the user asserts not-reported-zero).
    expect(screen.getByText(/reads 1 line as not printed/)).toBeVisible();
    expect(screen.getByText('not printed, per the model')).toBeVisible();
    expect(screen.getByLabelText('Interest expense, FY2024')).toHaveValue('');

    // The reviewer agrees, through the cell's own menu: the assertion is
    // now theirs, shown as the not-reported chip.
    fireEvent.click(screen.getByRole('button', { name: 'Interest expense, FY2024, options' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Not reported → 0' }));
    expect(
      screen.getByRole('button', {
        name: 'Interest expense, FY2024, not reported, counted as zero'
      })
    ).toBeVisible();

    // Saved, the figure is the user's own: stored as not-reported-zero with
    // no per-field extraction provenance.
    fireEvent.click(screen.getByRole('button', { name: /Confirm Net income, FY2024/ }));
    const save = screen.getByRole('button', { name: 'Save to the library' });
    await waitFor(() => expect(save).toBeEnabled());
    fireEvent.click(save);
    await waitFor(async () => {
      const income = (await db.statements.where('companyId').equals(company.id).toArray()).find(
        (row) => row.statement === 'income'
      );
      expect(income?.values.interestExpense).toEqual({ kind: 'not_reported_zero' });
      expect(income?.provenance.extraction?.fields?.interestExpense).toBeUndefined();
    });
    dismissJob(id);
  });

  it('saves nothing at all for an unasserted not-printed claim', async () => {
    const company = await seedCompany();
    const { id } = await openReview(company);

    fireEvent.click(screen.getByRole('button', { name: /Confirm Net income, FY2024/ }));
    const save = screen.getByRole('button', { name: 'Save to the library' });
    await waitFor(() => expect(save).toBeEnabled());
    fireEvent.click(save);

    await waitFor(async () => {
      const income = (await db.statements.where('companyId').equals(company.id).toArray()).find(
        (row) => row.statement === 'income'
      );
      expect(income).toBeDefined();
      expect(income?.values.interestExpense).toBeUndefined();
    });
    dismissJob(id);
  });

  it('marks a broken identity on its fields and blocks Save until it holds', async () => {
    const company = await seedCompany();
    const { id } = await openReview(company);

    fireEvent.click(
      screen.getByRole('button', { name: /Confirm Net income, FY2024/ })
    );
    const save = screen.getByRole('button', { name: 'Save to the library' });
    await waitFor(() => expect(save).toBeEnabled());

    // Balance segment: overtype equity so assets stop cross-footing.
    fireEvent.click(screen.getByRole('radio', { name: 'Balance' }));
    const equity = screen.getByLabelText('Total equity, FY2024');
    fireEvent.change(equity, { target: { value: '1' } });
    fireEvent.blur(equity);

    await waitFor(() =>
      expect(screen.getByText(/assets do not equal liabilities plus equity/)).toBeVisible()
    );
    expect(save).toBeDisabled();

    fireEvent.change(equity, { target: { value: '10,000' } });
    fireEvent.blur(equity);
    await waitFor(() => expect(save).toBeEnabled());
    dismissJob(id);
  });

  it('saves statements carrying per-field extraction provenance, then hands the layout back', async () => {
    const company = await seedCompany();
    const { router } = await openReview(company);

    fireEvent.click(
      screen.getByRole('button', { name: /Confirm Net income, FY2024/ })
    );
    const save = screen.getByRole('button', { name: 'Save to the library' });
    await waitFor(() => expect(save).toBeEnabled());
    fireEvent.click(save);

    await waitFor(async () => {
      const rows = await db.statements.where('companyId').equals(company.id).toArray();
      expect(rows.map((row) => row.statement).sort()).toEqual(['balance', 'income']);
    });
    const income = (await db.statements.where('companyId').equals(company.id).toArray()).find(
      (row) => row.statement === 'income'
    );
    expect(income?.values.revenue).toEqual({ kind: 'entered', amountMinor: 4_418_900_000_000 });
    expect(income?.provenance.source).toBe('user_upload');
    expect(income?.provenance.extraction?.fields?.revenue).toEqual({
      confidence: 0.97,
      page: 84
    });
    await waitFor(() => expect(router.state.location.search).toEqual({}));
    // The plain entry grid is back, holding the saved figures.
    expect(await screen.findByRole('button', { name: 'Add a year' })).toBeVisible();
  });

  it('peeks the source page a field names, beside the grid and beneath the field', async () => {
    const company = await seedCompany();
    const { id } = await openReview(company);

    fireEvent.click(
      screen.getByRole('button', { name: 'Show source page 84 for Revenue, FY2024' })
    );

    // Both renderings mount; the media split shows the side pane on wide
    // screens and the per-field row on narrow ones.
    expect(await screen.findAllByRole('img', { name: 'Page 84 of AR2024.pdf' })).toHaveLength(2);
    // The per-field peek sits inside the grid, beneath the row that named it.
    expect(
      within(screen.getByRole('table')).getByRole('img', { name: 'Page 84 of AR2024.pdf' })
    ).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: 'Close the source peek' })[0]!);
    expect(screen.queryAllByRole('img', { name: 'Page 84 of AR2024.pdf' })).toHaveLength(0);
    dismissJob(id);
  });

  it('says so in words when the page cannot be rendered', async () => {
    const company = await seedCompany();
    const { makePageRenderer: _none, ...bare } = deps;
    const { id } = await openReview(company, bare);

    fireEvent.click(
      screen.getByRole('button', { name: 'Show source page 84 for Revenue, FY2024' })
    );

    expect(await screen.findAllByText(/could not be rendered from the PDF/)).toHaveLength(2);
    dismissJob(id);
  });

  it('a save that dies midway stores nothing, exactly as the banner claims', async () => {
    const company = await seedCompany();
    const { id } = await openReview(company);

    fireEvent.click(screen.getByRole('button', { name: /Confirm Net income, FY2024/ }));
    const save = screen.getByRole('button', { name: 'Save to the library' });
    await waitFor(() => expect(save).toBeEnabled());

    // The income statement writes first, then the balance write dies: the
    // one-transaction save must take the income rows down with it.
    const original = db.statements.put.bind(db.statements);
    const spy = vi
      .spyOn(db.statements, 'put')
      .mockImplementationOnce(original)
      .mockImplementationOnce(() => {
        throw new Error('storage gave out');
      });
    fireEvent.click(save);

    expect(await screen.findByText('Could not save. Nothing was stored.')).toBeVisible();
    spy.mockRestore();
    expect(await db.statements.where('companyId').equals(company.id).count()).toBe(0);
    // The company version never bumped either: no memoised metric can go stale.
    expect((await db.companies.get(company.id))?.dataVersion).toBe(0);
    dismissJob(id);
  });

  it('discards only through the armed second step', async () => {
    const company = await seedCompany();
    const { router } = await openReview(company);

    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
    expect(screen.getByRole('button', { name: 'Keep reviewing' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Discard the extraction' }));

    await waitFor(() => expect(router.state.location.search).toEqual({}));
    expect(await db.statements.where('companyId').equals(company.id).count()).toBe(0);
  });
});
